import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase-config.js";

const views = {
  overview: document.querySelector("#overview-view"),
  appointments: document.querySelector("#appointments-view"),
  customers: document.querySelector("#customers-view")
};
const statusLabels = ["Planlandı", "Tamamlandı", "İptal"];
const statusClasses = {
  Planlandı: "status-pending",
  Tamamlandı: "status-completed",
  İptal: "status-cancelled"
};
const authScreen = document.querySelector("#auth-screen");
const loginForm = document.querySelector("#login-form");
const passwordSetupForm = document.querySelector("#password-setup-form");
const adminApp = document.querySelector("#admin-app");
const memberPortal = document.querySelector("#member-portal");
const appointmentDialog = document.querySelector("#appointment-dialog");
const sessionForm = document.querySelector("#appointment-form");
const sessionDateInput = sessionForm.elements.date;
const inviteForm = document.querySelector("#invite-member-form");
let supabase;
let currentUser;
let currentProfile;
let members = [];
let sessions = [];
let activeView = "overview";
let activeFilter = "all";
let toastTimer;
let authRequestId = 0;
let passwordSetupRequired = ["invite", "recovery"].includes(
  new URLSearchParams(location.hash.slice(1)).get("type") ||
  new URLSearchParams(location.search).get("type")
);

const localDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function initials(name) {
  return String(name || "").trim().split(/\s+/).slice(0, 2)
    .map((part) => part[0] || "").join("").toLocaleUpperCase("tr");
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  }).format(new Date(value));
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 3200);
}

function setFormError(id, message) {
  const element = document.querySelector(`#${id}`);
  element.textContent = message;
  element.hidden = !message;
}

function showAuthError(message) {
  loginForm.hidden = false;
  passwordSetupForm.hidden = true;
  document.querySelector("#auth-heading").textContent = "Hesabına giriş yap";
  document.querySelector("#auth-subtitle").textContent = "Seanslarını ve salon bilgilerini görüntülemek için giriş yap.";
  setFormError("login-error", message);
  authScreen.hidden = false;
  adminApp.hidden = true;
  memberPortal.hidden = true;
  document.querySelector("#auth-sign-out").hidden = !currentUser;
}

function setLoading(button, isLoading, loadingText) {
  if (!button.dataset.defaultText) button.dataset.defaultText = button.textContent.trim();
  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : button.dataset.defaultText;
}

function showPasswordSetup() {
  authScreen.hidden = false;
  adminApp.hidden = true;
  memberPortal.hidden = true;
  loginForm.hidden = true;
  passwordSetupForm.hidden = false;
  document.querySelector("#auth-sign-out").hidden = false;
  document.querySelector("#auth-heading").textContent = "Şifreni belirle";
  document.querySelector("#auth-subtitle").textContent = "Hesabını etkinleştirmek için yeni bir şifre oluştur.";
}

function showLogin() {
  authScreen.hidden = false;
  adminApp.hidden = true;
  memberPortal.hidden = true;
  loginForm.hidden = false;
  passwordSetupForm.hidden = true;
  document.querySelector("#auth-sign-out").hidden = true;
  document.querySelector("#auth-heading").textContent = "Hesabına giriş yap";
  document.querySelector("#auth-subtitle").textContent = "Seanslarını ve salon bilgilerini görüntülemek için giriş yap.";
}

function showAdminApp() {
  authScreen.hidden = true;
  adminApp.hidden = false;
  memberPortal.hidden = true;
}

function showMemberPortal() {
  authScreen.hidden = true;
  adminApp.hidden = true;
  memberPortal.hidden = false;
}

function isSupabaseConfigured() {
  try {
    return SUPABASE_URL.startsWith("https://") &&
      !SUPABASE_URL.includes("YOUR-PROJECT") &&
      SUPABASE_ANON_KEY.length > 20 &&
      !SUPABASE_ANON_KEY.includes("YOUR-ANON-KEY");
  } catch {
    return false;
  }
}

async function loadAdminData() {
  const [membersResult, sessionsResult] = await Promise.all([
    supabase.from("profiles")
      .select("id,email,full_name,phone,role")
      .eq("role", "member")
      .order("full_name"),
    supabase.from("training_sessions")
      .select("id,member_id,workout_type,scheduled_at,status,member:profiles!training_sessions_member_id_fkey(id,full_name,phone)")
      .order("scheduled_at", { ascending: true })
  ]);
  if (membersResult.error) throw membersResult.error;
  if (sessionsResult.error) throw sessionsResult.error;
  members = membersResult.data || [];
  sessions = sessionsResult.data || [];
  renderAdmin();
}

async function refreshAdminData(failureMessage) {
  try {
    await loadAdminData();
    return true;
  } catch (error) {
    console.error("Yönetim verileri yenilenemedi:", error);
    showToast(failureMessage);
    return false;
  }
}

function renderSessionRow(session, index) {
  const member = session.member || {};
  const name = escapeHtml(member.full_name || "Üye");
  const phone = escapeHtml(member.phone || "");
  const options = statusLabels.map((status) =>
    `<option value="${status}" ${status === session.status ? "selected" : ""}>${status}</option>`
  ).join("");
  return `<tr>
    <td><div class="customer-cell"><span class="customer-avatar color-${index % 4}">${escapeHtml(initials(member.full_name))}</span><span class="customer-name">${name}<small>${phone}</small></span></div></td>
    <td>${escapeHtml(session.workout_type)}</td>
    <td class="date-cell">${formatDateTime(session.scheduled_at)}</td>
    <td><select class="status-select ${statusClasses[session.status]}" data-status-id="${escapeHtml(session.id)}" data-previous-status="${escapeHtml(session.status)}" aria-label="${name} seans durumu">${options}</select></td>
  </tr>`;
}

function renderAdmin() {
  const today = localDateString(new Date());
  const currentTime = new Date();
  const upcomingSessions = sessions.filter((session) =>
    session.status === "Planlandı" && new Date(session.scheduled_at) >= currentTime
  ).slice(0, 5);
  const search = document.querySelector("#appointment-search").value.trim().toLocaleLowerCase("tr");
  const filteredSessions = sessions.filter((session) => {
    const matchesStatus = activeFilter === "all" || session.status === activeFilter;
    const member = members.find((item) => item.id === session.member_id);
    const searchable = `${member?.full_name || ""} ${member?.email || ""} ${session.workout_type}`.toLocaleLowerCase("tr");
    return matchesStatus && searchable.includes(search);
  });
  const todayCount = sessions.filter((session) =>
    localDateString(new Date(session.scheduled_at)) === today && session.status !== "İptal"
  ).length;

  document.querySelector("#today-count").textContent = String(todayCount);
  document.querySelector("#pending-count").textContent = String(sessions.filter((session) => session.status === "Planlandı").length);
  document.querySelector("#customer-count").textContent = String(members.length);
  document.querySelector("#upcoming-table").innerHTML = upcomingSessions.map(renderSessionRow).join("");
  document.querySelector("#appointments-table").innerHTML = filteredSessions.map(renderSessionRow).join("");
  document.querySelector("#overview-empty").hidden = upcomingSessions.length > 0;
  document.querySelector("#appointments-empty").hidden = filteredSessions.length > 0;
  document.querySelector("#customer-list-summary").textContent = `${members.length} üye kayıtlı`;
  document.querySelector("#today-label").textContent = new Intl.DateTimeFormat("tr-TR", {
    weekday: "long", day: "numeric", month: "long"
  }).format(new Date());
  document.querySelector("#admin-name").textContent = currentProfile.full_name || "Salon yöneticisi";
  document.querySelector("#admin-email").textContent = currentUser.email || "";
  document.querySelector("#customer-list").innerHTML = renderMembers();
  document.querySelector("#customers-empty").hidden = members.length > 0;
  document.querySelector("#session-member-select").innerHTML = members.length
    ? `<option value="">Üye seç</option>${members.map((member) =>
      `<option value="${escapeHtml(member.id)}">${escapeHtml(member.full_name)} — ${escapeHtml(member.email)}</option>`
    ).join("")}`
    : '<option value="">Önce üye ekle</option>';
}

function renderMembers() {
  const search = document.querySelector("#customer-search").value.trim().toLocaleLowerCase("tr");
  return members.filter((member) =>
    `${member.full_name} ${member.email} ${member.phone || ""}`.toLocaleLowerCase("tr").includes(search)
  ).map((member, index) => {
    const sessionCount = sessions.filter((session) => session.member_id === member.id).length;
    return `<article class="customer-card">
      <span class="customer-avatar color-${index % 4}">${escapeHtml(initials(member.full_name))}</span>
      <div class="customer-card-info"><strong>${escapeHtml(member.full_name)}</strong><span>${escapeHtml(member.email)}</span>${member.phone ? `<span>${escapeHtml(member.phone)}</span>` : ""}</div>
      <span class="customer-appointments">${sessionCount} seans</span>
      <button class="customer-delete-button" type="button" data-delete-member="${escapeHtml(member.id)}" aria-label="${escapeHtml(member.full_name)} üyesini sil">Sil</button>
    </article>`;
  }).join("");
}

function showView(viewName) {
  if (!views[viewName]) return;
  activeView = viewName;
  Object.entries(views).forEach(([name, element]) => { element.hidden = name !== viewName; });
  document.querySelectorAll(".nav-item").forEach((button) => {
    const selected = button.dataset.view === viewName;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-current", selected ? "page" : "false");
  });
  document.querySelector("#breadcrumb-current").textContent = {
    overview: "Genel bakış", appointments: "Seanslar", customers: "Üyeler"
  }[viewName];
}

async function loadMemberSessions() {
  document.querySelector("#member-name").textContent = currentProfile.full_name || "üyemiz";
  const { data, error } = await supabase.from("training_sessions")
    .select("id,workout_type,scheduled_at,status")
    .eq("member_id", currentUser.id)
    .order("scheduled_at", { ascending: false });
  if (error) throw error;
  const ownSessions = data || [];
  document.querySelector("#member-session-summary").textContent = `${ownSessions.length} seans`;
  document.querySelector("#member-sessions-table").innerHTML = ownSessions.map((session) => `
    <tr>
      <td>${escapeHtml(session.workout_type)}</td>
      <td class="date-cell">${formatDateTime(session.scheduled_at)}</td>
      <td><span class="status-badge ${statusClasses[session.status]}">${escapeHtml(session.status)}</span></td>
    </tr>
  `).join("");
  document.querySelector("#member-sessions-empty").hidden = ownSessions.length > 0;
}

async function handleSession(session) {
  const requestId = ++authRequestId;
  if (!session) {
    currentUser = null;
    currentProfile = null;
    adminApp.hidden = true;
    memberPortal.hidden = true;
    showLogin();
    return;
  }
  currentUser = session.user;
  if (passwordSetupRequired) {
    showPasswordSetup();
    return;
  }
  const { data: profile, error } = await supabase.from("profiles")
    .select("id,email,full_name,phone,role")
    .eq("id", currentUser.id)
    .single();
  if (requestId !== authRequestId) return;
  if (error) {
    console.error("Profil bilgisi yüklenemedi:", error);
    showAuthError("Hesap bilgilerine erişilemedi. Salon yöneticinle iletişime geç.");
    return;
  }
  currentProfile = profile;
  try {
    if (profile.role === "admin") {
      showAdminApp();
      await loadAdminData();
    } else if (profile.role === "member") {
      showMemberPortal();
      await loadMemberSessions();
    } else {
      showAuthError("Bu hesap için salon rolü tanımlanmamış.");
    }
  } catch (error) {
    console.error("Hesap verileri yüklenemedi:", error);
    showToast("Veriler yüklenemedi. Bağlantını kontrol edip sayfayı yenile.");
  }
}

function bindApplicationEvents() {
  sessionDateInput.min = localDateString(new Date());
  sessionDateInput.value = localDateString(new Date());

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
  document.querySelectorAll("[data-view-link]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.viewLink));
  });
  document.querySelectorAll("[data-open-modal]").forEach((button) => {
    button.addEventListener("click", () => {
      setFormError("form-error", "");
      appointmentDialog.showModal();
      sessionForm.elements.member_id.focus();
    });
  });
  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => appointmentDialog.close());
  });
  appointmentDialog.addEventListener("click", (event) => {
    if (event.target === appointmentDialog) appointmentDialog.close();
  });
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((tab) => tab.classList.toggle("is-selected", tab === button));
      renderAdmin();
    });
  });
  document.querySelector("#appointment-search").addEventListener("input", renderAdmin);
  document.querySelector("#customer-search").addEventListener("input", () => {
    document.querySelector("#customer-list").innerHTML = renderMembers();
  });
  document.querySelector("#customer-list").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-member]");
    if (!button) return;
    const member = members.find((item) => item.id === button.dataset.deleteMember);
    if (!member) {
      showToast("Üye bulunamadı. Listeyi yenileyip tekrar deneyin.");
      return;
    }
    const sessionCount = sessions.filter((session) => session.member_id === member.id).length;
    const confirmed = window.confirm(
      `${member.full_name} adlı üyeyi kalıcı olarak silmek istiyor musunuz?` +
      ` Bu işlem üyelik bilgilerini ve ${sessionCount} seans kaydını geri alınamaz şekilde siler.`
    );
    if (!confirmed) return;

    button.disabled = true;
    button.textContent = "Siliniyor...";
    try {
      const { error } = await supabase.functions.invoke("delete-member", {
        body: { member_id: member.id }
      });
      if (error) throw error;
      const refreshed = await refreshAdminData("Üye silindi ancak liste yenilenemedi.");
      showToast(refreshed ? "Üye ve seans kayıtları silindi." : "Üye silindi; listeyi yenilemek için sayfayı yenileyin.");
    } catch (error) {
      console.error("Üye silinemedi:", error);
      button.disabled = false;
      button.textContent = "Sil";
      showToast("Üye silinemedi. Bağlantıyı ve yönetici yetkisini kontrol edip tekrar deneyin.");
    }
  });
  document.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-status-id]");
    if (!select) return;
    try {
      const { error } = await supabase.from("training_sessions")
        .update({ status: select.value })
        .eq("id", select.dataset.statusId);
      if (error) throw error;
      const refreshed = await refreshAdminData("Seans durumu kaydedildi ancak liste yenilenemedi.");
      showToast(refreshed ? "Seans durumu güncellendi." : "Seans güncellendi; listeyi yenilemek için sayfayı yenile.");
    } catch (error) {
      console.error("Seans durumu güncellenemedi:", error);
      select.value = select.dataset.previousStatus;
      select.className = `status-select ${statusClasses[select.dataset.previousStatus]}`;
      showToast("Seans güncellenemedi. Tekrar deneyebilir misin?");
    }
  });

  sessionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!sessionForm.reportValidity()) return;
    const values = new FormData(sessionForm);
    const scheduledAt = new Date(`${values.get("date")}T${values.get("time")}`);
    const submitButton = sessionForm.querySelector('[type="submit"]');
    setLoading(submitButton, true, "Planlanıyor...");
    try {
      const { error } = await supabase.from("training_sessions").insert({
        member_id: String(values.get("member_id")),
        workout_type: String(values.get("service")).trim(),
        scheduled_at: scheduledAt.toISOString(),
        status: "Planlandı",
        created_by: currentUser.id
      });
      if (error) throw error;
      sessionForm.reset();
      sessionDateInput.value = localDateString(new Date());
      appointmentDialog.close();
      const refreshed = await refreshAdminData("Seans kaydedildi ancak liste yenilenemedi.");
      showToast(refreshed ? "Antrenman seansı planlandı." : "Seans kaydedildi; listeyi yenilemek için sayfayı yenile.");
    } catch (error) {
      console.error("Seans planlanamadı:", error);
      setFormError("form-error", "Seans kaydedilemedi. Bilgileri ve bağlantını kontrol et.");
    } finally {
      setLoading(submitButton, false);
    }
  });

  inviteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!inviteForm.reportValidity()) return;
    const values = new FormData(inviteForm);
    const submitButton = inviteForm.querySelector('[type="submit"]');
    setLoading(submitButton, true, "Davet gönderiliyor...");
    setFormError("invite-error", "");
    try {
      const { error } = await supabase.functions.invoke("invite-member", {
        body: {
          full_name: String(values.get("full_name")).trim(),
          email: String(values.get("email")).trim(),
          phone: String(values.get("phone")).trim()
        }
      });
      if (error) throw error;
      inviteForm.reset();
      const refreshed = await refreshAdminData("Üye davet edildi ancak liste yenilenemedi.");
      showToast(refreshed
        ? "Üye kaydedildi; giriş bağlantısı e-postasına gönderildi."
        : "Üye davet edildi; listeyi yenilemek için sayfayı yenile.");
    } catch (error) {
      console.error("Üye daveti gönderilemedi:", error);
      setFormError("invite-error", "Davet gönderilemedi. E-posta adresini kontrol et veya daha sonra tekrar dene.");
    } finally {
      setLoading(submitButton, false);
    }
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(loginForm);
    const submitButton = loginForm.querySelector('[type="submit"]');
    setLoading(submitButton, true, "Giriş yapılıyor...");
    setFormError("login-error", "");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: String(values.get("email")).trim(),
        password: String(values.get("password"))
      });
      if (error) setFormError("login-error", "Giriş yapılamadı. E-posta ve şifreni kontrol et.");
    } catch (error) {
      console.error("Oturum açılamadı:", error);
      setFormError("login-error", "Giriş servisine bağlanılamadı. Tekrar deneyebilir misin?");
    } finally {
      setLoading(submitButton, false);
    }
  });

  document.querySelector("#forgot-password").addEventListener("click", async () => {
    const email = String(loginForm.elements.email.value).trim();
    if (!email) {
      setFormError("login-error", "Şifre sıfırlama bağlantısı için önce e-posta adresini yaz.");
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (error) throw error;
      setFormError("login-error", "Şifre sıfırlama bağlantısı e-posta adresine gönderildi.");
    } catch (error) {
      console.error("Şifre sıfırlama e-postası gönderilemedi:", error);
      setFormError("login-error", "Şifre sıfırlama e-postası gönderilemedi. Daha sonra tekrar dene.");
    }
  });

  passwordSetupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(passwordSetupForm);
    const password = String(values.get("password"));
    if (password !== String(values.get("confirm_password"))) {
      setFormError("password-error", "Şifreler birbiriyle eşleşmiyor.");
      return;
    }
    const submitButton = passwordSetupForm.querySelector('[type="submit"]');
    setLoading(submitButton, true, "Kaydediliyor...");
    setFormError("password-error", "");
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    } catch (error) {
      console.error("Üye şifresi ayarlanamadı:", error);
      setFormError("password-error", "Şifre kaydedilemedi. Bağlantını kontrol edip tekrar dene.");
      return;
    } finally {
      setLoading(submitButton, false);
    }
    passwordSetupRequired = false;
    history.replaceState(null, "", location.pathname);
    passwordSetupForm.reset();
    showToast("Şifren oluşturuldu.");
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error("Oturum bilgisi okunamadı:", sessionError);
      showLogin();
      return;
    }
    await handleSession(data.session);
  });

  document.querySelectorAll("[data-sign-out], #auth-sign-out").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      } catch (error) {
        console.error("Oturum kapatılamadı:", error);
        showToast("Çıkış yapılamadı. Tekrar deneyebilir misin?");
      }
    });
  });
}

async function initialize() {
  bindApplicationEvents();
  if (!isSupabaseConfigured()) {
    document.querySelector("#setup-notice").hidden = false;
    loginForm.querySelectorAll("input,button").forEach((element) => { element.disabled = true; });
    return;
  }
  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
    });
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    await handleSession(data.session);
    supabase.auth.onAuthStateChange((_event, session) => {
      void handleSession(session);
    });
  } catch (error) {
    console.error("Supabase başlatılamadı:", error);
    showAuthError("Giriş servisine bağlanılamadı. Supabase ayarlarını ve internet bağlantını kontrol et.");
  }
}

initialize();

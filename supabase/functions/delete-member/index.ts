import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return respond({ error: "Method not allowed" }, 405);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return respond({ error: "Authentication required" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Required Supabase function environment variables are missing.");
    return respond({ error: "Service configuration error" }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return respond({ error: "Authentication required" }, 401);
  }

  const { data: profile, error: profileError } = await userClient
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (profileError || profile?.role !== "admin") {
    return respond({ error: "Administrator access required" }, 403);
  }

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return respond({ error: "Invalid JSON body" }, 400);
  }
  if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
    return respond({ error: "Invalid request body" }, 400);
  }
  const input = parsedBody as Record<string, unknown>;
  const memberId = typeof input.member_id === "string" ? input.member_id : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memberId)) {
    return respond({ error: "A valid member ID is required" }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: member, error: memberError } = await adminClient
    .from("profiles")
    .select("id,role")
    .eq("id", memberId)
    .maybeSingle();
  if (memberError) {
    console.error("Member lookup failed:", memberError.message);
    return respond({ error: "Member could not be verified" }, 500);
  }
  if (!member || member.role !== "member") {
    return respond({ error: "Member not found" }, 404);
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(memberId);
  if (deleteError) {
    console.error("Supabase member deletion failed:", deleteError.message);
    return respond({ error: "Member could not be deleted" }, 500);
  }

  return respond({ deleted: true, member_id: memberId });
});

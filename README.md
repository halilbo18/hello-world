# Salonun

Spor salonları için üyelerin oturum açabildiği ve salon yöneticisinin üyeleri
davet edip antrenman seansı planlayabildiği web uygulaması. Kimlik doğrulama ve
kalıcı kayıtlar Supabase Auth ve PostgreSQL kullanır.

## Roller

- **Salon yöneticisi:** Üyeleri e-posta davetiyle kaydeder, seans planlar ve
  seans durumlarını günceller; üyeleri ve onlara bağlı seans kayıtlarını kalıcı
  olarak silebilir.
- **Üye:** Davet e-postasındaki bağlantıyla şifresini belirler, giriş yapar ve
  yalnızca kendi seanslarını görür.

## Mevcut Supabase projesi

Uygulama `Salonun` adlı Supabase projesine bağlıdır. Proje URL'si ve publishable key
`supabase-config.js` dosyasındadır; publishable key tarayıcıda kullanılmak
içindir ve RLS kurallarının yerini tutmaz.

Supabase veritabanında üye profilleri, seans tabloları ve Row Level Security
kuralları kuruldu. `invite-member` ve `delete-member` Edge Function'ları
yayımlandı; yalnızca `admin` rolündeki oturum açmış kullanıcılar üye davet
edebilir veya üyeyi silebilir. Üye silme işlemi profil ve seans kayıtlarını
geri alınamaz şekilde siler. Herkese açık kullanıcı kaydına izin verilmez.

## Yeni ortam kurmak veya güncellemek

Bu projeyi başka bir Supabase ortamına dağıtırken:

1. Supabase projesi oluştur.
2. Supabase CLI ile veritabanı şemasını ve davet fonksiyonunu yayımla:

   ```sh
   supabase login
   supabase link --project-ref PROJE_REF
   supabase db push
   supabase functions deploy invite-member
   supabase functions deploy delete-member
   ```

3. Supabase Dashboard > **Project Settings > API** bölümündeki Project URL ve
   `anon`/publishable key değerlerini `supabase-config.js` içine ekle. Bu
   tarayıcı ayarları herkese açıktır; **service-role key'i buraya koyma**.
4. Edge Function, `SUPABASE_URL`, `SUPABASE_ANON_KEY` ve
   `SUPABASE_SERVICE_ROLE_KEY` varsayılan ortam değişkenlerini kullanır. Bunlar
   Supabase tarafından fonksiyona sağlanır; anahtarları kaynak koda ekleme.
5. Authentication ayarlarında uygulamanın HTTPS adresini Site URL ve Redirect
   URLs listesine ekle. Üretimde davet e-postalarının güvenilir şekilde
   gönderilmesi için SMTP sağlayıcısı yapılandır.
6. Supabase Dashboard > **Authentication > Users** bölümünden kendi yönetici
   hesabını davet et. Davet bağlantısını açıp şifreni belirledikten sonra SQL
   Editor'de kendi e-posta adresinle şu tek seferlik rol atamasını çalıştır:

   ```sql
   update public.profiles
   set role = 'admin'
   where email = 'yonetici@ornek.com';
   ```

   Eşleşen kaydın `role` değerinin `admin` olduğunu doğrula, sonra uygulamada
   çıkış yapıp yeniden giriş yap.
7. Authentication ayarlarında herkese açık kullanıcı kaydını kapat. Yeni
   üyeleri uygulamadaki **Üyeler > Yeni üye kaydet** formundan davet et.

Şemadaki Row Level Security kuralları üyelerin yalnızca kendi seanslarını
okumasına izin verir. Yönetici davet ve silme fonksiyonları oturum açmış
kullanıcının `admin` rolünü ayrıca doğrular. İzinler yalnızca arayüzde
gizlenmeye dayanmaz.

## cPanel'e manuel yayın

Mevcut GüzelHosting paylaşımlı hosting hesabı SFTP/SSH ve FTPS/TLS sunmuyor;
yalnızca şifresiz FTP destekliyor. FTP giriş bilgileri şifresiz aktarılacağı
için bu projede otomatik FTP yayını etkinleştirilmez.

Web sitesi dosyalarını güncellemek için yalnızca
`index.html`, `app.js`, `styles.css` ve `supabase-config.js` dosyalarını
cPanel'de sitenin `public_html` klasörüne yükleyip mevcutların üzerine yaz.
Alternatif olarak bu dosyaları ZIP yapıp aynı klasörde çıkar. Supabase
veritabanı ve Edge Function değişiklikleri cPanel'e değil Supabase'e dağıtılır.

## Yerel önizleme ve geçici test adresi

Supabase istemci kitaplığı CDN üzerinden yüklenir; önizleme için internet
bağlantısı gerekir. `index.html` dosyasını doğrudan `file://` ile değil, bir web
sunucusu üzerinden aç:

```sh
python3 -m http.server 8000
```

Ardından `http://localhost:8000` adresini ziyaret et. Üretimde Supabase Site URL
ve Redirect URLs değerleri kalıcı HTTPS domainiyle eşleşmelidir.

## Güvenlik ve dağıtım notları

- `supabase-config.js` içine yalnızca Project URL ve herkese açık anon/publishable
  key konur. Service-role key asla istemciye gönderilmez.
- Üyelerin adı, e-postası ve telefonu kişisel veridir. Üretimde gerçek üye
  verisi kullanmadan önce erişim izinlerini, yedeklemeyi, gizlilik metnini ve
  veri saklama/silme süreçlerini değerlendir.
- Supabase'in e-posta gönderim limitleri varsayılan geliştirme ayarlarında
  sınırlıdır; gerçek kullanımdan önce özel SMTP yapılandır.
- İlk salon yöneticisi hesabı Supabase Auth'tan davet edildi ve `admin` rolü
  verildi. Davet e-postasındaki bağlantıyı açıp parola belirlemediysen, Supabase
  Dashboard'dan bu hesaba parola sıfırlama e-postası gönder.
- Önceki prototipte bu tarayıcıya kaydedilmiş deneme seansları Supabase'e
  otomatik aktarılmaz.

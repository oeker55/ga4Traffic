# GA4 Traffic Panel

Birden fazla GA4 mülkünün son 30 dakikalık trafiğini tek panelde gösteren
Node.js uygulaması.

## Özellikler

- Aktif kullanıcı, sayfa görüntüleme, event ve key event metrikleri
- Çoklu GA4 mülk desteği
- Panelden yeni firma ekleme ve kaldırma
- Yeni firma eklenirken GA4 erişim kontrolü
- 60 saniyelik API önbelleği
- Docker ve ters proxy desteği
- HTTP Basic giriş koruması

## Yerel kurulum

```powershell
npm install
Copy-Item .env.example .env
```

Google service account JSON anahtarını `.env` değişkenlerine aktarmak için:

```powershell
npm run credentials:import -- "C:\secure\service-account.json"
```

Bu komut private key değerini terminale yazdırmaz. Aşağıdaki alanları yalnızca
Git tarafından yok sayılan `.env` dosyasına ekler:

```dotenv
GOOGLE_PROJECT_ID=
GOOGLE_CLIENT_EMAIL=
GOOGLE_PRIVATE_KEY_BASE64=
```

Panel kullanıcı adı ve parolasını `.env` içinde değiştirin, ardından:

```powershell
npm start
```

Varsayılan alt yol:

```text
http://localhost:3000/trafik/
```

Kök adreste çalıştırmak için `APP_BASE_PATH=` bırakılabilir.

## Site yönetimi

Panelde **Site Ekle** düğmesine basıp firma adı ve sayısal GA4 Property ID
değerini girin. Uygulama önce Realtime API erişimini kontrol eder; erişim
başarılıysa firma kalıcı olarak `data/sites.json` dosyasına eklenir.

`G-XXXX` biçimindeki Measurement ID değil, yalnızca rakamlardan oluşan
Property ID kullanılmalıdır.

## Docker

```bash
cp .env.example .env
nano .env
mkdir -p data
sudo chown -R 1000:1000 data
docker compose up -d --build
```

Durum kontrolü:

```bash
docker compose ps
curl http://127.0.0.1:5000/api/health
```

Detaylı sunucu kurulumu için `DEPLOYMENT.md` dosyasına bakın.

## Güvenlik

- `.env`, `data/sites.json` ve servis hesabı JSON dosyaları Git'e eklenmez.
- Public repoya gerçek parola, private key veya müşteri Property ID listesi
  göndermeyin.
- Paneli HTTPS arkasında yayınlayın.
- Uygulama portunu yalnızca ters proxy sunucusuna açın.

## Komutlar

```bash
npm run check
npm run test:access
npm run grant:access -- PROPERTY_ID
```

## Resmî dokümanlar

- https://developers.google.com/analytics/devguides/reporting/data/v1/realtime-basics
- https://developers.google.com/analytics/devguides/reporting/data/v1/realtime-api-schema
- https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1alpha/properties.accessBindings/create

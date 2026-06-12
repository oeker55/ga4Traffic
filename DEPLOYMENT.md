# Docker ile Yayınlama

## 1. Repoyu alın

```bash
cd /opt
git clone https://github.com/oeker55/ga4Traffic.git farktor-canli-trafik
cd farktor-canli-trafik
cp .env.example .env
```

## 2. Ortam değişkenlerini doldurun

`.env` içinde en az şu alanları değiştirin:

```dotenv
PANEL_BIND_IP=0.0.0.0
PANEL_PORT=5000
APP_BASE_PATH=/trafik
PANEL_USERNAME=farktor
PANEL_PASSWORD=GUCLU_VE_BENZERSIZ_PAROLA

GOOGLE_PROJECT_ID=google-cloud-proje-id
GOOGLE_CLIENT_EMAIL=service-account@proje-id.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY_BASE64=BASE64_PRIVATE_KEY
```

Nginx aynı sunucudaysa `PANEL_BIND_IP=127.0.0.1` kullanın. Nginx başka
sunucudaysa `0.0.0.0` kullanın ve güvenlik duvarında port `5000` erişimini
yalnızca Nginx sunucusunun IP adresine izin verecek şekilde sınırlandırın.

Mevcut JSON anahtarından `.env` üretmek için JSON dosyasını geçici olarak
sunucuya yükleyip şu komutu çalıştırabilirsiniz:

```bash
npm run credentials:import -- /tmp/service-account.json
rm /tmp/service-account.json
```

## 3. Kalıcı veri dizini

```bash
mkdir -p data
sudo chown -R 1000:1000 data
sudo chmod 750 data
chmod 600 .env
```

Firma listesi panelden yönetilir ve `data/sites.json` içinde saklanır. Bu
dosya container güncellendiğinde korunur.

## 4. Container

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 trafik-paneli
```

Healthcheck:

```bash
curl http://127.0.0.1:5000/api/health
```

## 5. Nginx

Uygulama sunucusu `APP_SERVER_IP`, port `5000` örneği:

```nginx
location = /trafik {
    return 308 /trafik/;
}

location ^~ /trafik/ {
    proxy_pass http://APP_SERVER_IP:5000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
}
```

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Güncelleme

`data/sites.json` ve `.env` Git dışında kaldığı için güncellemede korunur:

```bash
git pull
docker compose up -d --build
```

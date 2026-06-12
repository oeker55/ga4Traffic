# GA4 Service Account Yetkisini Admin API ile Verme

Bu işlem yalnızca bir kez yapılır. OAuth erişimi, GA4 mülkünde kullanıcı
yönetme yetkisi olan gerçek Google hesabına ait olmalıdır.

Resmî API sayfası:

https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1alpha/properties.accessBindings/create

İstek:

```text
parent: properties/PROPERTY_ID
```

```json
{
  "user": "SERVICE_ACCOUNT_EPOSTASI",
  "roles": ["predefinedRoles/viewer"]
}
```

Toplu işlem için OAuth Playground'da şu scope ile geçici token alın:

```text
https://www.googleapis.com/auth/analytics.manage.users
```

Tokenı terminal geçmişine yazmadan:

```bash
read -s -p "OAuth access token: " GA_ADMIN_ACCESS_TOKEN
echo
export GA_ADMIN_ACCESS_TOKEN
```

Tek mülk:

```bash
docker compose run --rm \
  -e GA_ADMIN_ACCESS_TOKEN \
  trafik-paneli npm run grant:access -- 123456789
```

Tüm kayıtlı mülkler:

```bash
docker compose run --rm \
  -e GA_ADMIN_ACCESS_TOKEN \
  trafik-paneli npm run grant:access -- --all
```

```bash
unset GA_ADMIN_ACCESS_TOKEN
docker compose run --rm trafik-paneli npm run test:access
```

OAuth tokenını `.env` içine veya Git deposuna eklemeyin.

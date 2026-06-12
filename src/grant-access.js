const ADMIN_API_BASE = "https://analyticsadmin.googleapis.com/v1alpha";
const VIEWER_ROLE = "predefinedRoles/viewer";
const accessToken = process.env.GA_ADMIN_ACCESS_TOKEN?.trim();
const serviceAccountEmail =
  process.env.GA_SERVICE_ACCOUNT_EMAIL?.trim() ||
  process.env.GOOGLE_CLIENT_EMAIL?.trim();
const argument = process.argv[2];

if (!accessToken) {
  console.error(
    "GA_ADMIN_ACCESS_TOKEN bulunamadi. OAuth access tokenini ortam degiskeni olarak verin.",
  );
  process.exit(1);
}

if (!serviceAccountEmail) {
  console.error(
    "GOOGLE_CLIENT_EMAIL veya GA_SERVICE_ACCOUNT_EMAIL tanimlanmali.",
  );
  process.exit(1);
}

if (!argument) {
  console.error(
    "Kullanim: npm run grant:access -- PROPERTY_ID veya npm run grant:access -- --all",
  );
  process.exit(1);
}

const {loadSites} = await import("./sites.js");
const configuredSites = await loadSites();

const sites =
  argument === "--all"
    ? configuredSites
    : configuredSites.filter(
        (site) => String(site.propertyId) === String(argument),
      );

if (sites.length === 0) {
  console.error(`Property ID listede bulunamadi: ${argument}`);
  process.exit(1);
}

async function grantViewerAccess(site) {
  const response = await fetch(
    `${ADMIN_API_BASE}/properties/${site.propertyId}/accessBindings`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user: serviceAccountEmail,
        roles: [VIEWER_ROLE],
      }),
    },
  );

  if (response.ok) {
    return {ok: true};
  }

  const error = await response.json().catch(() => ({}));
  const message =
    error?.error?.message || `${response.status} ${response.statusText}`;

  if (
    response.status === 409 ||
    message.toLocaleLowerCase("en-US").includes("already exists")
  ) {
    return {ok: true, alreadyExists: true};
  }

  return {ok: false, status: response.status, message};
}

console.log(`Hedef service account: ${serviceAccountEmail}`);
console.log(`Islem yapilacak mulk sayisi: ${sites.length}\n`);

let successCount = 0;

for (const site of sites) {
  const result = await grantViewerAccess(site);

  if (result.ok) {
    successCount += 1;
    console.log(
      `${result.alreadyExists ? "MEVCUT" : "OK"}  ${site.name} (${site.propertyId})`,
    );
  } else {
    console.log(
      `HATA  ${site.name} (${site.propertyId}) [${result.status}] ${result.message}`,
    );
  }
}

console.log(`\nSonuc: ${successCount}/${sites.length} yetkilendirme basarili.`);

if (successCount !== sites.length) {
  process.exitCode = 1;
}

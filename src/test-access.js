import "dotenv/config";

const {fetchRealtimeSite} = await import("./analytics.js");
const {loadSites} = await import("./sites.js");
const sites = await loadSites();

let successCount = 0;

for (const site of sites) {
  try {
    const result = await fetchRealtimeSite(site);
    successCount += 1;
    console.log(
      `OK    ${site.name.padEnd(18)} aktif: ${result.activeUsers}`,
    );
  } catch (error) {
    const message = error?.details || error?.message || String(error);
    console.log(`HATA  ${site.name.padEnd(18)} ${message}`);
  }
}

console.log(`\nSonuc: ${successCount}/${sites.length} mulke erisim var.`);

if (successCount !== sites.length) {
  process.exitCode = 1;
}

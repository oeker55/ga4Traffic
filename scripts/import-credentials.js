import {readFile, writeFile} from "node:fs/promises";
import path from "node:path";

const credentialsPath = process.argv[2];
const envPath = path.resolve(process.cwd(), ".env");

if (!credentialsPath) {
  console.error(
    "Kullanim: npm run credentials:import -- /path/service-account.json",
  );
  process.exit(1);
}

const credentials = JSON.parse(await readFile(credentialsPath, "utf8"));

if (
  credentials.type !== "service_account" ||
  !credentials.project_id ||
  !credentials.client_email ||
  !credentials.private_key
) {
  console.error("Dosya gecerli bir Google service account JSON anahtari degil.");
  process.exit(1);
}

let envContents = await readFile(envPath, "utf8");

function setEnvValue(name, value) {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, "m");

  if (pattern.test(envContents)) {
    envContents = envContents.replace(pattern, line);
  } else {
    envContents = `${envContents.trimEnd()}\n${line}\n`;
  }
}

setEnvValue("GOOGLE_PROJECT_ID", credentials.project_id);
setEnvValue("GOOGLE_CLIENT_EMAIL", credentials.client_email);
setEnvValue(
  "GOOGLE_PRIVATE_KEY_BASE64",
  Buffer.from(credentials.private_key, "utf8").toString("base64"),
);

await writeFile(envPath, envContents, "utf8");

console.log(`Kimlik bilgileri .env dosyasina aktarildi.`);
console.log(`Proje: ${credentials.project_id}`);
console.log(`Service account: ${credentials.client_email}`);

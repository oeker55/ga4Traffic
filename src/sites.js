import {mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sitesPath = path.resolve(
  rootDir,
  process.env.SITES_FILE || "config/sites.json",
);

let updateQueue = Promise.resolve();

export class SiteConfigError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function validateSite(site) {
  if (!site.id || !site.name || !/^\d+$/.test(String(site.propertyId))) {
    throw new SiteConfigError(
      "Her firma id, name ve sayisal propertyId alanlarini icermeli.",
      500,
    );
  }
}

function slugify(value) {
  const replacements = {
    ç: "c",
    ğ: "g",
    ı: "i",
    ö: "o",
    ş: "s",
    ü: "u",
  };

  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşü]/g, (character) => replacements[character])
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeNewSite(input) {
  const name = String(input?.name ?? "").trim();
  const propertyId = String(input?.propertyId ?? "").trim();

  if (name.length < 2 || name.length > 80) {
    throw new SiteConfigError("Firma adi 2 ile 80 karakter arasinda olmali.");
  }

  if (!/^\d{6,20}$/.test(propertyId)) {
    throw new SiteConfigError(
      "Property ID yalnizca rakamlardan olusan sayisal GA4 mulk kimligi olmali.",
    );
  }

  const id = slugify(name);
  if (!id) {
    throw new SiteConfigError("Firma adindan gecerli bir kimlik uretilemedi.");
  }

  return {id, name, propertyId};
}

export async function loadSites() {
  try {
    const contents = await readFile(sitesPath, "utf8");
    const sites = JSON.parse(contents);

    if (!Array.isArray(sites)) {
      throw new SiteConfigError(
        "Site veri dosyasi bir JSON listesi olmali.",
        500,
      );
    }

    sites.forEach(validateSite);
    return sites;
  } catch (error) {
    if (error.code === "ENOENT") {
      await saveSites([]);
      return [];
    }
    if (error instanceof SyntaxError) {
      throw new SiteConfigError("Site veri dosyasi gecerli JSON degil.", 500);
    }
    throw error;
  }
}

async function saveSites(sites) {
  await mkdir(path.dirname(sitesPath), {recursive: true});
  await writeFile(sitesPath, `${JSON.stringify(sites, null, 2)}\n`, "utf8");
}

export function addSite(input, validateAccess) {
  const operation = updateQueue.then(async () => {
    const candidate = normalizeNewSite(input);
    const sites = await loadSites();

    if (sites.some((site) => site.propertyId === candidate.propertyId)) {
      throw new SiteConfigError("Bu Property ID zaten ekli.");
    }
    if (sites.some((site) => site.id === candidate.id)) {
      throw new SiteConfigError("Bu firma adi zaten kullaniliyor.");
    }

    if (validateAccess) {
      await validateAccess(candidate);
    }

    sites.push(candidate);
    await saveSites(sites);
    return candidate;
  });

  updateQueue = operation.catch(() => {});
  return operation;
}

export function removeSite(siteId) {
  const operation = updateQueue.then(async () => {
    const sites = await loadSites();
    const nextSites = sites.filter((site) => site.id !== siteId);

    if (nextSites.length === sites.length) {
      throw new SiteConfigError("Firma bulunamadi.", 404);
    }

    await saveSites(nextSites);
  });

  updateQueue = operation.catch(() => {});
  return operation;
}

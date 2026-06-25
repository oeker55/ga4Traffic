import "dotenv/config";

import express from "express";
import {createHash, timingSafeEqual} from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";

import {fetchRealtimeSite} from "./analytics.js";
import {getDemoSites} from "./demo.js";
import {
  SiteConfigError,
  addSite,
  loadSites,
  removeSite,
} from "./sites.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const app = express();

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "0.0.0.0";
const basePath = normalizeBasePath(process.env.APP_BASE_PATH);
const cacheTtlMs =
  Number.parseInt(process.env.CACHE_TTL_SECONDS ?? "60", 10) * 1000;
const refreshIntervalMs = Number.parseInt(
  process.env.REFRESH_INTERVAL_MS ?? "60000",
  10,
);
const concurrency = Math.max(
  1,
  Number.parseInt(process.env.GA_CONCURRENCY ?? "4", 10),
);
const demoMode = process.env.DEMO_MODE === "true";
const panelUsername = process.env.PANEL_USERNAME;
const panelPassword = process.env.PANEL_PASSWORD;

if (
  process.env.NODE_ENV === "production" &&
  (!panelUsername || !panelPassword)
) {
  throw new Error(
    "Uretimde PANEL_USERNAME ve PANEL_PASSWORD ortam degiskenleri zorunludur.",
  );
}

let cache = {expiresAt: 0, payload: null};
const previousActiveUsers = new Map();

function normalizeBasePath(value) {
  const trimmed = value?.trim();

  if (!trimmed || trimmed === "/") {
    return "";
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({length: Math.min(limit, items.length)}, () => worker()),
  );
  return results;
}

function publicError(error) {
  const code = error?.code ?? error?.status;

  if (code === 7 || code === 403) {
    return "GA4 erisimi reddedildi. Servis hesabinin bu mulkte Viewer yetkisi oldugunu kontrol edin.";
  }
  if (code === 3 || code === 400) {
    return "GA4 istegi gecersiz. Property ID ve metrikleri kontrol edin.";
  }
  if (code === 8 || code === 429) {
    return "GA4 kotasi doldu. Onbellek suresini artirin.";
  }

  return error?.message || "GA4 verisi alinamadi.";
}

function publicStatus(error, fallback = 500) {
  if (error instanceof SiteConfigError) {
    return error.status;
  }

  const code = Number(error?.code ?? error?.status);
  if (code === 7 || code === 403) {
    return 403;
  }
  if (code === 3 || code === 400) {
    return 400;
  }
  if (code === 8 || code === 429) {
    return 429;
  }
  if (code >= 400 && code <= 599) {
    return code;
  }

  return fallback;
}

function secureEqual(actual, expected) {
  const actualHash = createHash("sha256").update(actual).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualHash, expectedHash);
}

function requirePanelLogin(request, response, next) {
  if (!panelUsername || !panelPassword) {
    next();
    return;
  }

  const authorization = request.get("authorization") ?? "";
  const [scheme, credentials] = authorization.split(" ");

  if (scheme === "Basic" && credentials) {
    try {
      const decoded = Buffer.from(credentials, "base64").toString("utf8");
      const separatorIndex = decoded.indexOf(":");
      const username = decoded.slice(0, separatorIndex);
      const password = decoded.slice(separatorIndex + 1);

      if (
        separatorIndex >= 0 &&
        secureEqual(username, panelUsername) &&
        secureEqual(password, panelPassword)
      ) {
        next();
        return;
      }
    } catch {
      // Invalid Basic auth data falls through to the challenge.
    }
  }

  response.setHeader(
    "WWW-Authenticate",
    'Basic realm="Farktor Canli Trafik", charset="UTF-8"',
  );
  response.status(401).send("Giris gerekli.");
}

async function getRealtimePayload() {
  if (cache.payload && Date.now() < cache.expiresAt) {
    return {...cache.payload, cached: true};
  }

  let sites;

  if (demoMode) {
    sites = getDemoSites(previousActiveUsers);
  } else {
    const configuredSites = await loadSites();
    sites = await mapWithConcurrency(configuredSites, concurrency, async (site) => {
      try {
        return await fetchRealtimeSite(
          site,
          previousActiveUsers.get(site.id),
        );
      } catch (error) {
        return {
          id: site.id,
          name: site.name,
          propertyId: site.propertyId,
          status: "error",
          error: publicError(error),
        };
      }
    });
  }

  for (const site of sites) {
    if (typeof site.activeUsers === "number") {
      previousActiveUsers.set(site.id, site.activeUsers);
      if (demoMode) {
        previousActiveUsers.set(site.name, site.activeUsers);
      }
    }
  }

  const successfulSites = sites.filter(
    (site) => typeof site.activeUsers === "number",
  );
  const totalActiveUsers = successfulSites.reduce(
    (sum, site) => sum + site.activeUsers,
    0,
  );
  const payload = {
    generatedAt: new Date().toISOString(),
    cached: false,
    demoMode,
    windowMinutes: 30,
    availableWindows: [1, 5, 10, 30],
    summary: {
      totalActiveUsers,
      trackedSites: sites.length,
      averageActiveUsers: successfulSites.length
        ? Math.round(totalActiveUsers / successfulSites.length)
        : 0,
      errors: sites.length - successfulSites.length,
    },
    sites: sites.sort(
      (a, b) => (b.activeUsers ?? -1) - (a.activeUsers ?? -1),
    ),
  };

  cache = {
    expiresAt: Date.now() + cacheTtlMs,
    payload,
  };

  return payload;
}

app.disable("x-powered-by");
app.use(express.json());

app.use((request, response, next) => {
  const allowedOrigin = process.env.ALLOWED_ORIGIN;
  if (allowedOrigin) {
    response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    response.setHeader("Vary", "Origin");
  }
  next();
});

function healthHandler(request, response) {
  response.json({ok: true, demoMode});
}

app.get("/api/health", healthHandler);
app.get(`${basePath}/api/health`, healthHandler);

function configHandler(request, response) {
  response.json({refreshIntervalMs, cacheTtlMs});
}

app.get("/api/config", configHandler);
app.get(`${basePath}/api/config`, configHandler);

if (basePath) {
  app.use((request, response, next) => {
    if (request.path === "/") {
      response.redirect(308, `${basePath}/`);
      return;
    }
    if (request.path === basePath) {
      response.redirect(308, `${basePath}/`);
      return;
    }
    next();
  });
  app.get(`${basePath}/api/health`, healthHandler);
}

const panelRouter = express.Router();

panelRouter.use(requirePanelLogin);

panelRouter.get("/api/sites", async (request, response) => {
  try {
    response.json({sites: await loadSites()});
  } catch (error) {
    response.status(publicStatus(error)).json({error: publicError(error)});
  }
});

panelRouter.post("/api/sites", async (request, response) => {
  try {
    const site = await addSite(
      request.body,
      demoMode
        ? null
        : async (candidate) => {
            await fetchRealtimeSite(candidate);
          },
    );
    cache = {expiresAt: 0, payload: null};
    response.status(201).json({site});
  } catch (error) {
    response
      .status(publicStatus(error, 400))
      .json({error: publicError(error)});
  }
});

panelRouter.delete("/api/sites/:siteId", async (request, response) => {
  try {
    await removeSite(request.params.siteId);
    cache = {expiresAt: 0, payload: null};
    response.status(204).end();
  } catch (error) {
    response
      .status(publicStatus(error))
      .json({error: publicError(error)});
  }
});

panelRouter.get("/api/realtime", async (request, response) => {
  try {
    response.json(await getRealtimePayload());
  } catch (error) {
    response.status(500).json({error: publicError(error)});
  }
});

panelRouter.use(express.static(path.join(rootDir, "public")));

if (basePath) {
  app.use(basePath, panelRouter);
  app.use("/", panelRouter);
} else {
  app.use("/", panelRouter);
}

const server = app.listen(port, host, () => {
  console.log(`Canli trafik paneli: http://${host}:${port}${basePath || "/"}`);
  console.log(`Veri modu: ${demoMode ? "demo" : "GA4"}`);
});

function shutdown(signal) {
  console.log(`${signal} alindi, sunucu kapatiliyor.`);
  server.close((error) => {
    process.exit(error ? 1 : 0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

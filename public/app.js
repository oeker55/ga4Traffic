const numberFormatter = new Intl.NumberFormat("tr-TR");
const sitesElement = document.querySelector("#sites");
const template = document.querySelector("#site-card-template");
const searchInput = document.querySelector("#search");
const refreshButton = document.querySelector("#refresh");
const notice = document.querySelector("#notice");
const siteManager = document.querySelector("#site-manager");
const addSiteForm = document.querySelector("#add-site-form");
const formMessage = document.querySelector("#site-form-message");
const managedSites = document.querySelector("#managed-sites");
const managedSiteCount = document.querySelector("#managed-site-count");
const windowTabs = document.querySelectorAll(".window-tab");

let latestSites = [];
let currentWindow = 5;
let refreshIntervalMs = 10_000;
const previousValues = new Map();
let previousTotal = 0;
let previousAverage = 0;
const liveAnimations = new WeakMap();

function formatNumber(value) {
  return typeof value === "number" ? numberFormatter.format(value) : "-";
}

function parseDisplayedNumber(text, fallback) {
  if (!text || text === "-") return fallback;
  const cleaned = text.replace(/[^\d-]/g, "");
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function animateNumber(element, target, duration = 600) {
  if (typeof target !== "number") {
    element.textContent = formatNumber(target);
    return;
  }

  const existing = liveAnimations.get(element);
  if (existing) {
    cancelAnimationFrame(existing.rafId);
  }

  const from = parseDisplayedNumber(element.textContent, target);
  if (from === target) {
    element.textContent = formatNumber(target);
    return;
  }

  const start = performance.now();
  const step = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(from + (target - from) * eased);
    element.textContent = formatNumber(current);
    if (progress < 1) {
      const rafId = requestAnimationFrame(step);
      liveAnimations.set(element, {rafId});
    } else {
      liveAnimations.delete(element);
    }
  };
  const rafId = requestAnimationFrame(step);
  liveAnimations.set(element, {rafId});
}

function trendValues(site) {
  if (!site?.trend?.length) return [];
  return site.trend
    .filter((point) => point.minutesAgo < currentWindow)
    .sort((a, b) => a.minutesAgo - b.minutesAgo)
    .map((point) => point.activeUsers);
}

function aggregateMetric(site, key) {
  if (!site?.trend?.length) return 0;
  return site.trend
    .filter((point) => point.minutesAgo < currentWindow)
    .reduce((sum, point) => sum + (point[key] ?? 0), 0);
}

function sparklinePoints(values) {
  if (!values?.length) {
    return "";
  }

  const points = values.length === 1 ? [values[0], values[0]] : values;
  const width = 240;
  const height = 44;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(1, max - min);

  return points
    .map((value, index) => {
      const x = (index / Math.max(1, points.length - 1)) * width;
      const y = height - ((value - min) / range) * (height - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

const cardRegistry = new Map();

function createCard(site) {
  const card = template.content.firstElementChild.cloneNode(true);
  card.dataset.siteId = site.id;
  sitesElement.append(card);
  cardRegistry.set(site.id, card);
  return card;
}

function updateCard(card, site) {
  const labels = {
    rising: "Yükselişte",
    normal: "Normal",
    low: "Düşük",
    error: "Hata",
  };

  card.classList.remove("rising", "normal", "low", "error");
  card.classList.add(site.status);
  card.querySelector("h2").textContent = site.name;

  const badge = card.querySelector(".badge");
  badge.textContent = labels[site.status] ?? "Normal";
  badge.classList.remove("rising", "normal", "low", "error");
  badge.classList.add(site.status);

  const activeUsersEl = card.querySelector(".active-users");
  activeUsersEl.textContent = formatNumber(
    previousValues.get(site.id)?.activeUsers ?? site.activeUsers,
  );
  animateNumber(activeUsersEl, site.activeUsers);

  const metrics = [
    [".page-views", aggregateMetric(site, "pageViews")],
    [".events", aggregateMetric(site, "eventCount")],
    [".key-events", aggregateMetric(site, "keyEvents")],
  ];
  for (const [selector, value] of metrics) {
    const el = card.querySelector(selector);
    const previousKey = selector.slice(1);
    el.textContent = formatNumber(
      previousValues.get(site.id)?.[previousKey] ?? value,
    );
    animateNumber(el, value);
  }

  card
    .querySelector(".sparkline polyline")
    .setAttribute("points", sparklinePoints(trendValues(site)));
  card.querySelector(".sparkline-label").textContent = `Trafik eğrisi · son ${currentWindow} dk`;

  const change = card.querySelector(".change");
  if (typeof site.changePercent === "number") {
    const direction = site.changePercent >= 0 ? "↑" : "↓";
    change.textContent = `${direction} %${Math.abs(site.changePercent)}`;
    change.classList.remove("positive", "negative");
    change.classList.add(site.changePercent >= 0 ? "positive" : "negative");
  } else {
    change.textContent = "İlk ölçüm";
    change.classList.remove("positive", "negative");
  }

  card.querySelector(".card-error").textContent = site.error ?? "";
}

function renderSites() {
  const query = searchInput.value.trim().toLocaleLowerCase("tr-TR");
  const visibleIds = new Set();

  for (const site of latestSites) {
    if (!site.name.toLocaleLowerCase("tr-TR").includes(query)) continue;
    visibleIds.add(site.id);
    let card = cardRegistry.get(site.id);
    if (!card) {
      card = createCard(site);
    }
    updateCard(card, site);
    previousValues.set(site.id, {
      activeUsers: site.activeUsers,
      pageViews: aggregateMetric(site, "pageViews"),
      eventCount: aggregateMetric(site, "eventCount"),
      keyEvents: aggregateMetric(site, "keyEvents"),
    });
  }

  for (const [siteId, card] of cardRegistry.entries()) {
    if (!visibleIds.has(siteId)) {
      card.remove();
      cardRegistry.delete(siteId);
      previousValues.delete(siteId);
    }
  }
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const data =
    response.status === 204 ? null : await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || "İşlem tamamlanamadı.");
  }

  return data;
}

async function loadTraffic() {
  refreshButton.disabled = true;
  refreshButton.textContent = "Yükleniyor...";

  try {
    const data = await requestJson("api/realtime");

    latestSites = data.sites;

    const totalEl = document.querySelector("#total-active");
    totalEl.textContent = formatNumber(previousTotal);
    animateNumber(totalEl, data.summary.totalActiveUsers);
    previousTotal = data.summary.totalActiveUsers;

    const averageEl = document.querySelector("#average-active");
    averageEl.textContent = formatNumber(previousAverage);
    animateNumber(averageEl, data.summary.averageActiveUsers);
    previousAverage = data.summary.averageActiveUsers;

    document.querySelector("#tracked-sites").textContent = formatNumber(
      data.summary.trackedSites,
    );
    document.querySelector("#updated-at").innerHTML =
      `<span class="live-dot" aria-hidden="true"></span>` +
      new Date(data.generatedAt).toLocaleTimeString("tr-TR");

    notice.hidden = !data.demoMode;
    notice.textContent = data.demoMode
      ? "Demo verisi gösteriliyor. Gerçek veri için DEMO_MODE=false yapın."
      : "";

    renderSites();
  } catch (error) {
    notice.hidden = false;
    notice.textContent = error.message;
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "Yenile";
  }
}

function showFormMessage(message, isError = false) {
  formMessage.hidden = !message;
  formMessage.textContent = message;
  formMessage.classList.toggle("error", isError);
}

async function loadManagedSites() {
  const data = await requestJson("api/sites");
  managedSites.replaceChildren();
  managedSiteCount.textContent = `${data.sites.length} site`;

  for (const site of data.sites) {
    const row = document.createElement("div");
    row.className = "managed-site";

    const details = document.createElement("div");
    const name = document.createElement("strong");
    const propertyId = document.createElement("span");
    name.textContent = site.name;
    propertyId.textContent = `Property ID: ${site.propertyId}`;
    details.append(name, propertyId);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "danger";
    removeButton.textContent = "Kaldır";
    removeButton.addEventListener("click", async () => {
      if (!window.confirm(`${site.name} panelden kaldırılsın mı?`)) {
        return;
      }

      removeButton.disabled = true;
      try {
        await requestJson(`api/sites/${encodeURIComponent(site.id)}`, {
          method: "DELETE",
        });
        await Promise.all([loadManagedSites(), loadTraffic()]);
      } catch (error) {
        showFormMessage(error.message, true);
        removeButton.disabled = false;
      }
    });

    row.append(details, removeButton);
    managedSites.append(row);
  }
}

async function openSiteManager() {
  showFormMessage("");
  siteManager.showModal();

  try {
    await loadManagedSites();
  } catch (error) {
    showFormMessage(error.message, true);
  }
}

addSiteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = addSiteForm.querySelector("button[type='submit']");
  const formData = new FormData(addSiteForm);

  submitButton.disabled = true;
  submitButton.textContent = "Erişim kontrol ediliyor...";
  showFormMessage("");

  try {
    await requestJson("api/sites", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        name: formData.get("name"),
        propertyId: formData.get("propertyId"),
      }),
    });
    addSiteForm.reset();
    showFormMessage("Firma başarıyla eklendi.");
    await Promise.all([loadManagedSites(), loadTraffic()]);
  } catch (error) {
    showFormMessage(error.message, true);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Erişimi Test Et ve Ekle";
  }
});

document
  .querySelector("#manage-sites")
  .addEventListener("click", openSiteManager);
document
  .querySelector("#manage-sites-nav")
  .addEventListener("click", openSiteManager);
document
  .querySelector("#close-site-manager")
  .addEventListener("click", () => siteManager.close());

searchInput.addEventListener("input", renderSites);
refreshButton.addEventListener("click", loadTraffic);

windowTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const window = Number.parseInt(tab.dataset.window, 10);
    if (!Number.isFinite(window) || window === currentWindow) {
      return;
    }
    currentWindow = window;
    windowTabs.forEach((button) => {
      const active = button === tab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    renderSites();
  });
});

async function bootstrap() {
  try {
    const config = await requestJson("api/config");
    if (Number.isFinite(config?.refreshIntervalMs) && config.refreshIntervalMs >= 1000) {
      refreshIntervalMs = config.refreshIntervalMs;
    }
  } catch {
    // keep default
  }

  await loadTraffic();
  setInterval(loadTraffic, refreshIntervalMs);
}

bootstrap();

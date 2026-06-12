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

let latestSites = [];

function formatNumber(value) {
  return typeof value === "number" ? numberFormatter.format(value) : "-";
}

function sparklinePoints(values) {
  if (!values?.length) {
    return "";
  }

  const width = 240;
  const height = 44;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);

  return values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * width;
      const y = height - ((value - min) / range) * (height - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function renderSites() {
  const query = searchInput.value.trim().toLocaleLowerCase("tr-TR");
  sitesElement.replaceChildren();

  latestSites
    .filter((site) => site.name.toLocaleLowerCase("tr-TR").includes(query))
    .forEach((site) => {
      const card = template.content.firstElementChild.cloneNode(true);
      const labels = {
        rising: "Yükselişte",
        normal: "Normal",
        low: "Düşük",
        error: "Hata",
      };

      card.classList.add(site.status);
      card.querySelector("h2").textContent = site.name;

      const badge = card.querySelector(".badge");
      badge.textContent = labels[site.status] ?? "Normal";
      badge.classList.add(site.status);

      card.querySelector(".active-users").textContent = formatNumber(
        site.activeUsers,
      );
      card.querySelector(".page-views").textContent = formatNumber(
        site.pageViews,
      );
      card.querySelector(".events").textContent = formatNumber(site.eventCount);
      card.querySelector(".key-events").textContent = formatNumber(
        site.keyEvents,
      );
      card
        .querySelector(".sparkline polyline")
        .setAttribute("points", sparklinePoints(site.trend));

      const change = card.querySelector(".change");
      if (typeof site.changePercent === "number") {
        const direction = site.changePercent >= 0 ? "↑" : "↓";
        change.textContent = `${direction} %${Math.abs(site.changePercent)}`;
        change.classList.add(site.changePercent >= 0 ? "positive" : "negative");
      } else {
        change.textContent = "İlk ölçüm";
      }

      card.querySelector(".card-error").textContent = site.error ?? "";
      sitesElement.append(card);
    });
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
    document.querySelector("#total-active").textContent = formatNumber(
      data.summary.totalActiveUsers,
    );
    document.querySelector("#tracked-sites").textContent = formatNumber(
      data.summary.trackedSites,
    );
    document.querySelector("#average-active").textContent = formatNumber(
      data.summary.averageActiveUsers,
    );
    document.querySelector("#updated-at").textContent = new Date(
      data.generatedAt,
    ).toLocaleTimeString("tr-TR");

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

loadTraffic();
setInterval(loadTraffic, 60_000);

const DEMO_SITES = [
  "Fullamoda",
  "Addax",
  "Modaplaza",
  "Hakke",
  "Armalife",
  "Akswsuar",
  "Urban Focus",
  "Kado Outlet",
];

function randomAround(base, variance) {
  return Math.max(0, Math.round(base + (Math.random() - 0.5) * variance));
}

export function getDemoSites(previous = new Map()) {
  return DEMO_SITES.map((name, index) => {
    const oldValue = previous.get(name) ?? 1200 - index * 110;
    const activeUsers = randomAround(oldValue, Math.max(20, oldValue * 0.14));
    const changePercent =
      oldValue === 0
        ? 0
        : Math.round(((activeUsers - oldValue) / oldValue) * 1000) / 10;

    return {
      id: name.toLowerCase().replaceAll(" ", "-"),
      name,
      propertyId: "demo",
      activeUsers,
      pageViews: randomAround(activeUsers * 2.6, activeUsers * 0.3),
      eventCount: randomAround(activeUsers * 6.8, activeUsers * 0.8),
      keyEvents: randomAround(activeUsers * 0.22, activeUsers * 0.05),
      changePercent,
      status:
        changePercent >= 5
          ? "rising"
          : changePercent <= -5
            ? "low"
            : "normal",
      trend: Array.from({length: 20}, (_, point) =>
        randomAround(activeUsers * (0.72 + point / 65), activeUsers * 0.09),
      ),
      quota: null,
    };
  });
}

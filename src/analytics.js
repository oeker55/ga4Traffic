import {BetaAnalyticsDataClient} from "@google-analytics/data";

const METRICS = [
  "activeUsers",
  "screenPageViews",
  "eventCount",
  "keyEvents",
];

function clientOptionsFromEnvironment() {
  const projectId = process.env.GOOGLE_PROJECT_ID?.trim();
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL?.trim();
  const encodedPrivateKey = process.env.GOOGLE_PRIVATE_KEY_BASE64?.trim();
  const escapedPrivateKey = process.env.GOOGLE_PRIVATE_KEY?.trim();

  if (!projectId && !clientEmail && !encodedPrivateKey && !escapedPrivateKey) {
    return {fallback: "rest"};
  }

  const privateKey = encodedPrivateKey
    ? Buffer.from(encodedPrivateKey, "base64").toString("utf8")
    : escapedPrivateKey?.replaceAll("\\n", "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "GOOGLE_PROJECT_ID, GOOGLE_CLIENT_EMAIL ve GOOGLE_PRIVATE_KEY_BASE64 alanlari birlikte tanimlanmali.",
    );
  }

  return {
    fallback: "rest",
    projectId,
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
  };
}

const client = new BetaAnalyticsDataClient(clientOptionsFromEnvironment());

function numberValue(value) {
  return Number.parseInt(value ?? "0", 10) || 0;
}

function calculateChange(current, previous) {
  if (previous === undefined || previous === null) {
    return null;
  }

  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }

  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function statusFromChange(changePercent) {
  if (changePercent === null) {
    return "normal";
  }
  if (changePercent >= 10) {
    return "rising";
  }
  if (changePercent <= -10) {
    return "low";
  }
  return "normal";
}

function metricMap(metricValues = []) {
  return Object.fromEntries(
    METRICS.map((name, index) => [
      name,
      numberValue(metricValues[index]?.value),
    ]),
  );
}

export async function fetchRealtimeSite(site, previousActiveUsers) {
  const [response] = await client.runRealtimeReport({
    property: `properties/${site.propertyId}`,
    dimensions: [{name: "minutesAgo"}],
    metrics: METRICS.map((name) => ({name})),
    metricAggregations: ["TOTAL"],
    limit: 30,
    returnPropertyQuota: true,
  });

  const totals = metricMap(response.totals?.[0]?.metricValues);
  const trend = (response.rows ?? [])
    .map((row) => ({
      minutesAgo: numberValue(row.dimensionValues?.[0]?.value),
      activeUsers: numberValue(row.metricValues?.[0]?.value),
    }))
    .sort((a, b) => b.minutesAgo - a.minutesAgo)
    .map((point) => point.activeUsers);

  const changePercent = calculateChange(
    totals.activeUsers,
    previousActiveUsers,
  );

  return {
    id: site.id,
    name: site.name,
    propertyId: site.propertyId,
    activeUsers: totals.activeUsers,
    pageViews: totals.screenPageViews,
    eventCount: totals.eventCount,
    keyEvents: totals.keyEvents,
    changePercent,
    status: statusFromChange(changePercent),
    trend,
    quota: response.propertyQuota
      ? {
          hourlyTokensRemaining:
            response.propertyQuota.tokensPerProjectPerPropertyPerHour
              ?.remaining,
          concurrentRequestsRemaining:
            response.propertyQuota.concurrentRequests?.remaining,
        }
      : null,
  };
}

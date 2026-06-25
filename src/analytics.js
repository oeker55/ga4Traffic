import {BetaAnalyticsDataClient} from "@google-analytics/data";

const METRICS = [
  "activeUsers",
  "screenPageViews",
  "eventCount",
  "conversions",
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

export async function fetchRealtimeSite(site, previousActiveUsers) {
  const [response] = await client.runRealtimeReport({
    property: `properties/${site.propertyId}`,
    dimensions: [{name: "minutesAgo"}],
    metrics: METRICS.map((name) => ({name})),
    limit: 30,
    returnPropertyQuota: true,
  });

  const rows = response.rows ?? [];

  const currentRow = rows.find(
    (row) => numberValue(row.dimensionValues?.[0]?.value) === 0,
  );
  const currentActiveUsers = currentRow
    ? numberValue(currentRow.metricValues?.[0]?.value)
    : 0;

  const trend = rows
    .map((row) => ({
      minutesAgo: numberValue(row.dimensionValues?.[0]?.value),
      activeUsers: numberValue(row.metricValues?.[0]?.value),
      pageViews: numberValue(row.metricValues?.[1]?.value),
      eventCount: numberValue(row.metricValues?.[2]?.value),
      keyEvents: numberValue(row.metricValues?.[3]?.value),
    }))
    .sort((a, b) => b.minutesAgo - a.minutesAgo);

  const totalPageViews = trend.reduce((sum, point) => sum + point.pageViews, 0);
  const totalEventCount = trend.reduce((sum, point) => sum + point.eventCount, 0);
  const totalKeyEvents = trend.reduce((sum, point) => sum + point.keyEvents, 0);

  const changePercent = calculateChange(
    currentActiveUsers,
    previousActiveUsers,
  );

  return {
    id: site.id,
    name: site.name,
    propertyId: site.propertyId,
    activeUsers: currentActiveUsers,
    pageViews: totalPageViews,
    eventCount: totalEventCount,
    keyEvents: totalKeyEvents,
    changePercent,
    status: statusFromChange(changePercent),
    trend,
    quota: response.propertyQuota
      ? {
          hourlyTokensRemaining:
            response.propertyQuota.tokensPerHour?.remaining,
          concurrentRequestsRemaining:
            response.propertyQuota.concurrentRequests?.remaining,
        }
      : null,
  };
}

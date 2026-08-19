import type { AnalyticsRepository } from "@/lib/data/analytics-repository";

export async function getAnalyticsRepository(): Promise<AnalyticsRepository> {
  if (process.env.ANALYTICS_PROVIDER === "bigquery") {
    const { BigQueryAnalyticsRepository } = await import("@/lib/data/bigquery-analytics-repository");
    return new BigQueryAnalyticsRepository();
  }
  const { MockAnalyticsRepository } = await import("@/lib/data/mock-analytics-repository");
  return new MockAnalyticsRepository();
}

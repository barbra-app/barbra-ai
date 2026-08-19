import type { AnalyticsRepository } from "@/lib/data/analytics-repository";
import { runtimeEnv } from "@/lib/runtime-env";

export async function getAnalyticsRepository(): Promise<AnalyticsRepository> {
  if (runtimeEnv("ANALYTICS_PROVIDER") === "bigquery") {
    const { BigQueryAnalyticsRepository } = await import("@/lib/data/bigquery-analytics-repository");
    return new BigQueryAnalyticsRepository();
  }
  const { MockAnalyticsRepository } = await import("@/lib/data/mock-analytics-repository");
  return new MockAnalyticsRepository();
}

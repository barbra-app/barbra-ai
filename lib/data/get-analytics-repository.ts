import type { AnalyticsRepository } from "@/lib/data/analytics-repository";
import { BigQueryAnalyticsRepository } from "@/lib/data/bigquery-analytics-repository";
import { MockAnalyticsRepository } from "@/lib/data/mock-analytics-repository";

export function getAnalyticsRepository(): AnalyticsRepository {
  return process.env.ANALYTICS_PROVIDER === "bigquery"
    ? new BigQueryAnalyticsRepository()
    : new MockAnalyticsRepository();
}

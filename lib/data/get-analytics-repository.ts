import type { AnalyticsRepository } from "@/lib/data/analytics-repository";
import { runtimeEnv } from "@/lib/runtime-env";

export async function getAnalyticsRepository(): Promise<AnalyticsRepository> {
  if (await runtimeEnv("ANALYTICS_PROVIDER") === "bigquery") {
    const { BigQueryAnalyticsRepository } = await import("@/lib/data/bigquery-analytics-repository");
    const [projectId, view, credentialsJson, maximumBytesBilled, timeZone, defaultCurrency] = await Promise.all([
      runtimeEnv("GCP_PROJECT_ID"),
      runtimeEnv("BIGQUERY_ANALYTICS_VIEW"),
      runtimeEnv("BIGQUERY_SERVICE_ACCOUNT_JSON"),
      runtimeEnv("BIGQUERY_MAX_BYTES_BILLED"),
      runtimeEnv("BIGQUERY_REPORTING_TIMEZONE"),
      runtimeEnv("BIGQUERY_DEFAULT_CURRENCY"),
    ]);
    return new BigQueryAnalyticsRepository({ projectId, view, credentialsJson, maximumBytesBilled, timeZone, defaultCurrency });
  }
  const { MockAnalyticsRepository } = await import("@/lib/data/mock-analytics-repository");
  return new MockAnalyticsRepository();
}

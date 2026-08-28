import type { AnalyticsRepository } from "@/lib/data/analytics-repository";
import { runtimeEnv } from "@/lib/runtime-env";

async function localBigQueryCredentials() {
  const file = await runtimeEnv("BIGQUERY_SERVICE_ACCOUNT_FILE");
  if (!file) return undefined;
  const { readFile } = await import("node:fs/promises");
  return readFile(file, "utf8");
}

export async function getAnalyticsRepository(): Promise<AnalyticsRepository> {
  if (await runtimeEnv("ANALYTICS_PROVIDER") !== "bigquery") throw new Error("ANALYTICS_PROVIDER_NOT_CONFIGURED");

  const { BigQueryAnalyticsRepository } = await import("@/lib/data/bigquery-analytics-repository");
  const [projectId, view, runtimeCredentials, fileCredentials, maximumBytesBilled, timeZone, defaultCurrency] = await Promise.all([
    runtimeEnv("GCP_PROJECT_ID"),
    runtimeEnv("BIGQUERY_ANALYTICS_VIEW"),
    runtimeEnv("BIGQUERY_SERVICE_ACCOUNT_JSON"),
    localBigQueryCredentials(),
    runtimeEnv("BIGQUERY_MAX_BYTES_BILLED"),
    runtimeEnv("BIGQUERY_REPORTING_TIMEZONE"),
    runtimeEnv("BIGQUERY_DEFAULT_CURRENCY"),
  ]);
  const credentialsJson = runtimeCredentials ?? fileCredentials;
  return new BigQueryAnalyticsRepository({ projectId, view, credentialsJson, maximumBytesBilled, timeZone, defaultCurrency });
}

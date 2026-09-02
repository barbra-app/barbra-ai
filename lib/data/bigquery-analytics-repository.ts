import { BigQuery, type Query } from "@google-cloud/bigquery";
import type { AnalyticsRepository } from "@/lib/data/analytics-repository";
import { resolveAnalyticsScope, resolveConcertScope } from "@/lib/data/analytics-scope";
import type {
  AdvisorInsight,
  AnalyticsQuery,
  CampaignPerformance,
  CampaignStatus,
  ChannelBreakdown,
  ConcertCampaignBreakdown,
  ConcertPlatformBreakdown,
  ConcertQuery,
  ConcertSummary,
  DashboardSnapshot,
  DateRange,
  MetricSummary,
  TrendPoint,
} from "@/lib/domain/analytics";

const RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90 } as const;
const CHANNEL_COLORS = ["#2142ff", "#f5c842", "#00989b", "#b45eb3", "#f97316"];

interface CanonicalRow {
  date: unknown;
  source: string;
  account_id: string;
  campaign_id: string;
  campaign_name: string;
  campaign_status: string | null;
  currency_code: string | null;
  spend: unknown;
  impressions: unknown;
  clicks: unknown;
  conversions: unknown;
  revenue: unknown;
  last_synced_at: unknown;
}

interface Totals {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

// Resolves the requested range into a concrete [start, end] window. Presets
// (7d/30d/90d) are relative to "today" in the reporting timezone; "custom"
// uses the caller's explicit dates, already validated at the API route.
function resolveDateWindow(query: { range: DateRange; startDate?: string; endDate?: string }) {
  if (query.range === "custom") {
    if (!query.startDate || !query.endDate || query.startDate > query.endDate) {
      throw new Error("ANALYTICS_DATE_RANGE_INVALID");
    }
    return {
      end: new Date(`${query.endDate}T00:00:00.000Z`),
      start: new Date(`${query.startDate}T00:00:00.000Z`),
    };
  }
  const days = RANGE_DAYS[query.range];
  const end = new Date(`${reportingDate()}T00:00:00.000Z`);
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - days + 1);
  return { end, start };
}

function reportingDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.BIGQUERY_REPORTING_TIMEZONE ?? "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function value(value: unknown): unknown {
  return value && typeof value === "object" && "value" in value
    ? (value as { value: unknown }).value
    : value;
}

function number(input: unknown) {
  return Number(value(input) ?? 0);
}

function text(input: unknown) {
  return String(value(input) ?? "");
}

function emptyTotals(): Totals {
  return { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
}

function add(target: Totals, row: CanonicalRow) {
  target.spend += number(row.spend);
  target.impressions += number(row.impressions);
  target.clicks += number(row.clicks);
  target.conversions += number(row.conversions);
  target.revenue += number(row.revenue);
}

function previousValue(current: number, previous: number) {
  return previous || current;
}

function channelLabel(source: string) {
  const labels: Record<string, string> = {
    google_ads: "Google Ads",
    meta_ads: "Meta Ads",
    tiktok_ads: "TikTok Ads",
  };
  return labels[source] ?? source.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function campaignStatus(status: string | null): CampaignStatus {
  const normalized = status?.toLowerCase() ?? "";
  if (normalized.includes("pause")) return "paused";
  if (normalized.includes("complete") || normalized.includes("ended") || normalized.includes("removed")) return "completed";
  return "active";
}

function buildInsights(channels: ChannelBreakdown[], campaigns: CampaignPerformance[]): AdvisorInsight[] {
  const insights: AdvisorInsight[] = [];
  const totalSpend = channels.reduce((sum, row) => sum + row.spend, 0);
  const totalConversions = channels.reduce((sum, row) => sum + row.conversions, 0);
  const efficientChannel = channels
    .filter((row) => row.spend > 0 && row.conversions > 0 && totalSpend > 0 && totalConversions > 0)
    .map((row) => ({
      ...row,
      spendShare: row.spend / totalSpend,
      conversionShare: row.conversions / totalConversions,
    }))
    .sort((a, b) => (b.conversionShare - b.spendShare) - (a.conversionShare - a.spendShare))[0];

  if (efficientChannel && efficientChannel.conversionShare > efficientChannel.spendShare) {
    const advantage = Math.round((efficientChannel.conversionShare - efficientChannel.spendShare) * 100);
    insights.push({
      id: "channel-efficiency",
      tone: "opportunity",
      title: `${efficientChannel.channel} convierte con mayor eficiencia`,
      summary: `Aporta ${Math.round(efficientChannel.conversionShare * 100)}% de las conversiones con ${Math.round(efficientChannel.spendShare * 100)}% de la inversión.`,
      metric: `+${advantage} pp`,
      action: "Revisar distribución",
    });
  }

  const bestCampaign = campaigns.filter((row) => row.spend > 0 && row.roas > 0).sort((a, b) => b.roas - a.roas)[0];
  if (bestCampaign) {
    insights.push({
      id: "campaign-roas",
      tone: "info",
      title: `${bestCampaign.name} lidera el retorno`,
      summary: `Es la campaña con mejor ROAS en el periodo seleccionado.`,
      metric: `${bestCampaign.roas.toFixed(2)}× ROAS`,
      action: "Analizar escala",
    });
  }
  return insights;
}

interface ConcertRow {
  date: unknown;
  source: string;
  campaign_id: string;
  campaign_name: string;
  currency_code: string | null;
  spend: unknown;
  billed_spend: unknown;
  impressions: unknown;
  clicks: unknown;
  conversions: unknown;
  revenue: unknown;
}

interface ConcertTotals {
  spend: number;
  billedSpend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
}

// Anchors the stored prefix to the start of campaign_name and requires the
// next character (if any) to be a word boundary ("_" or end of string), so
// "BFL_Reykon" matches "BFL_Reykon_Traffic" but not "BFL_Reykon2dafecha"
// (a different show for the same artist).
function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function anchoredPattern(rawPrefix: string) {
  return `(?i)^${escapeRegExp(rawPrefix.trim())}($|_)`;
}

function ratiosOf(totals: ConcertTotals) {
  return {
    ctr: totals.impressions ? totals.clicks / totals.impressions : 0,
    cpc: totals.clicks ? totals.spend / totals.clicks : 0,
    cpa: totals.conversions ? totals.spend / totals.conversions : 0,
    roas: totals.spend ? totals.revenue / totals.spend : 0,
  };
}

function withRatios(totals: ConcertTotals, source: string, campaigns: ConcertCampaignBreakdown[] = []): ConcertPlatformBreakdown {
  return { source, ...totals, ...ratiosOf(totals), campaigns };
}

function campaignWithRatios(totals: ConcertTotals, campaignId: string, campaignName: string): ConcertCampaignBreakdown {
  return { campaignId, campaignName, ...totals, ...ratiosOf(totals) };
}

function bigQueryCredentials() {
  const raw = process.env.BIGQUERY_SERVICE_ACCOUNT_JSON;
  if (!raw) return undefined;
  const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
  if (!parsed.client_email || !parsed.private_key) throw new Error("BIGQUERY_SERVICE_ACCOUNT_JSON is invalid");
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

export class BigQueryAnalyticsRepository implements AnalyticsRepository {
  private client: BigQuery;
  private view: string;

  constructor() {
    const projectId = process.env.GCP_PROJECT_ID;
    const view = process.env.BIGQUERY_ANALYTICS_VIEW;
    if (!projectId || !view) {
      throw new Error("GCP_PROJECT_ID and BIGQUERY_ANALYTICS_VIEW are required for BigQuery analytics");
    }
    if (!/^[A-Za-z0-9_.-]+$/.test(view)) throw new Error("BIGQUERY_ANALYTICS_VIEW contains invalid characters");
    this.client = new BigQuery({ projectId, credentials: bigQueryCredentials() });
    this.view = view;
  }

  private async rows<T>(query: string, params: Query["params"]): Promise<T[]> {
    const maximumBytesBilled = process.env.BIGQUERY_MAX_BYTES_BILLED ?? "250000000";
    const [job] = await this.client.createQueryJob({
      query,
      params,
      useLegacySql: false,
      maximumBytesBilled,
      jobTimeoutMs: 20_000,
    });
    const [rows] = await job.getQueryResults();
    return rows as T[];
  }

  async getDashboard(query: AnalyticsQuery): Promise<DashboardSnapshot> {
    const { start, end } = resolveDateWindow(query);
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    const previousEnd = new Date(start);
    previousEnd.setUTCDate(start.getUTCDate() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setUTCDate(previousEnd.getUTCDate() - days + 1);

    const scope = await resolveAnalyticsScope(query);
    const params: NonNullable<Query["params"]> = {
      clientId: scope.clientId,
      startDate: isoDate(start),
      endDate: isoDate(end),
      previousStartDate: isoDate(previousStart),
      campaigns: scope.campaigns,
    };

    // One bounded query feeds the complete dashboard and Advisor snapshot.
    // The date filter preserves partition pruning on the canonical mart.
    const rows = await this.rows<CanonicalRow>(`SELECT
      date, source, account_id, campaign_id,
      ANY_VALUE(campaign_name HAVING MAX last_synced_at) AS campaign_name,
      ANY_VALUE(campaign_status HAVING MAX last_synced_at) AS campaign_status,
      ANY_VALUE(currency_code HAVING MAX last_synced_at) AS currency_code,
      SUM(spend) AS spend,
      SUM(impressions) AS impressions,
      SUM(clicks) AS clicks,
      SUM(conversions) AS conversions,
      SUM(revenue) AS revenue,
      MAX(last_synced_at) AS last_synced_at
    FROM \`${this.view}\`
    WHERE client_id = @clientId
      AND date BETWEEN DATE(@previousStartDate) AND DATE(@endDate)
      AND EXISTS (
        SELECT 1
        FROM UNNEST(@campaigns) AS allowed
        WHERE source = allowed.source
          AND account_id = allowed.accountId
          AND campaign_id = allowed.campaignId
      )
    GROUP BY date, source, account_id, campaign_id
    ORDER BY date`, params);

    if (!rows.length) throw new Error("ANALYTICS_NO_DATA");

    const current = emptyTotals();
    const previous = emptyTotals();
    const trendByDate = new Map<string, Totals>();
    const campaigns = new Map<string, CampaignPerformance & { revenue: number }>();
    const channels = new Map<string, { spend: number; conversions: number }>();
    const currencies = new Set<string>();
    let updatedAt = "";

    for (const row of rows) {
      const date = text(row.date);
      const syncedAt = text(row.last_synced_at);
      if (syncedAt > updatedAt) updatedAt = syncedAt;
      if (row.currency_code) currencies.add(String(row.currency_code));
      if (date < isoDate(start)) {
        add(previous, row);
        continue;
      }

      add(current, row);
      const daily = trendByDate.get(date) ?? emptyTotals();
      add(daily, row);
      trendByDate.set(date, daily);

      const campaignKey = `${row.source}:${row.account_id}:${row.campaign_id}`;
      const campaign = campaigns.get(campaignKey) ?? {
        id: campaignKey,
        name: row.campaign_name,
        channel: channelLabel(row.source),
        status: campaignStatus(row.campaign_status),
        spend: 0,
        conversions: 0,
        cpa: 0,
        roas: 0,
        revenue: 0,
      };
      campaign.spend += number(row.spend);
      campaign.conversions += number(row.conversions);
      campaign.revenue += number(row.revenue);
      campaigns.set(campaignKey, campaign);

      const channel = channels.get(row.source) ?? { spend: 0, conversions: 0 };
      channel.spend += number(row.spend);
      channel.conversions += number(row.conversions);
      channels.set(row.source, channel);
    }

    if (currencies.size > 1) throw new Error("ANALYTICS_MIXED_CURRENCIES");
    const currency = [...currencies][0] ?? process.env.BIGQUERY_DEFAULT_CURRENCY ?? "COP";
    const metrics: MetricSummary[] = [
      { id: "spend", label: "Inversión", value: current.spend, previousValue: previousValue(current.spend, previous.spend), format: "currency", positiveWhen: "up" },
      { id: "impressions", label: "Impresiones", value: current.impressions, previousValue: previousValue(current.impressions, previous.impressions), format: "number", positiveWhen: "up" },
      { id: "clicks", label: "Clics", value: current.clicks, previousValue: previousValue(current.clicks, previous.clicks), format: "number", positiveWhen: "up" },
      { id: "conversions", label: "Conversiones", value: current.conversions, previousValue: previousValue(current.conversions, previous.conversions), format: "number", positiveWhen: "up" },
      { id: "cpa", label: "CPA", value: current.conversions ? current.spend / current.conversions : 0, previousValue: previous.conversions ? previous.spend / previous.conversions : 0, format: "currency", positiveWhen: "down" },
      { id: "roas", label: "ROAS", value: current.spend ? current.revenue / current.spend : 0, previousValue: previous.spend ? previous.revenue / previous.spend : 0, format: "ratio", positiveWhen: "up" },
    ];
    const trend: TrendPoint[] = [...trendByDate.entries()].map(([date, totals]) => ({
      date,
      spend: totals.spend,
      revenue: totals.revenue,
      conversions: totals.conversions,
    }));
    const campaignRows: CampaignPerformance[] = [...campaigns.values()]
      .map(({ revenue, ...campaign }) => ({
        ...campaign,
        cpa: campaign.conversions ? campaign.spend / campaign.conversions : 0,
        roas: campaign.spend ? revenue / campaign.spend : 0,
      }))
      .sort((a, b) => b.spend - a.spend);
    const channelMix: ChannelBreakdown[] = [...channels.entries()]
      .map(([source, totals], index) => ({
        channel: channelLabel(source),
        spend: totals.spend,
        conversions: totals.conversions,
        color: CHANNEL_COLORS[index % CHANNEL_COLORS.length],
      }))
      .sort((a, b) => b.spend - a.spend);

    return {
      query,
      currency,
      updatedAt: updatedAt || new Date().toISOString(),
      periodLabel: query.range === "custom" ? `${isoDate(start)} – ${isoDate(end)}` : `Últimos ${days} días`,
      metrics,
      trend,
      campaigns: campaignRows,
      channelMix,
      insights: buildInsights(channelMix, campaignRows),
    };
  }

  async getConcertSummary(query: ConcertQuery): Promise<ConcertSummary> {
    const { start, end } = resolveDateWindow(query);

    const scope = await resolveConcertScope(query);
    const params: NonNullable<Query["params"]> = {
      clientId: scope.clientId,
      startDate: isoDate(start),
      endDate: isoDate(end),
      patterns: scope.namePatterns.map(anchoredPattern),
    };

    // Grouped by date, source AND campaign: the per-platform breakdown sums
    // across dates and campaigns, the per-campaign breakdown sums across
    // dates, the trend sums across sources and campaigns, and the total sums
    // everything — all derived from this one row set, so they never disagree.
    const rows = await this.rows<ConcertRow>(`SELECT
      date,
      source,
      campaign_id,
      ANY_VALUE(campaign_name HAVING MAX last_synced_at) AS campaign_name,
      ANY_VALUE(currency_code) AS currency_code,
      SUM(spend) AS spend,
      SUM(billed_spend) AS billed_spend,
      SUM(impressions) AS impressions,
      SUM(clicks) AS clicks,
      SUM(conversions) AS conversions,
      SUM(revenue) AS revenue
    FROM \`${this.view}\`
    WHERE client_id = @clientId
      AND date BETWEEN DATE(@startDate) AND DATE(@endDate)
      AND EXISTS (
        SELECT 1
        FROM UNNEST(@patterns) AS pattern
        WHERE REGEXP_CONTAINS(campaign_name, pattern)
      )
    GROUP BY date, source, campaign_id
    ORDER BY date`, params);

    if (!rows.length) throw new Error("ANALYTICS_NO_DATA");

    const currencies = new Set<string>();
    const bySource = new Map<string, ConcertTotals>();
    const byCampaign = new Map<string, ConcertTotals & { source: string; campaignId: string; campaignName: string }>();
    const byDate = new Map<string, { billedSpend: number; conversions: number }>();
    const byDateSource = new Map<string, ConcertTotals & { date: string; source: string }>();
    const combined: ConcertTotals = { spend: 0, billedSpend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };

    for (const row of rows) {
      if (row.currency_code) currencies.add(String(row.currency_code));
      const rowTotals: ConcertTotals = {
        spend: number(row.spend),
        billedSpend: number(row.billed_spend),
        impressions: number(row.impressions),
        clicks: number(row.clicks),
        conversions: number(row.conversions),
        revenue: number(row.revenue),
      };

      const sourceTotals = bySource.get(row.source) ?? { spend: 0, billedSpend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
      sourceTotals.spend += rowTotals.spend;
      sourceTotals.billedSpend += rowTotals.billedSpend;
      sourceTotals.impressions += rowTotals.impressions;
      sourceTotals.clicks += rowTotals.clicks;
      sourceTotals.conversions += rowTotals.conversions;
      sourceTotals.revenue += rowTotals.revenue;
      bySource.set(row.source, sourceTotals);

      const campaignKey = `${row.source}:${row.campaign_id}`;
      const campaignTotals = byCampaign.get(campaignKey) ?? {
        spend: 0, billedSpend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0,
        source: row.source, campaignId: row.campaign_id, campaignName: row.campaign_name,
      };
      campaignTotals.spend += rowTotals.spend;
      campaignTotals.billedSpend += rowTotals.billedSpend;
      campaignTotals.impressions += rowTotals.impressions;
      campaignTotals.clicks += rowTotals.clicks;
      campaignTotals.conversions += rowTotals.conversions;
      campaignTotals.revenue += rowTotals.revenue;
      byCampaign.set(campaignKey, campaignTotals);

      const dateKey = text(row.date);
      const dateTotals = byDate.get(dateKey) ?? { billedSpend: 0, conversions: 0 };
      dateTotals.billedSpend += rowTotals.billedSpend;
      dateTotals.conversions += rowTotals.conversions;
      byDate.set(dateKey, dateTotals);

      const dateSourceKey = `${dateKey}:${row.source}`;
      const dateSourceTotals = byDateSource.get(dateSourceKey) ?? {
        spend: 0, billedSpend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0,
        date: dateKey, source: row.source,
      };
      dateSourceTotals.spend += rowTotals.spend;
      dateSourceTotals.billedSpend += rowTotals.billedSpend;
      dateSourceTotals.impressions += rowTotals.impressions;
      dateSourceTotals.clicks += rowTotals.clicks;
      dateSourceTotals.conversions += rowTotals.conversions;
      dateSourceTotals.revenue += rowTotals.revenue;
      byDateSource.set(dateSourceKey, dateSourceTotals);

      combined.spend += rowTotals.spend;
      combined.billedSpend += rowTotals.billedSpend;
      combined.impressions += rowTotals.impressions;
      combined.clicks += rowTotals.clicks;
      combined.conversions += rowTotals.conversions;
      combined.revenue += rowTotals.revenue;
    }

    if (currencies.size > 1) throw new Error("ANALYTICS_MIXED_CURRENCIES");
    const currency = [...currencies][0] ?? process.env.BIGQUERY_DEFAULT_CURRENCY ?? "COP";
    const campaignsBySource = new Map<string, ConcertCampaignBreakdown[]>();
    for (const campaign of byCampaign.values()) {
      const list = campaignsBySource.get(campaign.source) ?? [];
      list.push(campaignWithRatios(campaign, campaign.campaignId, campaign.campaignName));
      campaignsBySource.set(campaign.source, list);
    }
    const byPlatform = [...bySource.entries()]
      .map(([source, totals]) => withRatios(
        totals,
        source,
        (campaignsBySource.get(source) ?? []).sort((a, b) => b.billedSpend - a.billedSpend),
      ))
      .sort((a, b) => b.billedSpend - a.billedSpend);
    const trend = [...byDate.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([date, totals]) => ({ date, billedSpend: totals.billedSpend, conversions: totals.conversions }));
    const platformTrend = [...byDateSource.values()]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map((totals) => ({ ...totals, ...ratiosOf(totals) }));

    return {
      query,
      currency,
      trend,
      platformTrend,
      updatedAt: new Date().toISOString(),
      total: withRatios(combined, "total"),
      byPlatform,
    };
  }
}

import { BigQuery, type Query } from "@google-cloud/bigquery";
import type { AnalyticsRepository } from "@/lib/data/analytics-repository";
import { resolveAnalyticsScope } from "@/lib/data/analytics-scope";
import type {
  AdvisorInsight,
  AnalyticsQuery,
  CampaignPerformance,
  CampaignStatus,
  ChannelBreakdown,
  DashboardSnapshot,
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

function reportingDate(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
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

function bigQueryCredentials(raw?: string) {
  if (!raw) return undefined;
  const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
  if (!parsed.client_email || !parsed.private_key) throw new Error("BIGQUERY_SERVICE_ACCOUNT_JSON is invalid");
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

export class BigQueryAnalyticsRepository implements AnalyticsRepository {
  private client: BigQuery;
  private view: string;
  private maximumBytesBilled: string;
  private timeZone: string;
  private defaultCurrency: string;

  constructor(config: { projectId?: string; view?: string; credentialsJson?: string; maximumBytesBilled?: string; timeZone?: string; defaultCurrency?: string }) {
    const { projectId, view } = config;
    if (!projectId || !view) {
      throw new Error("GCP_PROJECT_ID and BIGQUERY_ANALYTICS_VIEW are required for BigQuery analytics");
    }
    if (!/^[A-Za-z0-9_.-]+$/.test(view)) throw new Error("BIGQUERY_ANALYTICS_VIEW contains invalid characters");
    this.client = new BigQuery({ projectId, credentials: bigQueryCredentials(config.credentialsJson) });
    this.view = view;
    this.maximumBytesBilled = config.maximumBytesBilled ?? "250000000";
    this.timeZone = config.timeZone ?? "America/Bogota";
    this.defaultCurrency = config.defaultCurrency ?? "COP";
  }

  private async rows<T>(query: string, params: Query["params"]): Promise<T[]> {
    const [job] = await this.client.createQueryJob({
      query,
      params,
      useLegacySql: false,
      maximumBytesBilled: this.maximumBytesBilled,
      jobTimeoutMs: 20_000,
    });
    const [rows] = await job.getQueryResults();
    return rows as T[];
  }

  async getDashboard(query: AnalyticsQuery): Promise<DashboardSnapshot> {
    const days = RANGE_DAYS[query.range];
    const end = new Date(`${reportingDate(this.timeZone)}T00:00:00.000Z`);
    const start = new Date(end);
    start.setUTCDate(end.getUTCDate() - days + 1);
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
    const currency = [...currencies][0] ?? this.defaultCurrency;
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
      periodLabel: `Últimos ${days} días`,
      metrics,
      trend,
      campaigns: campaignRows,
      channelMix,
      insights: buildInsights(channelMix, campaignRows),
    };
  }
}

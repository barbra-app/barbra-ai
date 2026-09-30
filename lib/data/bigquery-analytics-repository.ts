import type { AnalyticsRepository } from "@/lib/data/analytics-repository";
import { humanizeCampaignName } from "@/lib/campaign-name";
import { resolveAnalyticsScope, resolveConcertScope, resolveProjectConcertScope, type CampaignAnalyticsScope, type ProjectEventScope } from "@/lib/data/analytics-scope";
import { googleAccessToken } from "@/lib/google/access-token";
import type {
  AdPerformance,
  AdvisorInsight,
  AnalyticsQuery,
  CampaignPerformance,
  CampaignStatus,
  ChannelBreakdown,
  ConcertCampaignBreakdown,
  ConcertCreative,
  ConcertPlatformBreakdown,
  ConcertQuery,
  ConcertSummary,
  DashboardSnapshot,
  DateRange,
  EventPerformance,
  MetricSummary,
  TrendPoint,
} from "@/lib/domain/analytics";

const RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90 } as const;
const CHANNEL_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

interface CanonicalRow {
  date: unknown;
  source: string;
  account_id: string;
  campaign_id: string;
  campaign_name: string | null;
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

interface BigQueryField {
  name: string;
  type: string;
  mode?: string;
  fields?: BigQueryField[];
}

interface BigQueryResponse {
  jobComplete?: boolean;
  jobReference?: { jobId?: string; location?: string };
  schema?: { fields?: BigQueryField[] };
  rows?: { f?: { v: unknown }[] }[];
  pageToken?: string;
}

function bigQueryParameters(params: { clientId: string; startDate: string; endDate: string; previousStartDate: string; campaigns: CampaignAnalyticsScope[] }) {
  const stringParameter = (name: string, value: string) => ({
    name,
    parameterType: { type: "STRING" },
    parameterValue: { value },
  });
  return [
    stringParameter("clientId", params.clientId),
    stringParameter("startDate", params.startDate),
    stringParameter("endDate", params.endDate),
    stringParameter("previousStartDate", params.previousStartDate),
    {
      name: "campaigns",
      parameterType: {
        type: "ARRAY",
        arrayType: {
          type: "STRUCT",
          structTypes: ["source", "accountId", "campaignId"].map((name) => ({ name, type: { type: "STRING" } })),
        },
      },
      parameterValue: {
        arrayValues: params.campaigns.map((campaign) => ({
          structValues: {
            source: { value: campaign.source },
            accountId: { value: campaign.accountId },
            campaignId: { value: campaign.campaignId },
          },
        })),
      },
    },
  ];
}

function concertQueryParameters(params: { clientId: string; startDate: string; endDate: string; patterns: string[] }) {
  const stringParameter = (name: string, value: string) => ({
    name,
    parameterType: { type: "STRING" },
    parameterValue: { value },
  });
  return [
    stringParameter("clientId", params.clientId),
    stringParameter("startDate", params.startDate),
    stringParameter("endDate", params.endDate),
    {
      name: "patterns",
      parameterType: { type: "ARRAY", arrayType: { type: "STRING" } },
      parameterValue: { arrayValues: params.patterns.map((value) => ({ value })) },
    },
  ];
}

function decodeBigQueryRows<T>(payload: BigQueryResponse): T[] {
  const fields = payload.schema?.fields ?? [];
  return (payload.rows ?? []).map((row) => Object.fromEntries(
    fields.map((field, index) => {
      const raw = row.f?.[index]?.v ?? null;
      if (raw !== null && field.type === "TIMESTAMP") {
        return [field.name, new Date(Number(raw) * 1000).toISOString()];
      }
      return [field.name, raw];
    }),
  ) as T);
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

function queryWindow(query: { range: DateRange; startDate?: string; endDate?: string }, timeZone: string) {
  if (query.range === "custom") {
    if (!query.startDate || !query.endDate) throw new Error("ANALYTICS_DATE_RANGE_INVALID");
    const start = new Date(`${query.startDate}T00:00:00.000Z`);
    const end = new Date(`${query.endDate}T00:00:00.000Z`);
    const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (!Number.isFinite(days) || days < 1) throw new Error("ANALYTICS_DATE_RANGE_INVALID");
    return { start, end, days };
  }
  if (query.range === "all") {
    const start = new Date("2000-01-01T00:00:00.000Z");
    const end = new Date(`${reportingDate(timeZone)}T00:00:00.000Z`);
    const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
    return { start, end, days };
  }
  const days = RANGE_DAYS[query.range as keyof typeof RANGE_DAYS];
  const end = new Date(`${reportingDate(timeZone)}T00:00:00.000Z`);
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - days + 1);
  return { start, end, days };
}

function periodLabel(query: AnalyticsQuery, start: Date, end: Date, days: number) {
  if (query.range === "all") return "Todo el historial disponible";
  if (query.range !== "custom") return `Últimos ${days} días`;
  const formatter = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
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

interface ProjectCampaignRow {
  source: string;
  campaign_id: string;
  campaign_name: string;
  spend: unknown;
  billed_spend: unknown;
  impressions: unknown;
  clicks: unknown;
  conversions: unknown;
  revenue: unknown;
}

interface ConcertCreativeRow {
  source: string;
  campaign_id: string;
  campaign_name: string;
  ad_id: string;
  ad_name: string;
  creative_type: string;
  thumbnail_url: string;
  permalink_url: string | null;
}

interface AdMetricsRow {
  ad_id: string;
  billed_spend: unknown;
  impressions: unknown;
  link_clicks: unknown;
  conversions: unknown;
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

// Same anchoring as anchoredPattern(), as a plain JS RegExp instead of a
// BigQuery regex string, used to figure out, in application code, which
// project-wide concert a campaign_name that already matched the combined
// BigQuery filter actually belongs to.
function matchesConcert(campaignName: string, namePattern: string) {
  return new RegExp(`^${escapeRegExp(namePattern.trim())}($|_)`, "i").test(campaignName);
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

function campaignWithRatios(totals: ConcertTotals, campaignId: string, campaignName: string, creatives: ConcertCreative[] = []): ConcertCampaignBreakdown {
  return { campaignId, campaignName, ...totals, ...ratiosOf(totals), creatives };
}

export class BigQueryAnalyticsRepository implements AnalyticsRepository {
  private projectId: string;
  private view: string;
  private creativesView: string;
  private adDailyView: string;
  private credentialsJson?: string;
  private maximumBytesBilled: string;
  private timeZone: string;
  private defaultCurrency: string;

  constructor(config: { projectId?: string; view?: string; credentialsJson?: string; maximumBytesBilled?: string; timeZone?: string; defaultCurrency?: string }) {
    const { projectId, view } = config;
    if (!projectId || !view) {
      throw new Error("GCP_PROJECT_ID and BIGQUERY_ANALYTICS_VIEW are required for BigQuery analytics");
    }
    if (!/^[A-Za-z0-9_.-]+$/.test(view)) throw new Error("BIGQUERY_ANALYTICS_VIEW contains invalid characters");
    this.projectId = projectId;
    this.credentialsJson = config.credentialsJson;
    this.view = view;
    this.creativesView = view.replace(/vw_campaign_daily_performance$/, "vw_campaign_creatives");
    this.adDailyView = view.replace(/vw_campaign_daily_performance$/, "vw_ad_daily_performance");
    this.maximumBytesBilled = config.maximumBytesBilled ?? "250000000";
    this.timeZone = config.timeZone ?? "America/Bogota";
    this.defaultCurrency = config.defaultCurrency ?? "COP";
  }

  private async rows<T>(query: string, queryParameters: Array<{ name: string; parameterType: Record<string, unknown>; parameterValue: Record<string, unknown> }>): Promise<T[]> {
    const token = await googleAccessToken("https://www.googleapis.com/auth/bigquery", this.credentialsJson);
    const response = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(this.projectId)}/queries`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        query,
        useLegacySql: false,
        timeoutMs: 20_000,
        maxResults: 10_000,
        maximumBytesBilled: this.maximumBytesBilled,
        parameterMode: "NAMED",
        queryParameters,
      }),
    });
    if (!response.ok) throw new Error(`BIGQUERY_QUERY_FAILED_${response.status}: ${await response.text()}`);
    let payload = await response.json() as BigQueryResponse;
    if (!payload.jobComplete && payload.jobReference?.jobId) {
      const jobId = payload.jobReference.jobId;
      const location = payload.jobReference.location ? `&location=${encodeURIComponent(payload.jobReference.location)}` : "";
      for (let attempt = 0; attempt < 10 && !payload.jobComplete; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        const poll = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(this.projectId)}/queries/${encodeURIComponent(jobId)}?timeoutMs=20000&maxResults=10000${location}`, { headers: { authorization: `Bearer ${token}` } });
        if (!poll.ok) throw new Error(`BIGQUERY_RESULTS_FAILED_${poll.status}`);
        payload = await poll.json() as BigQueryResponse;
      }
    }
    if (!payload.jobComplete) throw new Error("BIGQUERY_QUERY_TIMEOUT");
    const rows = decodeBigQueryRows<T>(payload);
    let pageToken = payload.pageToken;
    const jobId = payload.jobReference?.jobId;
    const location = payload.jobReference?.location ? `&location=${encodeURIComponent(payload.jobReference.location)}` : "";
    while (pageToken && jobId) {
      const page = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(this.projectId)}/queries/${encodeURIComponent(jobId)}?maxResults=10000&pageToken=${encodeURIComponent(pageToken)}${location}`, { headers: { authorization: `Bearer ${token}` } });
      if (!page.ok) throw new Error(`BIGQUERY_RESULTS_FAILED_${page.status}`);
      const pagePayload = await page.json() as BigQueryResponse;
      rows.push(...decodeBigQueryRows<T>({ ...pagePayload, schema: pagePayload.schema ?? payload.schema }));
      pageToken = pagePayload.pageToken;
    }
    return rows;
  }

  async getDashboard(query: AnalyticsQuery, context?: { firestoreToken?: string }): Promise<DashboardSnapshot> {
    const { start, end, days } = queryWindow(query, this.timeZone);
    const previousEnd = new Date(start);
    previousEnd.setUTCDate(start.getUTCDate() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setUTCDate(previousEnd.getUTCDate() - days + 1);
    if (query.range === "all") previousStart.setTime(start.getTime());

    const scope = await resolveAnalyticsScope(query, context?.firestoreToken);
    const params = {
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
    ORDER BY date`, bigQueryParameters(params));

    if (!rows.length) throw new Error("ANALYTICS_NO_DATA");

    const current = emptyTotals();
    const previous = emptyTotals();
    const trendByDate = new Map<string, Totals>();
    const campaigns = new Map<string, CampaignPerformance & { revenue: number }>();
    const channels = new Map<string, { spend: number; conversions: number }>();
    const currencies = new Set<string>();
    let updatedAt = "";
    let currentRows = 0;

    for (const row of rows) {
      const date = text(row.date);
      const syncedAt = text(row.last_synced_at);
      if (syncedAt > updatedAt) updatedAt = syncedAt;
      if (row.currency_code) currencies.add(String(row.currency_code));
      if (date < isoDate(start)) {
        add(previous, row);
        continue;
      }

      currentRows += 1;
      add(current, row);
      const daily = trendByDate.get(date) ?? emptyTotals();
      add(daily, row);
      trendByDate.set(date, daily);

      const campaignKey = `${row.source}:${row.account_id}:${row.campaign_id}`;
      const campaign = campaigns.get(campaignKey) ?? {
        id: campaignKey,
        name: humanizeCampaignName(row.campaign_name, row.campaign_id),
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

    if (!currentRows) throw new Error("ANALYTICS_NO_DATA");
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

    // Events/ads are supplementary to the core snapshot above — a project
    // with no concerts configured still returns a usable dashboard, just without these two sections.
    let topEvents: EventPerformance[] = [];
    let topAds: AdPerformance[] = [];
    // Rankings are project-wide. Keep them out of a campaign-filtered
    // snapshot so every card in the dashboard represents the same scope.
    if (!query.campaignId) {
      try {
        const concerts = await resolveProjectConcertScope({ projectId: query.projectId }, context?.firestoreToken);
        const eventParams = { clientId: scope.clientId, startDate: params.startDate, endDate: params.endDate, concerts };
        [topEvents, topAds] = await Promise.all([this.projectEvents(eventParams), this.projectTopAds(eventParams)]);
      } catch (error) {
        console.error("[bigquery] project events/ads failed", error);
      }
    }

    return {
      query,
      currency,
      updatedAt: updatedAt || new Date().toISOString(),
      periodLabel: periodLabel(query, start, end, days),
      metrics,
      trend,
      campaigns: campaignRows,
      channelMix,
      insights: buildInsights(channelMix, campaignRows),
      topEvents,
      topAds,
    };
  }

  // Creative previews are supplementary - swallow failures here rather than breaking the whole concert summary
  private async concertCreatives(params: { clientId: string; startDate: string; endDate: string; patterns: string[] }): Promise<{ byCampaign: Map<string, ConcertCreative[]>; campaignNames: Map<string, string> }> {
    const result = new Map<string, ConcertCreative[]>();
    const campaignNames = new Map<string, string>();
    const empty = { byCampaign: result, campaignNames };
    const patternFilter = `EXISTS (
          SELECT 1
          FROM UNNEST(@patterns) AS pattern
          WHERE REGEXP_CONTAINS(campaign_name, pattern)
        )`;
    const patternParams = [
      { name: "clientId", parameterType: { type: "STRING" }, parameterValue: { value: params.clientId } },
      {
        name: "patterns",
        parameterType: { type: "ARRAY", arrayType: { type: "STRING" } },
        parameterValue: { arrayValues: params.patterns.map((value) => ({ value })) },
      },
    ];

    let creativeRows: ConcertCreativeRow[] = [];
    try {
      creativeRows = await this.rows<ConcertCreativeRow>(`SELECT
        source,
        campaign_id,
        campaign_name,
        ad_id,
        ad_name,
        creative_type,
        thumbnail_url,
        permalink_url
      FROM \`${this.creativesView}\`
      WHERE client_id = @clientId
        AND ${patternFilter}`, patternParams);
    } catch (error) {
      console.error("[bigquery] concert creatives query failed", error);
      return empty;
    }
    if (!creativeRows.length) return empty;

    // Metrics are for this specific ad within the selected range, not a
    // lifetime total — same date window as the main campaign query.
    // billed_spend (not spend) is what cost-per-conversion is based on, same
    // agency markup used everywhere else in the app.
    const metricsByAd = new Map<string, { billedSpend: number; impressions: number; linkClicks: number; conversions: number }>();
    try {
      const metricsRows = await this.rows<AdMetricsRow>(`SELECT
        ad_id,
        SUM(billed_spend) AS billed_spend,
        SUM(impressions) AS impressions,
        SUM(link_clicks) AS link_clicks,
        SUM(conversions) AS conversions
      FROM \`${this.adDailyView}\`
      WHERE client_id = @clientId
        AND date BETWEEN DATE(@startDate) AND DATE(@endDate)
        AND ${patternFilter}
      GROUP BY ad_id`, [
        ...patternParams,
        { name: "startDate", parameterType: { type: "STRING" }, parameterValue: { value: params.startDate } },
        { name: "endDate", parameterType: { type: "STRING" }, parameterValue: { value: params.endDate } },
      ]);
      for (const row of metricsRows) {
        metricsByAd.set(row.ad_id, {
          billedSpend: number(row.billed_spend),
          impressions: number(row.impressions),
          linkClicks: number(row.link_clicks),
          conversions: number(row.conversions),
        });
      }
    } catch (error) {
      console.error("[bigquery] concert ad metrics query failed", error);
    }

    for (const row of creativeRows) {
      const key = `${row.source}:${row.campaign_id}`;
      const list = result.get(key) ?? [];
      // Ad-level metrics only exist for meta_ads
      const metrics = row.source === "meta_ads" ? metricsByAd.get(row.ad_id) : undefined;
      list.push({
        adId: row.ad_id,
        adName: row.ad_name,
        creativeType: row.creative_type,
        thumbnailUrl: row.thumbnail_url,
        permalinkUrl: row.permalink_url ?? undefined,
        ...(metrics && {
          impressions: metrics.impressions,
          linkClicks: metrics.linkClicks,
          conversions: metrics.conversions,
          costPerConversion: metrics.conversions ? metrics.billedSpend / metrics.conversions : 0,
        }),
      });
      result.set(key, list);
      if (row.campaign_name) campaignNames.set(key, row.campaign_name);
    }
    return { byCampaign: result, campaignNames };
  }

  // Aggregates every campaign matching any of the project's concerts into
  // per-concert totals, in one query — the project-wide equivalent of the
  // per-campaign breakdown in getConcertSummary.
  private async projectEvents(params: { clientId: string; startDate: string; endDate: string; concerts: ProjectEventScope[] }): Promise<EventPerformance[]> {
    if (!params.concerts.length) return [];
    const patterns = params.concerts.map((concert) => anchoredPattern(concert.namePattern));

    let rows: ProjectCampaignRow[] = [];
    try {
      rows = await this.rows<ProjectCampaignRow>(`SELECT
        source,
        campaign_id,
        ANY_VALUE(campaign_name HAVING MAX last_synced_at) AS campaign_name,
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
      GROUP BY source, campaign_id`, concertQueryParameters({ ...params, patterns }));
    } catch (error) {
      console.error("[bigquery] project events query failed", error);
      return [];
    }

    const totalsByConcert = new Map<string, ConcertTotals>();
    for (const row of rows) {
      const campaignName = text(row.campaign_name);
      const concert = params.concerts.find((item) => matchesConcert(campaignName, item.namePattern));
      if (!concert) continue;
      const totals = totalsByConcert.get(concert.id) ?? { spend: 0, billedSpend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
      totals.spend += number(row.spend);
      totals.billedSpend += number(row.billed_spend);
      totals.impressions += number(row.impressions);
      totals.clicks += number(row.clicks);
      totals.conversions += number(row.conversions);
      totals.revenue += number(row.revenue);
      totalsByConcert.set(concert.id, totals);
    }

    return params.concerts
      .filter((concert) => totalsByConcert.has(concert.id))
      .map((concert) => {
        const totals = totalsByConcert.get(concert.id)!;
        return {
          id: concert.id,
          displayName: concert.displayName,
          artistId: concert.artistId,
          artistName: concert.artistName,
          photoUrl: concert.photoUrl,
          artistPhotoUrl: concert.artistPhotoUrl,
          ...totals,
          ...ratiosOf(totals),
        };
      });
  }

  // Every meta_ads creative (the only source with per-ad metrics) across all
  // of the project's concerts, labeled with which event it belongs to.
  private async projectTopAds(params: { clientId: string; startDate: string; endDate: string; concerts: ProjectEventScope[] }): Promise<AdPerformance[]> {
    if (!params.concerts.length) return [];
    const patterns = params.concerts.map((concert) => anchoredPattern(concert.namePattern));
    const { byCampaign, campaignNames } = await this.concertCreatives({ ...params, patterns });

    const ads: AdPerformance[] = [];
    for (const [key, creatives] of byCampaign) {
      const source = key.slice(0, key.indexOf(":"));
      const campaignName = campaignNames.get(key) ?? "";
      const event = params.concerts.find((concert) => matchesConcert(campaignName, concert.namePattern));
      for (const creative of creatives) {
        if (creative.conversions === undefined) continue;
        ads.push({
          adId: creative.adId,
          adName: creative.adName,
          creativeType: creative.creativeType,
          thumbnailUrl: creative.thumbnailUrl,
          permalinkUrl: creative.permalinkUrl,
          source,
          campaignName,
          eventId: event?.id,
          eventDisplayName: event?.displayName,
          impressions: creative.impressions ?? 0,
          linkClicks: creative.linkClicks ?? 0,
          conversions: creative.conversions,
          costPerConversion: creative.costPerConversion ?? 0,
        });
      }
    }
    return ads;
  }

  async getConcertSummary(query: ConcertQuery, context?: { firestoreToken?: string }): Promise<ConcertSummary> {
    const { start, end } = queryWindow(query, this.timeZone);

    const scope = await resolveConcertScope(query, context?.firestoreToken);
    const params = {
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
    ORDER BY date`, concertQueryParameters(params));

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
    const { byCampaign: creativesByCampaign } = await this.concertCreatives(params);
    const campaignsBySource = new Map<string, ConcertCampaignBreakdown[]>();
    for (const campaign of byCampaign.values()) {
      const list = campaignsBySource.get(campaign.source) ?? [];
      const creativeKey = `${campaign.source}:${campaign.campaignId}`;
      list.push(campaignWithRatios(campaign, campaign.campaignId, campaign.campaignName, creativesByCampaign.get(creativeKey)));
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

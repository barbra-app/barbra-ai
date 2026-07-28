import { BigQuery, type Query } from "@google-cloud/bigquery";
import type { AnalyticsRepository } from "@/lib/data/analytics-repository";
import type {
  AnalyticsQuery,
  CampaignPerformance,
  DashboardSnapshot,
  MetricSummary,
  TrendPoint,
} from "@/lib/domain/analytics";

const RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90 } as const;

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function number(value: unknown) {
  return Number(value ?? 0);
}

function previousValue(current: number, previous: number) {
  return previous || current;
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
    if (!/^[A-Za-z0-9_.-]+$/.test(view)) {
      throw new Error("BIGQUERY_ANALYTICS_VIEW contains invalid characters");
    }
    this.client = new BigQuery({ projectId });
    this.view = view;
  }

  private async rows<T>(query: string, params: Query["params"]): Promise<T[]> {
    const [job] = await this.client.createQueryJob({ query, params, useLegacySql: false, maximumBytesBilled: "1000000000" });
    const [rows] = await job.getQueryResults();
    return rows as T[];
  }

  async getDashboard(query: AnalyticsQuery): Promise<DashboardSnapshot> {
    const days = RANGE_DAYS[query.range];
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(end.getUTCDate() - days + 1);
    const previousEnd = new Date(start);
    previousEnd.setUTCDate(start.getUTCDate() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setUTCDate(previousEnd.getUTCDate() - days + 1);

    const params = {
      organizationId: query.organizationId,
      projectId: query.projectId,
      campaignId: query.campaignId ?? null,
      startDate: isoDate(start),
      endDate: isoDate(end),
      previousStartDate: isoDate(previousStart),
      previousEndDate: isoDate(previousEnd),
    };
    const scope = `organization_id = @organizationId AND project_id = @projectId AND (@campaignId IS NULL OR campaign_id = @campaignId)`;

    const [totalsRows, trendRows, campaignRows, channelRows] = await Promise.all([
      this.rows<any>(`SELECT
        SUM(IF(date BETWEEN @startDate AND @endDate, spend, 0)) spend,
        SUM(IF(date BETWEEN @previousStartDate AND @previousEndDate, spend, 0)) previous_spend,
        SUM(IF(date BETWEEN @startDate AND @endDate, impressions, 0)) impressions,
        SUM(IF(date BETWEEN @previousStartDate AND @previousEndDate, impressions, 0)) previous_impressions,
        SUM(IF(date BETWEEN @startDate AND @endDate, clicks, 0)) clicks,
        SUM(IF(date BETWEEN @previousStartDate AND @previousEndDate, clicks, 0)) previous_clicks,
        SUM(IF(date BETWEEN @startDate AND @endDate, conversions, 0)) conversions,
        SUM(IF(date BETWEEN @previousStartDate AND @previousEndDate, conversions, 0)) previous_conversions,
        SUM(IF(date BETWEEN @startDate AND @endDate, revenue, 0)) revenue,
        SUM(IF(date BETWEEN @previousStartDate AND @previousEndDate, revenue, 0)) previous_revenue
      FROM \`${this.view}\`
      WHERE ${scope} AND date BETWEEN @previousStartDate AND @endDate`, params),
      this.rows<any>(`SELECT date, SUM(spend) spend, SUM(revenue) revenue, SUM(conversions) conversions
        FROM \`${this.view}\` WHERE ${scope} AND date BETWEEN @startDate AND @endDate
        GROUP BY date ORDER BY date`, params),
      this.rows<any>(`SELECT campaign_id id, ANY_VALUE(campaign_name) name, ANY_VALUE(source) channel,
        SUM(spend) spend, SUM(conversions) conversions, SAFE_DIVIDE(SUM(spend), SUM(conversions)) cpa,
        SAFE_DIVIDE(SUM(revenue), SUM(spend)) roas
        FROM \`${this.view}\` WHERE ${scope} AND date BETWEEN @startDate AND @endDate
        GROUP BY campaign_id ORDER BY spend DESC LIMIT 12`, params),
      this.rows<any>(`SELECT source channel, SUM(spend) spend, SUM(conversions) conversions
        FROM \`${this.view}\` WHERE ${scope} AND date BETWEEN @startDate AND @endDate
        GROUP BY source ORDER BY spend DESC`, params),
    ]);

    const total = totalsRows[0] ?? {};
    const spend = number(total.spend);
    const conversions = number(total.conversions);
    const previousSpend = number(total.previous_spend);
    const previousConversions = number(total.previous_conversions);
    const revenue = number(total.revenue);
    const previousRevenue = number(total.previous_revenue);
    const metrics: MetricSummary[] = [
      { id: "spend", label: "Inversión", value: spend, previousValue: previousValue(spend, previousSpend), format: "currency", positiveWhen: "up" },
      { id: "impressions", label: "Impresiones", value: number(total.impressions), previousValue: previousValue(number(total.impressions), number(total.previous_impressions)), format: "number", positiveWhen: "up" },
      { id: "clicks", label: "Clics", value: number(total.clicks), previousValue: previousValue(number(total.clicks), number(total.previous_clicks)), format: "number", positiveWhen: "up" },
      { id: "conversions", label: "Conversiones", value: conversions, previousValue: previousValue(conversions, previousConversions), format: "number", positiveWhen: "up" },
      { id: "cpa", label: "CPA", value: conversions ? spend / conversions : 0, previousValue: previousConversions ? previousSpend / previousConversions : 0, format: "currency", positiveWhen: "down" },
      { id: "roas", label: "ROAS", value: spend ? revenue / spend : 0, previousValue: previousSpend ? previousRevenue / previousSpend : 0, format: "ratio", positiveWhen: "up" },
    ];
    const colors = ["#2142ff", "#f5c842", "#9dd89c", "#f97316", "#8b5cf6"];

    return {
      query,
      currency: process.env.BIGQUERY_DEFAULT_CURRENCY ?? "COP",
      updatedAt: new Date().toISOString(),
      periodLabel: `Últimos ${days} días`,
      metrics,
      trend: trendRows.map((row): TrendPoint => ({ date: String(row.date?.value ?? row.date), spend: number(row.spend), revenue: number(row.revenue), conversions: number(row.conversions) })),
      campaigns: campaignRows.map((row): CampaignPerformance => ({ id: String(row.id), name: String(row.name), channel: String(row.channel), status: "active", spend: number(row.spend), conversions: number(row.conversions), cpa: number(row.cpa), roas: number(row.roas) })),
      channelMix: channelRows.map((row, index) => ({ channel: String(row.channel), spend: number(row.spend), conversions: number(row.conversions), color: colors[index % colors.length] })),
      insights: [],
    };
  }
}

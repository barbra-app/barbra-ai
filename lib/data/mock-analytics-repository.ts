import type { AnalyticsRepository } from "@/lib/data/analytics-repository";
import {
  DEMO_CAMPAIGNS,
  type AnalyticsQuery,
  type CampaignPerformance,
  type ConcertCampaignBreakdown,
  type ConcertPlatformBreakdown,
  type ConcertQuery,
  type ConcertSummary,
  type DashboardSnapshot,
  type TrendPoint,
} from "@/lib/domain/analytics";

const CONCERT_SOURCES = ["google_ads", "meta_ads", "tiktok_ads"] as const;
const BILLED_SPEND_MARKUP = 1.6;

function concertMetrics(spend: number, conversions: number, revenue: number | null) {
  const impressions = round(spend * 42);
  const clicks = round(spend / 610);
  return {
    spend: round(spend),
    billedSpend: round(spend * BILLED_SPEND_MARKUP),
    impressions,
    clicks,
    conversions: round(conversions, 2),
    revenue: revenue === null ? 0 : round(revenue),
    ctr: impressions ? clicks / impressions : 0,
    cpc: clicks ? spend / clicks : 0,
    cpa: conversions ? spend / conversions : 0,
    roas: revenue !== null && spend ? revenue / spend : 0,
  };
}

function concertBreakdown(
  source: string,
  spend: number,
  conversions: number,
  revenue: number | null,
  concertLabel: string,
  rand: () => number,
): ConcertPlatformBreakdown {
  const split = 0.55 + rand() * 0.15;
  const campaignShares: [string, number][] = [
    [`${concertLabel} — Conversión`, split],
    [`${concertLabel} — Tráfico`, 1 - split],
  ];
  const campaigns: ConcertCampaignBreakdown[] = campaignShares.map(([campaignName, share], index) => ({
    campaignId: `${source}_${index}`,
    campaignName,
    ...concertMetrics(spend * share, conversions * share, revenue === null ? null : revenue * share),
  }));
  return { source, campaigns, ...concertMetrics(spend, conversions, revenue) };
}

const PROJECT_FACTORS: Record<string, number> = {
  prj_ritvales: 1,
  prj_estereo: 1.36,
  prj_atelier: 0.74,
};

const RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90 } as const;

function rangeDays(query: { range: string; startDate?: string; endDate?: string }) {
  if (query.range === "custom" && query.startDate && query.endDate) {
    const start = new Date(`${query.startDate}T00:00:00.000Z`);
    const end = new Date(`${query.endDate}T00:00:00.000Z`);
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  }
  return RANGE_DAYS[query.range as keyof typeof RANGE_DAYS] ?? 30;
}

function round(value: number, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function seeded(seed: string) {
  let value = Array.from(seed).reduce((acc, char) => acc + char.charCodeAt(0), 0) || 1;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

function buildTrend(query: AnalyticsQuery, factor: number): TrendPoint[] {
  const days = rangeDays(query);
  const points = query.range === "7d" ? 7 : query.range === "30d" ? 15 : 18;
  const step = Math.max(1, Math.floor(days / points));
  const rand = seeded(`${query.projectId}:${query.campaignId ?? "all"}:${query.range}`);
  const end = new Date();
  const campaignFactor = query.campaignId ? 0.36 : 1;

  return Array.from({ length: points }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (points - index - 1) * step);
    const pulse = 0.82 + Math.sin(index / 2.1) * 0.13 + rand() * 0.24;
    const spend = round(1850000 * factor * campaignFactor * pulse);
    const roas = 2.4 + Math.sin(index / 3) * 0.45 + rand() * 0.55;
    return {
      date: date.toISOString().slice(0, 10),
      spend,
      revenue: round(spend * roas),
      conversions: Math.max(1, round((spend / 67000) * (0.82 + rand() * 0.35))),
    };
  });
}

function buildCampaigns(query: AnalyticsQuery, factor: number): CampaignPerformance[] {
  const candidates = DEMO_CAMPAIGNS.filter((campaign) => campaign.projectId === query.projectId);
  const base = candidates.length ? candidates : DEMO_CAMPAIGNS.slice(0, 3);
  const selected = query.campaignId ? base.filter((campaign) => campaign.id === query.campaignId) : base;

  return selected.map((campaign, index) => {
    const spend = round((12900000 - index * 2180000) * factor);
    const conversions = Math.max(12, round(184 - index * 31));
    const cpa = round(spend / conversions);
    return {
      id: campaign.id,
      name: campaign.name,
      channel: campaign.channel,
      status: campaign.status,
      spend,
      conversions,
      cpa,
      roas: round(3.42 - index * 0.47, 2),
    };
  });
}

export class MockAnalyticsRepository implements AnalyticsRepository {
  async getDashboard(query: AnalyticsQuery): Promise<DashboardSnapshot> {
    const factor = PROJECT_FACTORS[query.projectId] ?? 1;
    const rangeFactor = rangeDays(query) / 30;
    const campaignFactor = query.campaignId ? 0.36 : 1;
    const spend = round(43890000 * factor * rangeFactor * campaignFactor);
    const impressions = round(2840000 * factor * rangeFactor * campaignFactor);
    const clicks = round(71340 * factor * rangeFactor * campaignFactor);
    const conversions = round(642 * factor * rangeFactor * campaignFactor);
    const revenue = spend * 3.18;
    const campaigns = buildCampaigns(query, factor * rangeFactor);

    return {
      query,
      currency: "COP",
      updatedAt: new Date().toISOString(),
      periodLabel: query.range === "7d" ? "Últimos 7 días" : query.range === "30d" ? "Últimos 30 días" : "Últimos 90 días",
      metrics: [
        { id: "spend", label: "Inversión", value: spend, previousValue: spend / 1.084, format: "currency", positiveWhen: "up" },
        { id: "impressions", label: "Impresiones", value: impressions, previousValue: impressions / 1.126, format: "number", positiveWhen: "up" },
        { id: "clicks", label: "Clics", value: clicks, previousValue: clicks / 1.063, format: "number", positiveWhen: "up" },
        { id: "conversions", label: "Conversiones", value: conversions, previousValue: conversions / 1.174, format: "number", positiveWhen: "up" },
        { id: "cpa", label: "CPA", value: spend / conversions, previousValue: (spend / conversions) * 1.092, format: "currency", positiveWhen: "down" },
        { id: "roas", label: "ROAS", value: revenue / spend, previousValue: 2.91, format: "ratio", positiveWhen: "up" },
      ],
      trend: buildTrend(query, factor),
      channelMix: [
        { channel: "Meta", spend: spend * 0.48, conversions: round(conversions * 0.42), color: "#2142ff" },
        { channel: "Google", spend: spend * 0.34, conversions: round(conversions * 0.41), color: "#f5c842" },
        { channel: "TikTok", spend: spend * 0.12, conversions: round(conversions * 0.1), color: "#9dd89c" },
        { channel: "LinkedIn", spend: spend * 0.06, conversions: round(conversions * 0.07), color: "#f97316" },
      ],
      campaigns,
      insights: [
        { id: "ins_1", tone: "opportunity", title: "Google está convirtiendo mejor", summary: "Genera 41% de las conversiones con 34% de la inversión.", metric: "+21% eficiencia", action: "Revisar redistribución" },
        { id: "ins_2", tone: "risk", title: "Fatiga en retargeting", summary: "La frecuencia subió mientras el CTR cayó durante cinco días.", metric: "CTR −14%", action: "Rotar creatividades" },
        { id: "ins_3", tone: "info", title: "Pacing saludable", summary: "La inversión está alineada con el presupuesto mensual.", metric: "96% pacing", action: "Mantener monitoreo" },
      ],
    };
  }

  async getConcertSummary(query: ConcertQuery): Promise<ConcertSummary> {
    const factor = PROJECT_FACTORS[query.projectId] ?? 1;
    const rangeFactor = rangeDays(query) / 30;
    const rand = seeded(`${query.artistId}:${query.concertId ?? "all"}:${query.range}`);

    const byPlatform = CONCERT_SOURCES.map((source, index) => {
      const spend = 4200000 * factor * rangeFactor * (0.6 + rand() * 0.8) * (1 - index * 0.22);
      const conversions = Math.max(1, (spend / 68000) * (0.75 + rand() * 0.4));
      const hasRevenue = source !== "tiktok_ads"; // matches the real revenue gap for tiktok_ads
      return concertBreakdown(source, spend, conversions, hasRevenue ? spend * (2.6 + rand() * 1.2) : null, query.artistId, rand);
    }).sort((a, b) => b.spend - a.spend);

    const combined = byPlatform.reduce(
      (sum, row) => ({
        spend: sum.spend + row.spend,
        billedSpend: sum.billedSpend + row.billedSpend,
        impressions: sum.impressions + row.impressions,
        clicks: sum.clicks + row.clicks,
        conversions: sum.conversions + row.conversions,
        revenue: sum.revenue + row.revenue,
      }),
      { spend: 0, billedSpend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 },
    );

    const days = rangeDays(query);
    const points = days <= 7 ? days : days <= 30 ? 15 : 18;
    const step = Math.max(1, Math.floor(days / points));
    const end = new Date();
    const trend = Array.from({ length: points }, (_, index) => {
      const date = new Date(end);
      date.setUTCDate(end.getUTCDate() - (points - index - 1) * step);
      const pulse = 0.75 + Math.sin(index / 2.3) * 0.18 + rand() * 0.28;
      return {
        date: date.toISOString().slice(0, 10),
        billedSpend: round((combined.billedSpend / points) * pulse),
        conversions: round((combined.conversions / points) * pulse, 2),
      };
    });
    const platformTrend = byPlatform.flatMap((platform) =>
      Array.from({ length: points }, (_, index) => {
        const date = new Date(end);
        date.setUTCDate(end.getUTCDate() - (points - index - 1) * step);
        const pulse = 0.75 + Math.sin(index / 2.3 + platform.source.length) * 0.18 + rand() * 0.28;
        return {
          date: date.toISOString().slice(0, 10),
          source: platform.source,
          ...concertMetrics(
            (platform.spend / points) * pulse,
            (platform.conversions / points) * pulse,
            platform.revenue ? (platform.revenue / points) * pulse : null,
          ),
        };
      }),
    );

    return {
      query,
      currency: "COP",
      updatedAt: new Date().toISOString(),
      total: {
        source: "total",
        campaigns: [],
        ...combined,
        ctr: combined.impressions ? combined.clicks / combined.impressions : 0,
        cpc: combined.clicks ? combined.spend / combined.clicks : 0,
        cpa: combined.conversions ? combined.spend / combined.conversions : 0,
        roas: combined.spend ? combined.revenue / combined.spend : 0,
      },
      byPlatform,
      trend,
      platformTrend,
    };
  }
}

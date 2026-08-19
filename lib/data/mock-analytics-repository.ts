import type { AnalyticsRepository } from "@/lib/data/analytics-repository";
import {
  DEMO_CAMPAIGNS,
  type AnalyticsQuery,
  type CampaignPerformance,
  type DashboardSnapshot,
  type TrendPoint,
} from "@/lib/domain/analytics";

const PROJECT_FACTORS: Record<string, number> = {
  prj_ritvales: 1,
  prj_estereo: 1.36,
  prj_atelier: 0.74,
};

const RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90 } as const;

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
  const days = RANGE_DAYS[query.range];
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
    const rangeFactor = RANGE_DAYS[query.range] / 30;
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
        { channel: "Meta", spend: spend * 0.48, conversions: round(conversions * 0.42), color: "var(--color-chart-1)" },
        { channel: "Google", spend: spend * 0.34, conversions: round(conversions * 0.41), color: "var(--color-chart-2)" },
        { channel: "TikTok", spend: spend * 0.12, conversions: round(conversions * 0.1), color: "var(--color-chart-3)" },
        { channel: "LinkedIn", spend: spend * 0.06, conversions: round(conversions * 0.07), color: "var(--color-chart-4)" },
      ],
      campaigns,
      insights: [
        { id: "ins_1", tone: "opportunity", title: "Google está convirtiendo mejor", summary: "Genera 41% de las conversiones con 34% de la inversión.", metric: "+21% eficiencia", action: "Revisar redistribución" },
        { id: "ins_2", tone: "risk", title: "Fatiga en retargeting", summary: "La frecuencia subió mientras el CTR cayó durante cinco días.", metric: "CTR −14%", action: "Rotar creatividades" },
        { id: "ins_3", tone: "info", title: "Pacing saludable", summary: "La inversión está alineada con el presupuesto mensual.", metric: "96% pacing", action: "Mantener monitoreo" },
      ],
    };
  }
}

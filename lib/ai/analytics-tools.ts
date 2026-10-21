import { tool, type JSONValue } from "ai";
import { z } from "zod";
import { getAnalyticsRepository } from "@/lib/data/get-analytics-repository";
import type { ConcertSegmentBreakdown, ConcertSummary, DashboardSnapshot, DateRange } from "@/lib/domain/analytics";

type ToolPeriod = {
  range?: DateRange;
  startDate?: string;
  endDate?: string;
  presentation?: "compact" | "visual";
};

// Long ranges ("all", wide custom) produce hundreds of daily points that the
// model re-reads on every turn; weekly buckets keep the shape at a fraction of
// the tokens. The UI still receives the full daily series.
function compactTrend<T extends { date: string }>(points: T[], sumKeys: (keyof T)[]) {
  if (points.length <= 45) return points;
  const buckets: Array<Record<string, string | number>> = [];
  for (let index = 0; index < points.length; index += 7) {
    const week = points.slice(index, index + 7);
    const bucket: Record<string, string | number> = { weekStart: week[0].date, weekEnd: week[week.length - 1].date };
    for (const key of sumKeys) bucket[String(key)] = week.reduce((sum, point) => sum + Number(point[key]), 0);
    buckets.push(bucket);
  }
  return buckets;
}

// Domain interfaces lack an index signature, so they don't satisfy JSONValue
// structurally even though they serialize cleanly.
function jsonOutput(value: unknown) {
  return { type: "json" as const, value: value as JSONValue };
}

function metricValue(snapshot: DashboardSnapshot, id: string) {
  return snapshot.metrics.find((metric) => metric.id === id);
}

function snapshotInsight(snapshot: DashboardSnapshot) {
  const roas = metricValue(snapshot, "roas");
  const conversions = metricValue(snapshot, "conversions");
  const roasUp = Boolean(roas && roas.value > roas.previousValue);
  const conversionsUp = Boolean(conversions && conversions.value > conversions.previousValue);
  if (roasUp && !conversionsUp) return "El retorno mejoró mientras el volumen de conversiones cayó frente al periodo anterior; el agregado no permite atribuir una causa específica.";
  if (roasUp && conversionsUp) return "El retorno y el volumen de conversiones mejoraron frente al periodo anterior; revisa las campañas para identificar dónde se concentró la ganancia.";
  if (!roasUp && conversionsUp) return "El volumen de conversiones aumentó, pero el retorno cayó frente al periodo anterior; conviene revisar el costo y la calidad del crecimiento.";
  return "El retorno y el volumen de conversiones cayeron frente al periodo anterior; el ranking de campañas permite localizar las señales más relevantes.";
}

function campaignInsight(sortBy: "spend" | "conversions" | "cpa" | "roas", rows: DashboardSnapshot["campaigns"], scaleCandidate: DashboardSnapshot["campaigns"][number] | null) {
  const leader = rows[0];
  if (!leader) return "No hay campañas con inversión verificable en el periodo seleccionado.";
  if (sortBy === "cpa") return `${leader.name} registra el CPA más bajo entre las campañas con inversión y conversiones en el periodo.`;
  if (sortBy === "conversions") return `${leader.name} lidera el volumen de conversiones entre las campañas verificadas del periodo.`;
  if (sortBy === "spend") return `${leader.name} concentra la mayor inversión entre las campañas verificadas del periodo.`;
  if (scaleCandidate && scaleCandidate.id !== leader.id) return `${leader.name} lidera el ROAS, pero ${scaleCandidate.name} es la primera candidata activa; valida estabilidad antes de escalar.`;
  return `${leader.name} lidera el ROAS y es la primera candidata activa; valida estabilidad y capacidad de absorber presupuesto antes de escalar.`;
}

export function getAnalyticsTools(context: {
  organizationId: string;
  projectId: string;
  campaignId?: string | null;
  range: DateRange;
  startDate?: string;
  endDate?: string;
}, auth?: { firestoreToken?: string }) {
  const periodSchema = {
    range: z.enum(["7d", "30d", "90d", "all", "custom"]).optional().describe("Period to query. Use all for all available history and custom with startDate/endDate for explicit dates."),
    startDate: z.string().date().optional().describe("Inclusive YYYY-MM-DD start date; required when range is custom."),
    endDate: z.string().date().optional().describe("Inclusive YYYY-MM-DD end date; required when range is custom."),
    presentation: z.enum(["compact", "visual"]).default("compact").describe("Use visual for requests to show, compare, rank, break down or explore. Use compact for a direct question answered best in prose."),
  };
  const campaignSortSchema = z.enum(["spend", "conversions", "cpa", "roas"]);
  const cache = new Map<string, Promise<DashboardSnapshot>>();
  const snapshot = (period: ToolPeriod = {}, campaignId?: string | null) => {
    const range = period.range ?? context.range;
    const startDate = range === "custom" ? period.startDate ?? context.startDate : undefined;
    const endDate = range === "custom" ? period.endDate ?? context.endDate : undefined;
    if (range === "custom" && (!startDate || !endDate || startDate > endDate)) {
      throw new Error("ANALYTICS_DATE_RANGE_INVALID");
    }
    const selectedCampaignId = campaignId === undefined ? context.campaignId : campaignId;
    const key = `${range}:${startDate ?? ""}:${endDate ?? ""}:${selectedCampaignId ?? "all"}`;
    const existing = cache.get(key);
    if (existing) return existing;
    const pending = getAnalyticsRepository().then((repository) => repository.getDashboard({
      ...context,
      campaignId: selectedCampaignId,
      range,
      startDate,
      endDate,
    }, auth));
    cache.set(key, pending);
    return pending;
  };

  return {
    get_dashboard_snapshot: tool({
      description: "Get verified KPI totals, trend data, channel mix and current insights for the selected scope. Supports presets, all available history, or explicit custom dates.",
      inputSchema: z.object(periodSchema),
      execute: async (period) => {
        const data = await snapshot(period);
        return { ...data, presentation: period.presentation, verifiedInsight: snapshotInsight(data) };
      },
      // The UI renders the full snapshot; the model only needs the KPIs and
      // trend — campaigns/events/ads have their own tool and would otherwise
      // be resent with the history on every turn.
      toModelOutput: ({ output }) => jsonOutput({
        periodLabel: output.periodLabel,
        currency: output.currency,
        metrics: output.metrics,
        trend: compactTrend(output.trend, ["spend", "revenue", "conversions"]),
        channelMix: output.channelMix.map(({ color: _color, ...row }) => row),
        insights: output.insights,
        verifiedInsight: output.verifiedInsight,
      }),
    }),
    get_campaign_performance: tool({
      description: "Compare verified campaigns in the selected project for presets, all available history, or explicit custom dates. Use sortBy=roas for return or scale questions, cpa for acquisition cost, conversions for volume, and spend for investment concentration.",
      inputSchema: z.object({
        ...periodSchema,
        limit: z.number().int().min(1).max(12).default(8),
        sortBy: campaignSortSchema.default("spend"),
      }),
      execute: async ({ range, startDate, endDate, presentation, limit, sortBy }) => {
        const data = await snapshot({ range, startDate, endDate }, null);
        const eligible = data.campaigns.filter((row) => row.spend > 0);
        const sorted = [...eligible].sort((left, right) => {
          if (sortBy === "cpa") {
            const leftValue = left.conversions > 0 ? left.cpa : Number.POSITIVE_INFINITY;
            const rightValue = right.conversions > 0 ? right.cpa : Number.POSITIVE_INFINITY;
            return leftValue - rightValue;
          }
          return right[sortBy] - left[sortBy];
        });
        const byRoas = [...eligible].filter((row) => row.roas > 0).sort((left, right) => right.roas - left.roas)[0] ?? null;
        const byCpa = [...eligible].filter((row) => row.conversions > 0).sort((left, right) => left.cpa - right.cpa)[0] ?? null;
        const byConversions = [...eligible].sort((left, right) => right.conversions - left.conversions)[0] ?? null;
        const scaleCandidate = [...eligible]
          .filter((row) => row.status === "active" && row.conversions > 0 && row.roas > 0)
          .sort((left, right) => right.roas - left.roas)[0] ?? null;
        return {
          rows: sorted.slice(0, limit),
          sortBy,
          presentation,
          periodLabel: data.periodLabel,
          summary: { topRoas: byRoas, lowestCpa: byCpa, highestConversions: byConversions, scaleCandidate },
          verifiedInsight: campaignInsight(sortBy, sorted.slice(0, limit), scaleCandidate),
          updatedAt: data.updatedAt,
          currency: data.currency,
        };
      },
    }),
    get_channel_mix: tool({
      description: "Compare verified media channels by spend, conversions, CPA, spend share and conversion share for presets, all available history, or explicit custom dates.",
      inputSchema: z.object(periodSchema),
      execute: async (period) => {
        const data = await snapshot(period);
        const totalSpend = data.channelMix.reduce((sum, row) => sum + row.spend, 0);
        const totalConversions = data.channelMix.reduce((sum, row) => sum + row.conversions, 0);
        const rows = data.channelMix.map((row) => ({
          ...row,
          cpa: row.conversions > 0 ? row.spend / row.conversions : 0,
          spendShare: totalSpend > 0 ? row.spend / totalSpend : 0,
          conversionShare: totalConversions > 0 ? row.conversions / totalConversions : 0,
        }));
        return {
          rows,
          presentation: period.presentation,
          periodLabel: data.periodLabel,
          totals: { spend: totalSpend, conversions: totalConversions },
          channelCount: rows.length,
          verifiedInsight: rows.length === 1
            ? `${rows[0].channel} es el único canal con datos normalizados en el periodo seleccionado.`
            : "La comparación muestra la participación de inversión y conversiones de cada canal normalizado en el periodo seleccionado.",
          updatedAt: data.updatedAt,
          currency: data.currency,
        };
      },
    }),
  };
}

// Mirrors the source coverage notes in concerts-view.tsx — not every ad
// platform reports every dimension, so the model must say which sources a
// breakdown actually covers.
const CONCERT_BREAKDOWNS = {
  device: { key: "deviceBreakdown", label: "dispositivo", sources: ["meta_ads", "google_ads", "tiktok_ads", "dv360"] },
  geo: { key: "geoBreakdown", label: "región", sources: ["meta_ads", "google_ads", "tiktok_ads", "dv360"] },
  age: { key: "ageBreakdown", label: "edad", sources: ["meta_ads", "google_ads", "tiktok_ads"] },
  gender: { key: "genderBreakdown", label: "sexo", sources: ["meta_ads", "google_ads", "tiktok_ads"] },
  publisher_platform: { key: "publisherPlatformBreakdown", label: "plataforma de publicación", sources: ["meta_ads", "google_ads"] },
} as const satisfies Record<string, { key: keyof ConcertSummary; label: string; sources: string[] }>;

// Concert answers are framed on billed spend ("gasto") only; keeping the raw
// platform spend out of the model's context stops it from mixing the two.
function withoutRealSpend<T extends { spend: number }>({ spend: _spend, ...row }: T) {
  return row;
}

type SegmentTotals =Omit<ConcertSegmentBreakdown, "label" | "source">;

function segmentMetrics(row: SegmentTotals, totals: SegmentTotals) {
  return {
    billedSpend: row.billedSpend,
    impressions: row.impressions,
    clicks: row.clicks,
    conversions: row.conversions,
    ctr: row.impressions > 0 ? row.clicks / row.impressions : 0,
    cpc: row.clicks > 0 ? row.billedSpend / row.clicks : 0,
    cpa: row.conversions > 0 ? row.billedSpend / row.conversions : 0,
    spendShare: totals.billedSpend > 0 ? row.billedSpend / totals.billedSpend : 0,
    conversionShare: totals.conversions > 0 ? row.conversions / totals.conversions : 0,
  };
}

function sumSegments(rows: ConcertSegmentBreakdown[]): SegmentTotals {
  return rows.reduce<SegmentTotals>((sum, row) => ({
    spend: sum.spend + row.spend,
    billedSpend: sum.billedSpend + row.billedSpend,
    impressions: sum.impressions + row.impressions,
    clicks: sum.clicks + row.clicks,
    conversions: sum.conversions + row.conversions,
  }), { spend: 0, billedSpend: 0, impressions: 0, clicks: 0, conversions: 0 });
}

export function getConcertAnalyticsTools(context: {
  organizationId: string;
  projectId: string;
  artistId: string;
  concertId?: string | null;
  range: DateRange;
  startDate?: string;
  endDate?: string;
}, auth?: { firestoreToken?: string }) {
  const periodSchema = {
    range: z.enum(["7d", "30d", "90d", "all", "custom"]).optional().describe(`Period to query. Omit to use the period selected in the UI (currently "${context.range}"), which is what the user sees on screen. Only set it when the user explicitly asks for a different period.`),
    startDate: z.string().date().optional().describe("Inclusive YYYY-MM-DD start date; required when range is custom."),
    endDate: z.string().date().optional().describe("Inclusive YYYY-MM-DD end date; required when range is custom."),
  };
  const cache = new Map<string, Promise<ConcertSummary>>();
  const summary = (period: Omit<ToolPeriod, "presentation"> = {}) => {
    const range = period.range ?? context.range;
    const startDate = range === "custom" ? period.startDate ?? context.startDate : undefined;
    const endDate = range === "custom" ? period.endDate ?? context.endDate : undefined;
    if (range === "custom" && (!startDate || !endDate || startDate > endDate)) {
      throw new Error("ANALYTICS_DATE_RANGE_INVALID");
    }
    const key = `${range}:${startDate ?? ""}:${endDate ?? ""}`;
    const existing = cache.get(key);
    if (existing) return existing;
    const pending = getAnalyticsRepository().then((repository) => repository.getConcertSummary({
      ...context,
      range,
      startDate,
      endDate,
    }, auth));
    cache.set(key, pending);
    return pending;
  };

  return {
    get_concert_summary: tool({
      description: "Get verified KPI totals per platform (Google Ads, Meta Ads, TikTok Ads), manually reported sources (e.g. Uber) and combined trend for the selected artist/concert. Supports presets, all available history, or explicit custom dates.",
      inputSchema: z.object(periodSchema),
      execute: async (period) => {
        const data = await summary(period);
        return {
          total: data.total,
          byPlatform: data.byPlatform.map(({ campaigns: _campaigns, ...platform }) => platform),
          manualSources: data.manualSources.map(({ id: _id, updatedAt: _updatedAt, ...source }) => source),
          trend: data.trend,
          updatedAt: data.updatedAt,
          currency: data.currency,
        };
      },
      toModelOutput: ({ output }) => jsonOutput({
        ...output,
        total: withoutRealSpend(output.total),
        byPlatform: output.byPlatform.map(withoutRealSpend),
        trend: compactTrend(output.trend, ["billedSpend", "conversions"]),
      }),
    }),
    get_concert_campaigns: tool({
      description: "List individual campaigns across all platforms for the selected artist/concert, with their names and metrics, so a specific campaign can be looked up by name. Supports presets, all available history, or explicit custom dates.",
      inputSchema: z.object(periodSchema),
      execute: async (period) => {
        const data = await summary(period);
        // Creatives (thumbnails, links) are UI-only and would bloat the
        // model's context on every turn.
        const rows = data.byPlatform.flatMap((platform) =>
          platform.campaigns.map(({ creatives: _creatives, ...campaign }) => ({ source: platform.source, ...campaign })),
        );
        return { rows, updatedAt: data.updatedAt, currency: data.currency };
      },
      toModelOutput: ({ output }) => jsonOutput({ ...output, rows: output.rows.map(withoutRealSpend) }),
    }),
    get_concert_breakdown: tool({
      description: "Break down the selected artist/concert by one audience or placement dimension: device, geo (region), age, gender, or publisher_platform (Facebook, Instagram, Search, YouTube…). Returns billed spend, impressions, clicks, conversions, CTR, CPC, CPA and shares per segment. Segments have no revenue, so ROAS is not available here.",
      inputSchema: z.object({
        ...periodSchema,
        dimension: z.enum(["device", "geo", "age", "gender", "publisher_platform"]),
        sortBy: z.enum(["billedSpend", "conversions", "impressions", "clicks"]).default("billedSpend"),
        limit: z.number().int().min(1).max(20).default(10),
      }),
      execute: async ({ dimension, sortBy, limit, ...period }) => {
        const data = await summary(period);
        const config = CONCERT_BREAKDOWNS[dimension];
        const all = data[config.key];
        const totals = sumSegments(all);
        const sorted = [...all].sort((left, right) => right[sortBy] - left[sortBy]);
        const top = sorted.slice(0, limit);
        const rest = sorted.slice(limit);
        return {
          dimension,
          dimensionLabel: config.label,
          sortBy,
          sources: config.sources,
          rows: top.map((row) => ({ label: row.label, ...(row.source ? { source: row.source } : {}), ...segmentMetrics(row, totals) })),
          // Long tails (mostly geo) are summed so shares still add up to 100%.
          others: rest.length ? { segmentCount: rest.length, ...segmentMetrics(sumSegments(rest), totals) } : null,
          totals: segmentMetrics(totals, totals),
          updatedAt: data.updatedAt,
          currency: data.currency,
        };
      },
    }),
  };
}

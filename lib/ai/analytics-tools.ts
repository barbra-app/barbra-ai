import { tool } from "ai";
import { z } from "zod";
import { getAnalyticsRepository } from "@/lib/data/get-analytics-repository";
import type { DashboardSnapshot, DateRange } from "@/lib/domain/analytics";

type ToolPeriod = {
  range?: DateRange;
  startDate?: string;
  endDate?: string;
};

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
        return { ...data, verifiedInsight: snapshotInsight(data) };
      },
    }),
    get_campaign_performance: tool({
      description: "Compare verified campaigns in the selected project for presets, all available history, or explicit custom dates. Use sortBy=roas for return or scale questions, cpa for acquisition cost, conversions for volume, and spend for investment concentration.",
      inputSchema: z.object({
        ...periodSchema,
        limit: z.number().int().min(1).max(12).default(8),
        sortBy: campaignSortSchema.default("spend"),
      }),
      execute: async ({ range, startDate, endDate, limit, sortBy }) => {
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

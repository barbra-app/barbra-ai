import { tool } from "ai";
import { z } from "zod";
import { getAnalyticsRepository } from "@/lib/data/get-analytics-repository";
import type { DateRangePreset } from "@/lib/domain/analytics";

export function getAnalyticsTools(context: {
  organizationId: string;
  projectId: string;
  campaignId?: string | null;
}) {
  const rangeSchema = z.enum(["7d", "30d", "90d"]).default("30d");
  const snapshot = (range: DateRangePreset, campaignId?: string | null) =>
    getAnalyticsRepository().getDashboard({ ...context, campaignId: campaignId ?? context.campaignId, range });

  return {
    get_dashboard_snapshot: tool({
      description: "Get verified KPI totals, trend data, channel mix and current insights for the selected organization, project and campaign.",
      inputSchema: z.object({ range: rangeSchema }),
      execute: async ({ range }) => snapshot(range),
    }),
    get_campaign_performance: tool({
      description: "Compare campaigns in the selected project by spend, conversions, CPA and ROAS.",
      inputSchema: z.object({ range: rangeSchema, limit: z.number().int().min(1).max(12).default(8) }),
      execute: async ({ range, limit }) => {
        const data = await snapshot(range, null);
        return { rows: data.campaigns.slice(0, limit), updatedAt: data.updatedAt, currency: data.currency };
      },
    }),
    get_channel_mix: tool({
      description: "Compare media channels in the selected project by spend and conversions.",
      inputSchema: z.object({ range: rangeSchema }),
      execute: async ({ range }) => {
        const data = await snapshot(range);
        return { rows: data.channelMix, updatedAt: data.updatedAt, currency: data.currency };
      },
    }),
  };
}

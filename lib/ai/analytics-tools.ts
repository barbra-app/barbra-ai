import { tool } from "ai";
import { z } from "zod";
import { getAnalyticsRepository } from "@/lib/data/get-analytics-repository";
import type { ConcertSummary, DashboardSnapshot, DateRangePreset } from "@/lib/domain/analytics";

export function getAnalyticsTools(context: {
  organizationId: string;
  projectId: string;
  campaignId?: string | null;
}) {
  const rangeSchema = z.enum(["7d", "30d", "90d"]).default("30d");
  const cache = new Map<string, Promise<DashboardSnapshot>>();
  const snapshot = (range: DateRangePreset, campaignId?: string | null) => {
    const selectedCampaignId = campaignId === undefined ? context.campaignId : campaignId;
    const key = `${range}:${selectedCampaignId ?? "all"}`;
    const existing = cache.get(key);
    if (existing) return existing;
    const pending = getAnalyticsRepository().then((repository) => repository.getDashboard({
      ...context,
      campaignId: selectedCampaignId,
      range,
    }));
    cache.set(key, pending);
    return pending;
  };

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

export function getConcertAnalyticsTools(context: {
  organizationId: string;
  projectId: string;
  artistId: string;
  concertId?: string | null;
}) {
  const rangeSchema = z.enum(["7d", "30d", "90d"]).default("30d");
  const cache = new Map<string, Promise<ConcertSummary>>();
  const summary = (range: DateRangePreset) => {
    const key = range;
    const existing = cache.get(key);
    if (existing) return existing;
    const pending = getAnalyticsRepository().then((repository) => repository.getConcertSummary({
      ...context,
      range,
    }));
    cache.set(key, pending);
    return pending;
  };

  return {
    get_concert_summary: tool({
      description: "Get verified KPI totals per platform (Google Ads, Meta Ads, TikTok Ads) and combined trend for the selected artist/concert.",
      inputSchema: z.object({ range: rangeSchema }),
      execute: async ({ range }) => {
        const data = await summary(range);
        return {
          total: data.total,
          byPlatform: data.byPlatform.map(({ campaigns: _campaigns, ...platform }) => platform),
          trend: data.trend,
          updatedAt: data.updatedAt,
          currency: data.currency,
        };
      },
    }),
    get_concert_campaigns: tool({
      description: "List individual campaigns across all platforms for the selected artist/concert, with their names and metrics, so a specific campaign can be looked up by name.",
      inputSchema: z.object({ range: rangeSchema }),
      execute: async ({ range }) => {
        const data = await summary(range);
        const rows = data.byPlatform.flatMap((platform) =>
          platform.campaigns.map((campaign) => ({ source: platform.source, ...campaign })),
        );
        return { rows, updatedAt: data.updatedAt, currency: data.currency };
      },
    }),
  };
}

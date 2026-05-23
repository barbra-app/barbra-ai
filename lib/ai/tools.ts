/**
 * Tool definitions surfaced to Claude.
 *
 * These are the contract between the model and our data layer. When
 * USE_MOCK_MCP=false we'll swap the execute() bodies to forward to the
 * real Master Metrics MCP via experimental_createMCPClient, but the
 * tool *shapes* should stay the same so the model and the UI don't
 * have to change.
 *
 * Tool outputs are intentionally structured (not prose) — the chat
 * route renders them as React components (generative UI), and Claude
 * gets a short text summary alongside.
 */

import { tool } from "ai";
import { z } from "zod";
import {
  MOCK_ACCOUNTS,
  MOCK_CAMPAIGNS,
  generateMetrics,
  aggregateMetrics,
} from "@/lib/mcp/mock-data";

export const listAccountsTool = tool({
  description:
    "List every client account the user has access to in Master Metrics. Use this when the user asks 'what accounts do I have', wants an overview, or hasn't yet picked an account.",
  inputSchema: z.object({}),
  execute: async () => {
    return {
      type: "account_list" as const,
      accounts: MOCK_ACCOUNTS,
    };
  },
});

export const listCampaignsTool = tool({
  description:
    "List campaigns for a given account, optionally filtered by channel or status. Returns a table the UI will render.",
  inputSchema: z.object({
    accountId: z.string().describe("Account id from list_accounts, e.g. 'acc_live'"),
    channel: z.enum(["meta", "google", "tiktok", "linkedin"]).optional(),
    status: z.enum(["active", "paused", "ended"]).optional(),
  }),
  execute: async ({ accountId, channel, status }) => {
    const account = MOCK_ACCOUNTS.find((a) => a.id === accountId);
    const campaigns = MOCK_CAMPAIGNS.filter(
      (c) =>
        c.accountId === accountId &&
        (!channel || c.channel === channel) &&
        (!status || c.status === status)
    );
    return {
      type: "campaign_table" as const,
      accountName: account?.name ?? accountId,
      campaigns,
    };
  },
});

export const getKpiSummaryTool = tool({
  description:
    "Get headline KPIs (spend, revenue, ROAS, CPA, CTR, CVR, conversions) for one or more campaigns over a window. Use when the user asks 'how is X performing' or 'give me the numbers for Y'. Returns a row of KPI cards.",
  inputSchema: z.object({
    campaignIds: z.array(z.string()).min(1).describe("One or more campaign ids"),
    days: z.number().int().min(1).max(90).default(30),
  }),
  execute: async ({ campaignIds, days }) => {
    const allPoints = campaignIds.flatMap((id) => generateMetrics(id, days));
    const totals = aggregateMetrics(allPoints);
    const campaigns = campaignIds
      .map((id) => MOCK_CAMPAIGNS.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => c != null);
    return {
      type: "kpi_summary" as const,
      label: campaigns.map((c) => c.name).join(" + ") || "Selection",
      days,
      kpis: totals,
    };
  },
});

export const getTimeSeriesTool = tool({
  description:
    "Get a daily time series for a chosen metric across one or more campaigns. Use this when the user asks 'show me a chart of', 'plot', 'how did X trend', or wants to compare campaigns over time. Returns a line chart.",
  inputSchema: z.object({
    campaignIds: z.array(z.string()).min(1),
    metric: z.enum([
      "spend",
      "impressions",
      "clicks",
      "conversions",
      "revenue",
    ]),
    days: z.number().int().min(7).max(90).default(30),
  }),
  execute: async ({ campaignIds, metric, days }) => {
    const series = campaignIds.map((id) => {
      const campaign = MOCK_CAMPAIGNS.find((c) => c.id === id);
      const points = generateMetrics(id, days);
      return {
        campaignId: id,
        campaignName: campaign?.name ?? id,
        channel: campaign?.channel,
        points: points.map((p) => ({ date: p.date, value: p[metric] })),
      };
    });
    return {
      type: "time_series" as const,
      metric,
      days,
      series,
    };
  },
});

export const barbraTools = {
  list_accounts: listAccountsTool,
  list_campaigns: listCampaignsTool,
  get_kpi_summary: getKpiSummaryTool,
  get_time_series: getTimeSeriesTool,
};

export type BarbraToolName = keyof typeof barbraTools;

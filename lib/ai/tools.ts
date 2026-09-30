/**
 * Mock implementation of Master Metrics' MCP tool surface.
 *
 * These tools share *names and shapes* with the real MM MCP server, so:
 *   - When USE_MOCK_MCP=true (no API key set), these run locally and the
 *     UI renders results normally.
 *   - When USE_MOCK_MCP=false, getMasterMetricsTools() in lib/mcp/client.ts
 *     returns the real tools from the MCP server and these mocks aren't
 *     used. The chat panel dispatches on tool *name* so rendering works
 *     the same either way.
 *
 * Tool names match MM exactly:
 *   health_check, get_available_sources, get_accounts, get_metrics,
 *   get_dimensions, get_dates, get_data.
 */

import { tool } from "ai";
import { z } from "zod";
import {
  DIMENSIONS_BY_SOURCE,
  METRICS_BY_SOURCE,
  MOCK_ACCOUNTS,
  MOCK_SOURCES,
  simulateGetData,
  type SourceId,
} from "@/lib/mcp/mock-data";

const SourceIdSchema = z.enum(["meta", "google", "tiktok", "linkedin", "shopify"]);

const healthCheck = tool({
  description:
    "Check if the MCP server and API are operational. Returns status ok when healthy.",
  inputSchema: z.object({}),
  execute: async () => ({ status: "ok", env: "mock" }),
});

const getAvailableSources = tool({
  description:
    "Returns the list of data sources connected to the organization (e.g. meta, google, tiktok). Organization is derived from the API key — no extra arguments needed.",
  inputSchema: z.object({}),
  execute: async () => ({ sources: MOCK_SOURCES }),
});

const getAccounts = tool({
  description:
    "Returns the list of connected accounts for a given data source. Use get_available_sources first to obtain valid source names.",
  inputSchema: z.object({
    source: SourceIdSchema.describe("Data source identifier, e.g. meta, google, tiktok"),
  }),
  execute: async ({ source }) => ({
    accounts: MOCK_ACCOUNTS.filter((a) => a.source === source),
  }),
});

const getMetrics = tool({
  description: "Returns the list of available metrics for a given data source.",
  inputSchema: z.object({ source: SourceIdSchema }),
  execute: async ({ source }) => ({
    source,
    metrics: METRICS_BY_SOURCE[source] ?? [],
  }),
});

const getDimensions = tool({
  description: "Returns the list of available dimensions (breakdowns) for a given data source.",
  inputSchema: z.object({ source: SourceIdSchema }),
  execute: async ({ source }) => ({
    source,
    dimensions: DIMENSIONS_BY_SOURCE[source] ?? [],
  }),
});

const getDates = tool({
  description:
    "Returns the available date fields for sources that require a date field on get_data requests (e.g. Kommo, GoHighLevel, Close, Pipedrive, HubSpot). Use this tool to discover valid dateType values.",
  inputSchema: z.object({ source: SourceIdSchema }),
  execute: async () => ({ dates: [] }),
});

const getData = tool({
  description:
    "Execute a data search query against a source. Returns tabular data with metrics and breakdowns. Use the discovery tools first to build valid queries.",
  inputSchema: z.object({
    source: SourceIdSchema,
    accounts: z.array(z.string()).describe("Account IDs from get_accounts"),
    metrics: z.array(z.string()).describe("Array of metric names from get_metrics"),
    breakdowns: z
      .array(z.string())
      .optional()
      .describe("Dimension names from get_dimensions"),
    since: z.string().describe("Start date, ISO format: YYYY-MM-DD"),
    until: z.string().describe("End date, ISO format: YYYY-MM-DD"),
    dateType: z
      .string()
      .optional()
      .describe("Required for CRM sources (KOMMO, GOHIGHLEVEL, CLOSE, PIPEDRIVE). e.g. created_at"),
    tileData: z
      .boolean()
      .optional()
      .describe("If true, returns aggregated tile format (totals only, no row breakdown)"),
  }),
  execute: async (args) =>
    simulateGetData({
      source: args.source as SourceId,
      accounts: args.accounts,
      metrics: args.metrics,
      breakdowns: args.breakdowns,
      since: args.since,
      until: args.until,
      dateType: args.dateType,
      tileData: args.tileData ?? false,
    }),
});

export const mockMasterMetricsTools = {
  health_check: healthCheck,
  get_available_sources: getAvailableSources,
  get_accounts: getAccounts,
  get_metrics: getMetrics,
  get_dimensions: getDimensions,
  get_dates: getDates,
  get_data: getData,
};

export type MockToolName = keyof typeof mockMasterMetricsTools;

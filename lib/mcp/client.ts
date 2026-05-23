/**
 * Master Metrics MCP client + tool resolver.
 *
 * If USE_MOCK_MCP=false AND a token is set, we connect to the real MM
 * server at MASTERMETRICS_MCP_URL and return its tools. Otherwise we
 * fall back to the in-repo mock tools, which mirror MM's real names
 * and shapes (so the UI doesn't change between modes).
 *
 * Transport: Streamable HTTP per MCP spec 2025-03-26+ (`type: "http"`).
 * MM also exposes OAuth (RFC 6749 + PKCE) on the same endpoint, but we
 * use the API-key path since this is server-to-server.
 */

import { createMCPClient } from "@ai-sdk/mcp";
import { mockMasterMetricsTools } from "@/lib/ai/tools";

export const useMockMcp =
  process.env.USE_MOCK_MCP !== "false" || !process.env.MASTERMETRICS_MCP_TOKEN;

export async function getMasterMetricsTools() {
  if (useMockMcp) return mockMasterMetricsTools;

  const url = process.env.MASTERMETRICS_MCP_URL!;
  const token = process.env.MASTERMETRICS_MCP_TOKEN!;

  const client = await createMCPClient({
    name: "mastermetrics",
    transport: {
      type: "http",
      url,
      headers: { Authorization: `Bearer ${token}` },
    },
  });

  return await client.tools();
}

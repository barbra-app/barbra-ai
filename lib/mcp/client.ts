/**
 * Master Metrics MCP client.
 *
 * When USE_MOCK_MCP=false and MASTERMETRICS_MCP_URL is set, this opens
 * a connection to the real Master Metrics MCP server and returns its
 * tools so they can be merged into the chat route alongside ours.
 *
 * MM, like most SaaS MCP servers (Linear, Notion, Sentry), almost
 * certainly uses URL-embedded auth — you paste a unique URL from their
 * dashboard and that's it, no bearer token. The token branch below is
 * a fallback for the rarer "header auth" pattern.
 *
 * Transport is Streamable HTTP (MCP spec 2025-03-26+), which replaced
 * the deprecated SSE transport. If MM is still on legacy SSE, swap
 * `type: "http"` for `type: "sse"`.
 *
 * If MM uses OAuth 2.1 with dynamic client registration instead, this
 * file needs a bigger rewrite — we'd add an /api/mcp/auth route to
 * handle the OAuth callback and store per-user tokens.
 */

import { createMCPClient } from "@ai-sdk/mcp";

export const useMockMcp =
  process.env.USE_MOCK_MCP !== "false" || !process.env.MASTERMETRICS_MCP_URL;

export async function getMasterMetricsTools() {
  if (useMockMcp) return {};

  const url = process.env.MASTERMETRICS_MCP_URL!;
  const token = process.env.MASTERMETRICS_MCP_TOKEN;

  const client = await createMCPClient({
    name: "mastermetrics",
    transport: {
      type: "http",
      url,
      // Headers are only included if a token is explicitly configured.
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    },
  });

  return await client.tools();
}

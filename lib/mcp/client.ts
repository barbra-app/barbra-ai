/**
 * Master Metrics MCP client — placeholder.
 *
 * When USE_MOCK_MCP=false, this will return a real MCP client wired to
 * MASTERMETRICS_MCP_URL with the bearer token. For now it's a stub so
 * the rest of the app can be built and verified end-to-end with the
 * mock tool layer in @/lib/ai/tools.
 *
 * Swap-in plan (when real config arrives):
 *
 *   import { experimental_createMCPClient } from "ai";
 *   const client = await experimental_createMCPClient({
 *     transport: {
 *       type: "sse",
 *       url: process.env.MASTERMETRICS_MCP_URL!,
 *       headers: { Authorization: `Bearer ${process.env.MASTERMETRICS_MCP_TOKEN!}` },
 *     },
 *   });
 *   const mcpTools = await client.tools();
 *   // Then pass mcpTools into streamText({ tools: { ...barbraTools, ...mcpTools } })
 */

export const useMockMcp = process.env.USE_MOCK_MCP !== "false";

export async function getMasterMetricsTools() {
  if (useMockMcp) return {};
  // TODO: real MCP wiring lands here once we have the connection config.
  return {};
}

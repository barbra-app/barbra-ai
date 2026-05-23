/**
 * Master Metrics MCP client.
 *
 * Auth: OAuth 2.1 con PKCE — el usuario se autentica con su cuenta MM
 * desde el browser (igual que cuando conectas MM a Claude.ai). El access
 * token vive en una cookie httpOnly. Ver lib/mcp/oauth.ts + lib/mcp/session.ts.
 *
 * Si el usuario aún no se conectó (sin sesión / token expirado y refresh
 * falló), caemos a la capa de mocks para que la app siga siendo usable
 * en modo demo.
 */

import { createMCPClient } from "@ai-sdk/mcp";
import { mockMasterMetricsTools } from "@/lib/ai/tools";
import { getValidAccessToken } from "@/lib/mcp/session";

const MCP_URL =
  process.env.MASTERMETRICS_MCP_URL ?? "https://api.mastermetrics.com/api/v2/mcp";

export interface ResolvedTools {
  tools: Awaited<ReturnType<ReturnType<typeof createMCPClient> extends Promise<infer T> ? T extends { tools: () => any } ? T["tools"] : never : never>> | typeof mockMasterMetricsTools;
  isLive: boolean;
}

export async function getMasterMetricsTools(req: Request) {
  const accessToken = await getValidAccessToken(req);
  if (!accessToken) {
    return { tools: mockMasterMetricsTools, isLive: false };
  }

  const client = await createMCPClient({
    name: "mastermetrics",
    transport: {
      type: "http",
      url: MCP_URL,
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });

  return { tools: await client.tools(), isLive: true };
}

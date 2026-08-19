import { NextResponse } from "next/server";
import { z } from "zod";
import { getAnalyticsRepository } from "@/lib/data/get-analytics-repository";
import { assertProjectAccess, getRequestUser } from "@/lib/auth/server-session";
import { runtimeEnv } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  organizationId: z.string().min(1).max(120),
  projectId: z.string().min(1).max(120),
  campaignId: z.string().min(1).max(120).nullable().optional(),
  range: z.enum(["7d", "30d", "90d"]).default("30d"),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    organizationId: url.searchParams.get("organizationId"),
    projectId: url.searchParams.get("projectId"),
    campaignId: url.searchParams.get("campaignId") || null,
    range: url.searchParams.get("range") || "30d",
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid dashboard query", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const user = await getRequestUser(request);
    assertProjectAccess(user, parsed.data.organizationId, parsed.data.projectId);
    const data = await (await getAnalyticsRepository()).getDashboard(parsed.data);
    return NextResponse.json({ data, provider: (await runtimeEnv("ANALYTICS_PROVIDER")) ?? "mock", user: { uid: user.uid, name: user.name, role: user.role } });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Project access denied" }, { status: 403 });
    }
    if (error instanceof Error && error.message.startsWith("ANALYTICS_")) {
      const messages: Record<string, string> = {
        ANALYTICS_CLIENT_NOT_CONFIGURED: "La organización aún no tiene un client_id analítico configurado",
        ANALYTICS_PROJECT_NOT_CONFIGURED: "El proyecto aún no tiene campañas conectadas al modelo analítico",
        ANALYTICS_CAMPAIGN_NOT_CONFIGURED: "La campaña aún no tiene sus identificadores de canal configurados",
        ANALYTICS_NO_DATA: "No hay datos normalizados para esta selección y periodo",
        ANALYTICS_MIXED_CURRENCIES: "La selección contiene monedas distintas que todavía no han sido convertidas",
      };
      return NextResponse.json(
        {
          code: error.message,
          error: messages[error.message] ?? "La configuración analítica no es válida",
        },
        { status: 422 },
      );
    }
    console.error("[dashboard] query failed:", error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    return NextResponse.json({ error: "Unable to load dashboard data" }, { status: 500 });
  }
}

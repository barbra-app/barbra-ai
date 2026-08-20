import { NextResponse } from "next/server";
import { z } from "zod";
import { getAnalyticsRepository } from "@/lib/data/get-analytics-repository";
import { assertProjectAccess, getRequestUser, requestBearerToken } from "@/lib/auth/server-session";
import { runtimeEnv } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  organizationId: z.string().min(1).max(120),
  projectId: z.string().min(1).max(120),
  campaignId: z.string().min(1).max(120).nullable().optional(),
  range: z.enum(["7d", "30d", "90d", "all", "custom"]).default("30d"),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
}).superRefine((value, context) => {
  if (value.range !== "custom") return;
  if (!value.startDate || !value.endDate) {
    context.addIssue({ code: "custom", message: "Custom ranges require startDate and endDate" });
  } else if (value.startDate > value.endDate) {
    context.addIssue({ code: "custom", message: "startDate must be before or equal to endDate" });
  }
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    organizationId: url.searchParams.get("organizationId"),
    projectId: url.searchParams.get("projectId"),
    campaignId: url.searchParams.get("campaignId") || null,
    range: url.searchParams.get("range") || "30d",
    startDate: url.searchParams.get("startDate") || undefined,
    endDate: url.searchParams.get("endDate") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid dashboard query", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const user = await getRequestUser(request);
    assertProjectAccess(user, parsed.data.organizationId, parsed.data.projectId);
    const useServiceAccount = await runtimeEnv("FIRESTORE_USE_SERVICE_ACCOUNT") === "true";
    const data = await (await getAnalyticsRepository()).getDashboard(parsed.data, {
      firestoreToken: useServiceAccount ? undefined : requestBearerToken(request) ?? undefined,
    });
    return NextResponse.json({ data, provider: "bigquery", user: { uid: user.uid, name: user.name, role: user.role } });
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
        ANALYTICS_DATE_RANGE_INVALID: "Selecciona un rango de fechas válido",
        ANALYTICS_NO_DATA: "No hay datos normalizados para esta selección y periodo",
        ANALYTICS_MIXED_CURRENCIES: "La selección contiene monedas distintas que todavía no han sido convertidas",
        ANALYTICS_PROVIDER_NOT_CONFIGURED: "La conexión analítica aún no está configurada",
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

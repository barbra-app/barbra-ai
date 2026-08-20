import { createAnthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { z } from "zod";
import { getAnalyticsTools } from "@/lib/ai/analytics-tools";
import { assertProjectAccess, getRequestUser, requestBearerToken } from "@/lib/auth/server-session";
import { runtimeEnv } from "@/lib/runtime-env";

export const maxDuration = 60;

const RequestSchema = z.object({
  messages: z.array(z.custom<UIMessage>()),
  organizationId: z.string().min(1).max(120),
  projectId: z.string().min(1).max(120),
  campaignId: z.string().min(1).max(120).nullable().optional(),
  range: z.enum(["7d", "30d", "90d", "all", "custom"]).default("30d"),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
});

function buildSystemPrompt(context: { organizationId: string; projectId: string; campaignId?: string | null; range: "7d" | "30d" | "90d" | "all" | "custom"; startDate?: string; endDate?: string }) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return `Eres Barbra Intelligence, un advisor de rendimiento de medios para equipos de marketing.

Idioma: responde siempre en español.
Fecha actual: ${today}.

El usuario ya seleccionó este contexto autorizado en la interfaz:
- organización: ${context.organizationId}
- proyecto: ${context.projectId}
- campaña: ${context.campaignId ?? "todas las campañas del proyecto"}
- periodo: ${context.range === "custom" ? `${context.startDate} a ${context.endDate}` : context.range}

Tus únicas fuentes de verdad son las herramientas analíticas conectadas al mart canónico de BigQuery:
- get_dashboard_snapshot: KPIs y tendencia del periodo.
- get_campaign_performance: comparación de campañas, sin importar su canal.
- get_channel_mix: inversión y conversiones desglosadas por Google Ads, Meta Ads, TikTok Ads u otros canales presentes.

Las herramientas pueden consultar 7, 30 o 90 días, todo el historial disponible, o cualquier rango de fechas explícito. El periodo visible en la interfaz es el contexto inicial, no una limitación. Interpreta expresiones como "todos los tiempos", "histórico", años, meses y rangos de fechas y envía el periodo correspondiente a la herramienta.

Reglas:
1. Usa una herramienta antes de afirmar cualquier cifra. Nunca inventes datos ni generes SQL.
2. Respeta siempre la organización, proyecto y campaña seleccionados; puedes ampliar o cambiar el periodo únicamente cuando la pregunta lo solicite.
3. Llama exactamente UNA herramienta por respuesta: channel_mix para preguntas por canal, campaign_performance para preguntas por campaña y dashboard_snapshot para KPIs, comparación contra el periodo anterior o tendencia general.
4. En campaign_performance elige sortBy según la intención: roas para retorno o posible escala, cpa para costo, conversions para volumen y spend para concentración de inversión.
5. No escribas texto, introducciones ni explicaciones antes o después de la herramienta. La interfaz convierte el resultado verificado en la respuesta visual y narrativa.

Estilo: preciso, directo y sin relleno.`;
}

export async function POST(request: Request) {
  const parsed = RequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Selecciona una organización y un proyecto válidos" }, { status: 400 });
  }

  const { messages, organizationId, projectId, campaignId, range, startDate, endDate } = parsed.data;
  if (range === "custom" && (!startDate || !endDate || startDate > endDate)) {
    return Response.json({ error: "Selecciona un rango de fechas válido" }, { status: 400 });
  }
  try {
    const user = await getRequestUser(request);
    assertProjectAccess(user, organizationId, projectId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNAUTHENTICATED";
    return Response.json(
      { error: message === "FORBIDDEN" ? "Project access denied" : "Authentication required" },
      { status: message === "FORBIDDEN" ? 403 : 401 },
    );
  }

  const useServiceAccount = await runtimeEnv("FIRESTORE_USE_SERVICE_ACCOUNT") === "true";
  const tools = getAnalyticsTools(
    { organizationId, projectId, campaignId, range, startDate, endDate },
    { firestoreToken: useServiceAccount ? undefined : requestBearerToken(request) ?? undefined },
  );
  const anthropicApiKey = await runtimeEnv("ANTHROPIC_API_KEY");
  if (!anthropicApiKey) {
    return Response.json({ error: "Barbra Intelligence is not configured" }, { status: 503 });
  }
  const anthropic = createAnthropic({ apiKey: anthropicApiKey });
  const result = streamText({
    model: anthropic((await runtimeEnv("BARBRA_MODEL")) || "claude-sonnet-4-6"),
    system: buildSystemPrompt({ organizationId, projectId, campaignId, range, startDate, endDate }),
    messages: await convertToModelMessages(messages),
    tools,
    maxOutputTokens: 180,
    stopWhen: ({ steps }) => steps.length >= 1,
  });

  return result.toUIMessageStreamResponse();
}

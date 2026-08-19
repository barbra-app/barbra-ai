import { createAnthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { z } from "zod";
import { getAnalyticsTools } from "@/lib/ai/analytics-tools";
import { assertProjectAccess, getRequestUser } from "@/lib/auth/server-session";
import { runtimeEnv } from "@/lib/runtime-env";

export const maxDuration = 60;

const RequestSchema = z.object({
  messages: z.array(z.custom<UIMessage>()),
  organizationId: z.string().min(1).max(120),
  projectId: z.string().min(1).max(120),
  campaignId: z.string().min(1).max(120).nullable().optional(),
});

function buildSystemPrompt(context: { organizationId: string; projectId: string; campaignId?: string | null }) {
  const today = new Date().toISOString().slice(0, 10);
  return `Eres Barbra Intelligence, un advisor de rendimiento de medios para equipos de marketing.

Idioma: responde siempre en español.
Fecha actual: ${today}.

El usuario ya seleccionó este contexto autorizado en la interfaz:
- organización: ${context.organizationId}
- proyecto: ${context.projectId}
- campaña: ${context.campaignId ?? "todas las campañas del proyecto"}

Tus únicas fuentes de verdad son las herramientas analíticas conectadas al mart canónico de BigQuery:
- get_dashboard_snapshot: KPIs y tendencia del periodo.
- get_campaign_performance: comparación de campañas, sin importar su canal.
- get_channel_mix: inversión y conversiones desglosadas por Google Ads, Meta Ads, TikTok Ads u otros canales presentes.

Reglas:
1. Usa una herramienta antes de afirmar cualquier cifra. Nunca inventes datos ni generes SQL.
2. Respeta siempre el contexto seleccionado; no solicites cuentas publicitarias ni credenciales de plataformas.
3. Llama exactamente UNA herramienta por respuesta: channel_mix para preguntas por canal, campaign_performance para preguntas por campaña y dashboard_snapshot para KPIs o tendencia general.
4. La interfaz renderiza el resultado como componente visual. Después de la herramienta escribe máximo DOS frases cortas: una observación accionable y, opcionalmente, una pregunta útil.
5. No uses Markdown, títulos, listas, tablas, separadores ni bloques de cita. No vuelvas a enumerar las cifras o filas del componente.
6. Si un canal no aparece en el resultado, explica brevemente que aún no hay datos normalizados para ese canal en el periodo; no intentes consultar su API.
7. Distingue correlación de causalidad y señala cuando los datos no alcanzan para concluir.

Estilo: preciso, directo y sin relleno.`;
}

export async function POST(request: Request) {
  const parsed = RequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Selecciona una organización y un proyecto válidos" }, { status: 400 });
  }

  const { messages, organizationId, projectId, campaignId } = parsed.data;
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

  const tools = getAnalyticsTools({ organizationId, projectId, campaignId });
  const anthropicApiKey = runtimeEnv("ANTHROPIC_API_KEY");
  if (!anthropicApiKey) {
    return Response.json({ error: "Barbra Intelligence is not configured" }, { status: 503 });
  }
  const anthropic = createAnthropic({ apiKey: anthropicApiKey });
  const result = streamText({
    model: anthropic(runtimeEnv("BARBRA_MODEL") || "claude-sonnet-4-6"),
    system: buildSystemPrompt({ organizationId, projectId, campaignId }),
    messages: await convertToModelMessages(messages),
    tools,
    maxOutputTokens: 500,
    stopWhen: ({ steps }) => steps.length >= 3,
  });

  return result.toUIMessageStreamResponse();
}

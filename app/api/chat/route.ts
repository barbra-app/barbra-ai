import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { z } from "zod";
import { getAnalyticsTools, getConcertAnalyticsTools } from "@/lib/ai/analytics-tools";
import { assertProjectAccess, getRequestUser } from "@/lib/auth/server-session";

export const maxDuration = 60;

const MODEL_ID = process.env.BARBRA_MODEL || "claude-sonnet-4-6";
const RequestSchema = z.object({
  messages: z.array(z.custom<UIMessage>()),
  organizationId: z.string().min(1).max(120),
  projectId: z.string().min(1).max(120),
  campaignId: z.string().min(1).max(120).nullable().optional(),
  artistId: z.string().min(1).max(120).optional(),
  concertId: z.string().min(1).max(120).nullable().optional(),
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
3. La interfaz renderiza los resultados como componentes visuales. Después de la herramienta escribe máximo 1–2 observaciones accionables y una pregunta útil.
4. No repitas en listas o tablas las cifras que ya muestra el componente.
5. Si un canal no aparece en el resultado, explica que aún no hay datos normalizados para ese canal en el periodo; no intentes consultar su API.
6. Distingue correlación de causalidad y señala cuando los datos no alcanzan para concluir.

Estilo: preciso, directo y sin relleno.`;
}

function buildConcertSystemPrompt(context: { organizationId: string; projectId: string; artistId: string; concertId?: string | null }) {
  const today = new Date().toISOString().slice(0, 10);
  return `Eres Barbra Intelligence, un advisor de rendimiento de medios para equipos de marketing.

Idioma: responde siempre en español.
Fecha actual: ${today}.

El usuario ya seleccionó este contexto autorizado en la interfaz, dentro de la pestaña "Campañas":
- organización: ${context.organizationId}
- proyecto: ${context.projectId}
- artista: ${context.artistId}
- concierto/fecha: ${context.concertId ?? "resumen combinado de todas las fechas del artista"}

Este contexto agrupa campañas del mismo concierto entre Google Ads, Meta Ads y TikTok Ads (por coincidencia de nombre de campaña), no una sola plataforma.

Tus únicas fuentes de verdad son las herramientas analíticas conectadas al mart canónico de BigQuery:
- get_concert_summary: KPIs totales y por plataforma, más tendencia combinada del periodo.
- get_concert_campaigns: lista de campañas individuales de todas las plataformas, con su nombre y métricas — úsala cuando el usuario pregunte por una campaña específica por nombre.

Reglas:
1. Usa una herramienta antes de afirmar cualquier cifra. Nunca inventes datos ni generes SQL.
2. Si el usuario pregunta por una campaña específica, busca su nombre dentro de los resultados de get_concert_campaigns; si no aparece, dilo explícitamente en vez de inventar.
3. Respeta siempre el contexto seleccionado; no solicites cuentas publicitarias ni credenciales de plataformas.
4. La interfaz renderiza algunos resultados como componentes visuales. Después de la herramienta escribe máximo 1–2 observaciones accionables y una pregunta útil.
5. Si una plataforma no aparece en el resultado, explica que aún no hay datos normalizados para esa plataforma en el periodo; no intentes consultar su API.
6. Distingue correlación de causalidad y señala cuando los datos no alcanzan para concluir.

Estilo: preciso, directo y sin relleno.`;
}

export async function POST(request: Request) {
  const parsed = RequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Selecciona una organización y un proyecto válidos" }, { status: 400 });
  }

  const { messages, organizationId, projectId, campaignId, artistId, concertId } = parsed.data;
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

  const isConcertScope = Boolean(artistId);
  const tools = isConcertScope
    ? getConcertAnalyticsTools({ organizationId, projectId, artistId: artistId!, concertId })
    : getAnalyticsTools({ organizationId, projectId, campaignId });
  const system = isConcertScope
    ? buildConcertSystemPrompt({ organizationId, projectId, artistId: artistId!, concertId })
    : buildSystemPrompt({ organizationId, projectId, campaignId });

  const result = streamText({
    model: anthropic(MODEL_ID),
    system,
    messages: await convertToModelMessages(messages),
    tools,
    maxOutputTokens: 2048,
    stopWhen: ({ steps }) => steps.length >= 4,
  });

  return result.toUIMessageStreamResponse();
}

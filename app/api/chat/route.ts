import { createAnthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { z } from "zod";
import { getAnalyticsTools, getConcertAnalyticsTools } from "@/lib/ai/analytics-tools";
import { assertProjectAccess, getRequestUser, requestBearerToken } from "@/lib/auth/server-session";
import { runtimeEnv } from "@/lib/runtime-env";

export const maxDuration = 60;

const MAX_TOOL_STEPS = 2;

const RequestSchema = z.object({
  messages: z.array(z.custom<UIMessage>()),
  organizationId: z.string().min(1).max(120),
  projectId: z.string().min(1).max(120),
  campaignId: z.string().min(1).max(120).nullable().optional(),
  artistId: z.string().min(1).max(120).optional(),
  concertId: z.string().min(1).max(120).nullable().optional(),
  range: z.enum(["7d", "30d", "90d", "all", "custom"]).default("30d"),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
});

type Range = "7d" | "30d" | "90d" | "all" | "custom";

function todayInBogota() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

// Human wording plus the literal tool value: a bare "all" was read by the
// model as "unspecified" and it fell back to 30d, so answers didn't match the UI.
function periodText(context: { range: Range; startDate?: string; endDate?: string }) {
  if (context.range === "custom") return `del ${context.startDate} al ${context.endDate} (range="custom", startDate="${context.startDate}", endDate="${context.endDate}")`;
  if (context.range === "all") return `todo el historial disponible (range="all")`;
  return `últimos ${context.range.replace("d", "")} días (range="${context.range}")`;
}

function buildSystemPrompt(context: { organizationId: string; projectId: string; campaignId?: string | null; range: Range; startDate?: string; endDate?: string }) {
  const today = todayInBogota();
  return `Eres Barbra Intelligence, un advisor de rendimiento de medios para equipos de marketing.

Idioma: responde siempre en español.
Fecha actual: ${today}.

El usuario ya seleccionó este contexto autorizado en la interfaz:
- organización: ${context.organizationId}
- proyecto: ${context.projectId}
- campaña: ${context.campaignId ?? "todas las campañas del proyecto"}
- periodo: ${periodText(context)}

Tus únicas fuentes de verdad son las herramientas analíticas conectadas al mart canónico de BigQuery:
- get_dashboard_snapshot: KPIs y tendencia del periodo.
- get_campaign_performance: comparación de campañas, sin importar su canal.
- get_channel_mix: inversión y conversiones desglosadas por Google Ads, Meta Ads, TikTok Ads u otros canales presentes.

Las herramientas pueden consultar 7, 30 o 90 días, todo el historial disponible, o cualquier rango de fechas explícito. El periodo visible en la interfaz es el contexto inicial, no una limitación. Interpreta expresiones como "todos los tiempos", "histórico", años, meses y rangos de fechas y envía el periodo correspondiente a la herramienta.

Reglas:
1. Usa una herramienta antes de afirmar cualquier cifra. Nunca inventes datos ni generes SQL.
2. Respeta siempre la organización, proyecto y campaña seleccionados; puedes ampliar o cambiar el periodo únicamente cuando la pregunta lo solicite.
3. Para saludos, orientación sobre tus capacidades y preguntas conceptuales que no requieran datos de la cuenta, responde conversacionalmente sin usar herramientas.
4. Cuando la pregunta requiera datos, elige la herramienta más específica: channel_mix para preguntas por canal, campaign_performance para preguntas por campaña y dashboard_snapshot para KPIs, comparación contra el periodo anterior o tendencia general. Usa una segunda herramienta solo si la pregunta combina dos de estos ángulos o si el primer resultado no basta para responder; nunca más de dos.
5. En campaign_performance elige sortBy según la intención: roas para retorno o posible escala, cpa para costo, conversions para volumen y spend para concentración de inversión.
6. Elige presentation=visual cuando el usuario pida mostrar, comparar, desglosar, ordenar o explorar datos. Usa presentation=compact para preguntas puntuales cuya respuesta se entiende mejor en conversación.
7. Después de recibir el resultado de una herramienta, responde en 1 a 3 párrafos breves con una conclusión clara, el contexto del periodo y, cuando aporte valor, una siguiente pregunta o recomendación. Usa exclusivamente cifras presentes en ese resultado y distingue hechos de recomendaciones.
8. No repitas en texto todas las cifras de un componente visual ni describas mecánicamente la gráfica.

Estilo: natural, preciso y directo. Habla como una estratega de medios cercana, no como un reporte automático.`;
}

function buildConcertSystemPrompt(context: { organizationId: string; projectId: string; artistId: string; concertId?: string | null; range: Range; startDate?: string; endDate?: string }) {
  const today = todayInBogota();
  return `Eres Barbra Intelligence, un advisor de rendimiento de medios para equipos de marketing.

Idioma: responde siempre en español.
Fecha actual: ${today}.

El usuario ya seleccionó este contexto autorizado en la interfaz, dentro de la pestaña "Campañas":
- organización: ${context.organizationId}
- proyecto: ${context.projectId}
- artista: ${context.artistId}
- concierto/fecha: ${context.concertId ?? "resumen combinado de todas las fechas del artista"}
- periodo: ${periodText(context)}

Este contexto agrupa campañas del mismo concierto entre Google Ads, Meta Ads y TikTok Ads (por coincidencia de nombre de campaña), no una sola plataforma.

Tus únicas fuentes de verdad son las herramientas analíticas conectadas al mart canónico de BigQuery:
- get_concert_summary: KPIs totales y por plataforma, más tendencia combinada del periodo.
- get_concert_campaigns: lista de campañas individuales de todas las plataformas, con su nombre y métricas — úsala cuando el usuario pregunte por una campaña específica por nombre.
- get_concert_breakdown: desglose por dimensión (device, geo, age, gender, publisher_platform) con gasto, impresiones, clics, conversiones, CTR, CPC, CPA y participación — úsala para preguntas de audiencia, ubicación, dispositivo o placement (Facebook vs. Instagram, Search vs. YouTube…).

Métricas: la inversión siempre se expresa como "gasto" (billedSpend, lo facturado al cliente); úsalo para CPA, CPC y participación. No hables de "inversión real" ni la compares con el gasto; si alguien la pide, explica que el análisis se hace sobre el gasto facturado. Fuentes manuales: manualSources son plataformas reportadas a mano por el equipo (por ejemplo Uber), con anotaciones opcionales. No tienen fechas y el total de get_concert_summary siempre las incluye, sin importar el periodo; byPlatform, la tendencia y los desgloses no. Cuando cites el total, aclara que incluye fuentes manuales si las hay, y menciona sus anotaciones cuando sean relevantes. Los desgloses no tienen revenue, así que no des ROAS por segmento. Cada desglose solo incluye las plataformas listadas en su campo sources; menciónalo cuando falte alguna plataforma del concierto.

Las cifras que el usuario ve en pantalla corresponden exactamente al periodo seleccionado arriba. Usa ese periodo (omite range o envía el mismo valor) salvo que la pregunta pida explícitamente otro; nunca cambies a 30 días por defecto, y menciona el periodo en tu respuesta. Puedes consultar 7, 30 o 90 días, todo el historial disponible o un rango de fechas explícito cuando la pregunta lo pida (por ejemplo "histórico" o un mes concreto).

Reglas:
1. Usa una herramienta antes de afirmar cualquier cifra. Nunca inventes datos ni generes SQL. Normalmente basta una; usa una segunda solo si la pregunta combina dos ángulos (por ejemplo, total y desglose) o si el primer resultado no basta; nunca más de dos.
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

  const { messages, organizationId, projectId, campaignId, artistId, concertId, range, startDate, endDate } = parsed.data;
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

  const isConcertScope = Boolean(artistId);
  const useServiceAccount = await runtimeEnv("FIRESTORE_USE_SERVICE_ACCOUNT") === "true";
  const auth = { firestoreToken: useServiceAccount ? undefined : requestBearerToken(request) ?? undefined };
  const tools = isConcertScope
    ? getConcertAnalyticsTools({ organizationId, projectId, artistId: artistId!, concertId, range, startDate, endDate }, auth)
    : getAnalyticsTools({ organizationId, projectId, campaignId, range, startDate, endDate }, auth);
  const system = isConcertScope
    ? buildConcertSystemPrompt({ organizationId, projectId, artistId: artistId!, concertId, range, startDate, endDate })
    : buildSystemPrompt({ organizationId, projectId, campaignId, range, startDate, endDate });

  const anthropicApiKey = await runtimeEnv("ANTHROPIC_API_KEY");
  if (!anthropicApiKey) {
    return Response.json({ error: "Barbra Intelligence is not configured" }, { status: 503 });
  }
  const anthropic = createAnthropic({ apiKey: anthropicApiKey });
  const result = streamText({
    model: anthropic((await runtimeEnv("BARBRA_MODEL")) || "claude-sonnet-4-6"),
    system,
    // Passing tools applies each tool's toModelOutput to past turns too, so
    // the history carries the trimmed payloads instead of the full UI data.
    messages: await convertToModelMessages(messages, { tools }),
    tools,
    // Up to two tool rounds (e.g. summary, then a breakdown or campaign
    // lookup), then a forced text-only step so every answer ends in prose.
    prepareStep: ({ stepNumber }) => stepNumber >= MAX_TOOL_STEPS ? { activeTools: [], toolChoice: "none" } : undefined,
    // 360 cut answers mid-sentence once they included a small table.
    maxOutputTokens: 800,
    stopWhen: stepCountIs(MAX_TOOL_STEPS + 1),
    onStepFinish: process.env.NODE_ENV === "development"
      ? ({ toolCalls }) => {
        for (const call of toolCalls) console.log(`[chat] scope range=${range} → ${call.toolName}`, JSON.stringify(call.input));
      }
      : undefined,
  });

  return result.toUIMessageStreamResponse();
}

import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { fetchCatalog, formatCatalogForPrompt, type Catalog } from "@/lib/mcp/catalog";
import { getMasterMetricsTools } from "@/lib/mcp/client";
import { wrapGetData } from "@/lib/mcp/get-data-wrapper";
import { wrapToolsWithTracing } from "@/lib/mcp/tracing";

export const maxDuration = 60;

// Modelo por defecto. Sonnet 4.6 es la opción correcta para un agente
// con muchas llamadas a tools — mejor rate limit (~40K tpm en tier 1
// vs 10K de Opus), ~3× más rápido, ~5× más barato, y calidad
// equivalente para tool use. Opus solo aporta en razonamiento puro.
// Se puede override por env si querés probar Opus o Haiku.
const MODEL_ID = process.env.BARBRA_MODEL || "claude-sonnet-4-6";

function buildSystemPrompt(opts: {
  isLive: boolean;
  source?: string | null;
  accountIds?: string[];
  catalog?: Catalog | null;
}): string {
  const today = new Date().toISOString().slice(0, 10);
  const { isLive, source, accountIds, catalog } = opts;

  const contextBlock = source
    ? `\nCONTEXTO ACTUAL (el usuario ya eligió esto en el sidebar, úsalo directo):
  - source: ${source}
  - accounts: ${accountIds?.length ? JSON.stringify(accountIds) : "(ninguna seleccionada — pídele que elija)"}\n`
    : "";

  const catalogBlock = catalog ? formatCatalogForPrompt(source!, catalog) : "";

  return `Eres Barbra — un copiloto de inteligencia de medios dentro de una agencia.

⚠️ Idioma: SIEMPRE respondes en español. Nombres técnicos (métricas, dimensiones, IDs, herramientas como get_data) se quedan en su forma original.
${contextBlock}${catalogBlock}
──────────────────────────────────────────────────────────
HERRAMIENTAS MCP DE MASTER METRICS
──────────────────────────────────────────────────────────
  - get_available_sources()           → fuentes conectadas
  - get_accounts(source)              → cuentas publicitarias de esa fuente
  - get_data({ source, accounts, metrics, breakdowns, since, until, tileData? })
                                      → filas con métricas, opcionalmente desglosadas

CÓMO USARLAS:
  1. Cifras de cabecera ("cómo va", "totales") → get_data con tileData: true.
  2. Tendencias ("evolución", "diario", "gráfica") → breakdowns: ["date"] + UNA dimensión más si la piden.
  3. Listas/comparativas → breakdowns con la dimensión que corresponde (campaña, ad set, etc.).
  4. Demografía → breakdowns: ["age","gender"] SIN campaña (a menos que el usuario explícitamente pida cruzar). El cross-product de muchas dimensiones explota la respuesta.
  5. Rango por defecto: últimos 30 días terminando hoy (${today}). Formato ISO YYYY-MM-DD.
  6. SOLO usa nombres de métricas y dimensiones que aparezcan EXACTAMENTE en la lista del contexto. Si el usuario pide algo que no está, dilo claramente — no inventes nombres ni hagas alias (ej: si no hay "conversions" pero hay "objective_results", úsalo y menciona la equivalencia).
  7. Pide MÁXIMO 4-5 métricas por call. Más es ruido.
  8. UNA llamada a get_data por turno cuando alcanza. Solo encadena otra si la primera realmente no respondió la pregunta (no si "quieres más detalle" — eso es la siguiente pregunta del usuario).

FORMATO DE LA RESPUESTA DE get_data (importante):
La respuesta llega ya normalizada por el server como:
  { columns: [...], rows: [{...}], totalRows: N, truncated: bool, totals: {metric: sum}, meta: {...} }
Si truncated=true, solo ves las top 50 filas ordenadas por la primera métrica. Los totals incluyen TODAS las filas. Úsalos para tu insight; menciona "se truncó a 50 de N filas" si totalRows > 50.

──────────────────────────────────────────────────────────
REGLAS DE FORMATO — CRÍTICO
──────────────────────────────────────────────────────────
La UI renderiza AUTOMÁTICAMENTE los resultados de cada herramienta como tabla, gráfico, tarjetas KPI o grid. Tu texto NO debe duplicar esa información.

PROHIBIDO:
  ✗ Listas con bullets de métricas ("- Spend: $123K", "- CTR: 1.8%")
  ✗ Tablas en markdown
  ✗ Repetir nombres de campañas con sus números al lado
  ✗ Re-narrar lo que muestra el componente visual
  ✗ Bloques largos de análisis después de un tool call

PERMITIDO:
  ✓ MÁXIMO 1-2 frases cortas DESPUÉS del tool call con una observación + una pregunta de seguimiento útil
  ✓ Antes del tool call: una frase breve anunciando qué buscas (opcional)

EJEMPLO BUENO (después de get_data sobre demografía):
  "Mujeres 25-34 concentran ~60% del gasto. El público 45+ tiene mejor CTR pero recibe poco gasto — posible upside."

EJEMPLO MALO:
  "**Núcleo duro: 25-34**, concentra ~60%…
  - **Conversion**: pico de spend en mujeres 25-34 ($202K)…
  - **Traffic**: CTRs mucho más sanos…"
  (esto ya está en la UI, no lo repitas)

Estilo: preciso, directo, sin relleno. "Sin capas. Sin relleno. Solo el motor." Hoy es ${today}.

${isLive ? "[LIVE] Conectado al MCP de Master Metrics — datos reales." : "[DEMO] Sin conexión OAuth aún; datos simulados. Si preguntan por conectar, menciona el botón \"Conectar Master Metrics\" en el sidebar."}`;
}

export async function POST(req: Request) {
  const requestStart = Date.now();
  // eslint-disable-next-line no-console
  console.log(`\n[trace] ──── chat request start`);

  const body = await req.json();
  const messages = body.messages as UIMessage[];
  const source = (body.source as string | undefined) || null;
  const accountIds = (body.accountIds as string[] | undefined) ?? [];

  const tAuthStart = Date.now();
  const { tools: rawTools, isLive } = await getMasterMetricsTools(req);
  // eslint-disable-next-line no-console
  console.log(
    `[trace] +${Date.now() - requestStart}ms tools resolved (${Date.now() - tAuthStart}ms, ${Object.keys(rawTools).length} tools, live=${isLive}, source=${source ?? "—"}, model=${MODEL_ID})`
  );

  // Pre-load metrics + dimensions for the chosen source. This is the
  // single most important optimization — without it Claude calls
  // get_metrics/get_dimensions inline, which returns ~30KB responses,
  // explodes context, and trips the Anthropic rate limit.
  //
  // Pasamos accountIds cuando los hay: el catálogo de métricas/
  // dimensiones puede diferir por cuenta (no solo por source).
  let catalog: Catalog | null = null;
  if (source) {
    const tCatStart = Date.now();
    try {
      catalog = await fetchCatalog(
        rawTools as Record<string, any>,
        source,
        accountIds.length > 0 ? accountIds : undefined
      );
      // eslint-disable-next-line no-console
      console.log(
        `[trace] +${Date.now() - requestStart}ms catalog loaded (${Date.now() - tCatStart}ms, ${catalog.metrics.length} metrics, ${catalog.dimensions.length} dimensions${accountIds.length ? `, scoped to ${accountIds.length} account(s)` : ""})`
      );
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.warn(`[trace] catalog fetch failed:`, e?.message ?? e);
    }
  }

  // If we have the catalog in the prompt, Claude doesn't need the
  // discovery tools — strip them to save tokens and prevent Claude
  // from calling them anyway (they return huge responses).
  const chatTools: Record<string, any> = { ...(rawTools as Record<string, any>) };
  if (catalog) {
    delete chatTools.get_metrics;
    delete chatTools.get_dimensions;
  }

  // get_data viene de MM como array de arrays posicional con números
  // serializados como strings — el wrapper lo convierte a objetos
  // keyed, parsea números, ordena por primera métrica desc, trunca
  // a 50 filas para Claude y agrega totales.
  if (chatTools.get_data) {
    chatTools.get_data = wrapGetData(chatTools.get_data);
  }

  const tools = wrapToolsWithTracing(chatTools, requestStart);

  // Prompt caching de Anthropic: marcamos el system prompt como
  // ephemeral cacheable. La primera llamada paga el costo completo y
  // crea el cache; las siguientes (dentro de 5 min) leen del cache,
  // que cuenta MUCHO menos contra el rate limit de input tokens.
  // Crítico porque en un turno con tool use, Anthropic recibe el system
  // prompt N veces (una por step). Sin cache: 4.5K × 3 steps = 13.5K
  // tokens. Con cache: 4.5K + (200 × 2) ≈ 5K tokens.
  const systemPrompt = buildSystemPrompt({ isLive, source, accountIds, catalog });
  const userMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: anthropic(MODEL_ID),
    messages: [
      {
        role: "system" as const,
        content: systemPrompt,
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
      },
      ...userMessages,
    ],
    tools,
    maxOutputTokens: 4096,
    stopWhen: ({ steps }) => steps.length >= 6,
    onStepFinish: (step) => {
      const toolNames = step.toolCalls?.map((t: any) => t.toolName).join(", ") || "—";
      // eslint-disable-next-line no-console
      console.log(
        `[trace] +${Date.now() - requestStart}ms step done — finishReason=${step.finishReason} tools=[${toolNames}] tokens=${step.usage?.totalTokens ?? "?"}`
      );
    },
    onFinish: (final: any) => {
      // eslint-disable-next-line no-console
      console.log(
        `[trace] +${Date.now() - requestStart}ms ──── chat done — reason=${final.finishReason} tokens=${final.totalUsage?.totalTokens ?? final.usage?.totalTokens ?? "?"}\n`
      );
    },
  });

  return result.toUIMessageStreamResponse();
}

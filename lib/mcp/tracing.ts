/**
 * Wrapper para instrumentar las tools del MCP con logs de duración +
 * input/output. Útil para ver qué llamada está tomando tiempo y qué
 * shape devuelve realmente cada herramienta.
 *
 * Los logs aparecen en el terminal de pnpm dev (o en los logs de Vercel
 * en prod). Prefijo `[trace]` para filtrar fácil.
 */

export function wrapToolsWithTracing<T extends Record<string, any>>(
  tools: T,
  requestStartMs: number
): T {
  const wrapped: Record<string, any> = {};
  for (const [name, tool] of Object.entries(tools)) {
    if (!tool || typeof tool.execute !== "function") {
      wrapped[name] = tool;
      continue;
    }
    const original = tool.execute.bind(tool);
    wrapped[name] = {
      ...tool,
      execute: async (input: unknown, ctx: unknown) => {
        const t0 = Date.now();
        const elapsedFromStart = t0 - requestStartMs;
        // eslint-disable-next-line no-console
        console.log(
          `[trace] +${elapsedFromStart}ms → ${name}`,
          summarize(input, 200)
        );
        try {
          const result = await original(input, ctx);
          const dt = Date.now() - t0;
          // eslint-disable-next-line no-console
          console.log(
            `[trace] +${Date.now() - requestStartMs}ms ← ${name} (${dt}ms)`,
            summarize(result, 400)
          );
          return result;
        } catch (e: any) {
          // eslint-disable-next-line no-console
          console.error(
            `[trace] +${Date.now() - requestStartMs}ms ✕ ${name} (${Date.now() - t0}ms)`,
            e?.message ?? e
          );
          throw e;
        }
      },
    };
  }
  return wrapped as T;
}

function summarize(v: unknown, max: number): string {
  try {
    const s = JSON.stringify(v);
    if (s == null) return "undefined";
    return s.length > max ? `${s.slice(0, max)}…(+${s.length - max}c)` : s;
  } catch {
    return String(v);
  }
}

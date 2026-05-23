/**
 * Normalize MCP tool outputs.
 *
 * The MCP wire format is `{ content: [{ type: "text", text: "..." }, ...] }`.
 * AI SDK v6's MCP client usually parses that for us into a plain object, but
 * different servers (and different SDK versions) wrap things slightly
 * differently. This helper accepts whatever shape comes back and returns
 * the JSON payload underneath, so generative components can stay simple.
 */

export function normalizeOutput(raw: unknown): unknown {
  if (raw == null) return raw;

  // Already a plain object/array → use as-is.
  if (typeof raw === "object" && !Array.isArray(raw) && !("content" in (raw as object))) {
    return raw;
  }

  // MCP content blocks → grab the first text block and try to parse it as JSON.
  if (typeof raw === "object" && raw !== null && "content" in raw) {
    const content = (raw as { content?: Array<{ type?: string; text?: string }> }).content;
    if (Array.isArray(content)) {
      const text = content.find((c) => c?.type === "text")?.text;
      if (typeof text === "string") {
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      }
    }
  }

  // String → try JSON, fall back to the string.
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  return raw;
}

/**
 * Extract a row array from a normalized output. MM's get_data returns
 * `{ rows: [...] }` per our reading, but defensive fallbacks cover
 * `{ data: [...] }`, `{ items: [...] }`, or a bare array.
 */
export function extractRows(output: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(output)) return output as Record<string, unknown>[];
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    for (const key of ["rows", "data", "items", "results"]) {
      if (Array.isArray(o[key])) return o[key] as Record<string, unknown>[];
    }
  }
  return null;
}

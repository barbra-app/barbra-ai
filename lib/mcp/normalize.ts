/**
 * Normalize MCP tool outputs.
 *
 * Distintas implementaciones (y distintas versiones del AI SDK) envuelven
 * la respuesta del MCP de formas levemente diferentes. Esta función intenta
 * desenvolver lo que venga y devolver el JSON útil debajo.
 *
 * Shapes que manejamos:
 *   - { content: [{ type: "text", text: "{...json}" }] }     (formato MCP wire)
 *   - [{ type: "text", text: "..." }]                          (bare content array)
 *   - { structuredContent: {...} }                             (MCP spec moderno)
 *   - "{\"foo\": ...}"                                         (string JSON)
 *   - { foo: ... }                                             (objeto plano)
 *   - [{...}, {...}]                                           (array crudo)
 */

export function normalizeOutput(raw: unknown): unknown {
  if (raw == null) return raw;

  // Caso: { structuredContent: {...} } — formato MCP spec moderno
  if (typeof raw === "object" && raw !== null && "structuredContent" in raw) {
    const sc = (raw as { structuredContent?: unknown }).structuredContent;
    if (sc != null) return normalizeOutput(sc);
  }

  // Caso: { content: [{ type: "text", text: "..." }] } — MCP wire format
  if (typeof raw === "object" && raw !== null && "content" in raw) {
    const content = (raw as { content?: unknown }).content;
    if (Array.isArray(content)) {
      const text = content.find(
        (c: any) => c?.type === "text" && typeof c?.text === "string"
      )?.text as string | undefined;
      if (typeof text === "string") {
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      }
    }
  }

  // Caso: array de content blocks directo [{ type: "text", text: "..." }]
  if (
    Array.isArray(raw) &&
    raw.length > 0 &&
    raw.every((c: any) => c && typeof c === "object" && "type" in c)
  ) {
    const text = (raw as Array<any>).find(
      (c) => c?.type === "text" && typeof c?.text === "string"
    )?.text;
    if (typeof text === "string") {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
  }

  // Caso: string JSON
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  // Cualquier otra cosa (objeto plano, array de datos) se devuelve tal cual
  return raw;
}

/**
 * Busca un array de filas dentro del output normalizado, probando varios
 * nombres comunes de campo. Si el output ya es un array, lo devuelve. Si
 * no encuentra nada, devuelve null.
 */
export function extractRows(output: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(output)) return output as Record<string, unknown>[];
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    for (const key of ["rows", "data", "items", "results", "records"]) {
      if (Array.isArray(o[key])) return o[key] as Record<string, unknown>[];
    }
  }
  return null;
}

/**
 * Extrae un array de objetos para una "colección" dada (sources, accounts,
 * metrics, dimensions, dates). Prueba el nombre exacto y varios alternativos.
 * Si el output es un array crudo, lo devuelve.
 */
export function extractCollection(
  output: unknown,
  key: string
): unknown[] {
  if (Array.isArray(output)) return output;
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    // 1) el nombre exacto
    if (Array.isArray(o[key])) return o[key] as unknown[];
    // 2) variantes comunes
    for (const alt of ["data", "items", "results", "records", "list"]) {
      if (Array.isArray(o[alt])) return o[alt] as unknown[];
    }
    // 3) primer valor que sea un array de objetos
    for (const v of Object.values(o)) {
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") {
        return v as unknown[];
      }
    }
  }
  return [];
}

const ACRONYMS: Record<string, string> = {
  bfl: "BFL",
  cpc: "CPC",
  cpa: "CPA",
  gdn: "GDN",
  pmax: "PMax",
  roas: "ROAS",
  sem: "SEM",
};

const LOWERCASE_WORDS = new Set(["a", "de", "del", "el", "en", "la", "las", "los", "para", "por", "y"]);
const TECHNICAL_SEGMENTS = new Set([
  "a",
  "anuncio",
  "bfl",
  "bl",
  "col",
  "cons",
  "cpc",
  "discv",
  "display",
  "est",
  "gdn",
  "isla",
  "salida",
  "salida a venta",
  "sem",
  "trafico",
  "venta",
  "ventas",
]);
const WORD_REPLACEMENTS: Record<string, string> = {
  alvaro: "Álvaro",
  bogota: "Bogotá",
  category: "Categoría",
  conversion: "Conversión",
  convertion: "Conversión",
  diaz: "Díaz",
  engagement: "Interacción",
  estereo: "Estéreo",
  medellin: "Medellín",
  paramo: "Páramo",
  posicion: "Posición",
  profetica: "Profética",
  trafico: "Tráfico",
  zoe: "Zoé",
};
const MONTHS: Record<string, string> = {
  abr: "Abr",
  ago: "Ago",
  apr: "Apr",
  aug: "Aug",
  dec: "Dec",
  dic: "Dic",
  ene: "Ene",
  feb: "Feb",
  jan: "Jan",
  jul: "Jul",
  jun: "Jun",
  mar: "Mar",
  may: "May",
  nov: "Nov",
  oct: "Oct",
  sep: "Sep",
};

function humanizeSegment(segment: string) {
  const withWordBoundaries = segment
    .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, "$1 $2")
    .replace(/([A-Za-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([A-Za-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  return withWordBoundaries
    .split(" ")
    .map((word, index) => {
      const lower = word.toLocaleLowerCase("es-CO");
      if (ACRONYMS[lower]) return ACRONYMS[lower];
      if (MONTHS[lower]) return MONTHS[lower];
      if (WORD_REPLACEMENTS[lower]) return WORD_REPLACEMENTS[lower];
      if (/^\d+(?:\.\d+)?$/.test(word)) return word;
      if (index > 0 && LOWERCASE_WORDS.has(lower)) return lower;
      return `${lower.charAt(0).toLocaleUpperCase("es-CO")}${lower.slice(1)}`;
    })
    .join(" ");
}

export function humanizeCampaignName(name: string | null | undefined, fallback = "Campaña") {
  const normalizedName = name?.trim() || fallback.trim() || "Campaña";
  const segments = normalizedName
    .split(/[_|]+/)
    .filter((segment) => {
      const normalized = segment.trim().toLocaleLowerCase("es-CO");
      return !TECHNICAL_SEGMENTS.has(normalized)
        && !/^\d{4}$/.test(normalized)
        && !/^(?:ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic|jan|apr|aug|dec)\d{2,4}$/.test(normalized);
    })
    .map(humanizeSegment)
    .filter(Boolean);

  return segments.join(" · ") || normalizedName;
}

/**
 * Mock data that mirrors Master Metrics' real MCP tool surface.
 *
 * MM's tools (from their docs at https://mcp.mastermetrics.com):
 *   - health_check
 *   - get_available_sources       → { sources: [{ id, name, displayName }] }
 *   - get_accounts(source)        → { accounts: [{ id, name, source, ... }] }
 *   - get_metrics(source)         → { metrics: [{ name, label, type }] }
 *   - get_dimensions(source)      → { dimensions: [{ name, label }] }
 *   - get_dates(source)           → { dates: [{ name, label }] }  (CRMs only)
 *   - get_data({ source, accounts, metrics, breakdowns, since, until,
 *                dateType?, tileData? })
 *                                 → { rows: [{ ...dimensions, ...metrics }] }
 *
 * Shapes here are our best read of MM's response format from the docs;
 * the generative UI components are defensive so small mismatches against
 * the real server fall back to a JSON view rather than crashing.
 */

// ─── Types ───────────────────────────────────────────────────────────

export type SourceId =
  | "meta"
  | "google"
  | "tiktok"
  | "linkedin"
  | "shopify";

/**
 * Forma canónica para la UI: { id, name }.
 *   - id: identificador estable ("meta", "google", "act_…", "632…")
 *   - name: display ya formateado y bonito ("Meta", "Barbra — Breakfast Live")
 *
 * La normalización desde lo que MM realmente devuelve (sources con
 * {name,label}; accounts con {value,label}) vive en las rutas
 * /api/mcp/sources y /api/mcp/accounts — la UI no debería tener que
 * conocer ese detalle.
 */
export interface Source {
  id: string;
  name: string;
}

export interface MMAccount {
  id: string;
  name: string;
  source: SourceId;
  currency?: string;
  status?: "active" | "paused" | "disabled";
}

export interface MMMetric {
  name: string;
  label: string;
  type: "number" | "currency" | "percent" | "ratio";
}

export interface MMDimension {
  name: string;
  label: string;
}

export type MMRow = Record<string, string | number>;

// ─── Catalog ─────────────────────────────────────────────────────────

export const MOCK_SOURCES: Source[] = [
  { id: "meta", name: "Meta" },
  { id: "google", name: "Google" },
  { id: "tiktok", name: "TikTok" },
  { id: "linkedin", name: "LinkedIn" },
];

export const MOCK_ACCOUNTS: MMAccount[] = [
  // Meta
  { id: "act_8273645", name: "Atelier Couture — Meta", source: "meta", currency: "USD", status: "active" },
  { id: "act_8273712", name: "Estéreo Live — Meta", source: "meta", currency: "COP", status: "active" },
  { id: "act_8273899", name: "Casa del Mar Hotels — Meta", source: "meta", currency: "USD", status: "active" },
  // Google
  { id: "9821-4456-23", name: "Atelier Couture — Google", source: "google", currency: "USD", status: "active" },
  { id: "9821-4456-77", name: "Estéreo Live — Google", source: "google", currency: "COP", status: "active" },
  { id: "9821-4456-91", name: "Vértice Enterprise — Google", source: "google", currency: "USD", status: "active" },
  // TikTok
  { id: "tt_77231", name: "Atelier Couture — TikTok", source: "tiktok", currency: "USD", status: "active" },
  { id: "tt_77310", name: "Estéreo Live — TikTok", source: "tiktok", currency: "COP", status: "active" },
  // LinkedIn
  { id: "li_5582031", name: "Vértice Enterprise — LinkedIn", source: "linkedin", currency: "USD", status: "active" },
  { id: "li_5582120", name: "Estéreo Live — LinkedIn", source: "linkedin", currency: "USD", status: "paused" },
];

// Metrics & dimensions vary by source; this is a typical ad-platform set.
const COMMON_METRICS: MMMetric[] = [
  { name: "spend", label: "Spend", type: "currency" },
  { name: "impressions", label: "Impressions", type: "number" },
  { name: "clicks", label: "Clicks", type: "number" },
  { name: "ctr", label: "CTR", type: "percent" },
  { name: "cpc", label: "CPC", type: "currency" },
  { name: "cpm", label: "CPM", type: "currency" },
  { name: "conversions", label: "Conversions", type: "number" },
  { name: "cpa", label: "CPA", type: "currency" },
  { name: "revenue", label: "Revenue", type: "currency" },
  { name: "roas", label: "ROAS", type: "ratio" },
];

const COMMON_DIMENSIONS: MMDimension[] = [
  { name: "date", label: "Date" },
  { name: "campaign_name", label: "Campaign" },
  { name: "ad_set_name", label: "Ad Set" },
  { name: "ad_name", label: "Ad" },
  { name: "country", label: "Country" },
  { name: "device", label: "Device" },
  { name: "age", label: "Age" },
  { name: "gender", label: "Gender" },
];

export const METRICS_BY_SOURCE: Record<SourceId, MMMetric[]> = {
  meta: COMMON_METRICS,
  google: COMMON_METRICS,
  tiktok: COMMON_METRICS,
  linkedin: COMMON_METRICS,
  shopify: [
    { name: "orders", label: "Orders", type: "number" },
    { name: "revenue", label: "Revenue", type: "currency" },
    { name: "aov", label: "AOV", type: "currency" },
  ],
};

export const DIMENSIONS_BY_SOURCE: Record<SourceId, MMDimension[]> = {
  meta: COMMON_DIMENSIONS,
  google: COMMON_DIMENSIONS,
  tiktok: COMMON_DIMENSIONS,
  linkedin: COMMON_DIMENSIONS.filter((d) => !["age", "gender"].includes(d.name)),
  shopify: [
    { name: "date", label: "Date" },
    { name: "product", label: "Product" },
    { name: "channel", label: "Channel" },
  ],
};

// ─── Synthetic campaign names per account, used to fabricate rows ───

const CAMPAIGNS_BY_ACCOUNT: Record<string, string[]> = {
  act_8273645: ["FW26 Capsule", "Resort Edit Teaser", "VIP Re-engagement", "Always-On Brand"],
  act_8273712: ["Bad Bunny Bogotá", "Festival Estéreo Picnic", "Karol G — VIP Boxes", "Last-Minute Retarget"],
  act_8273899: ["Summer Bookings", "Wedding Season Spotlight", "Direct Booking Push"],
  "9821-4456-23": ["FW26 Search", "Brand Defense", "Performance Max"],
  "9821-4456-77": ["Bad Bunny Search", "Festival Search", "Brand Defense"],
  "9821-4456-91": ["Q2 Demo Gen — Search", "Brand Lift"],
  tt_77231: ["Resort Edit TikTok", "Spark Ads — Couture"],
  tt_77310: ["Festival TikTok Spark", "Karol G TikTok"],
  li_5582031: ["ABM Top Accounts", "Q2 Demo Generation"],
  li_5582120: ["Concert Series Awareness"],
};

// ─── Seeded RNG ──────────────────────────────────────────────────────

function makeRand(seedStr: string) {
  let seed = 0;
  for (const c of seedStr) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
}

function eachDate(since: string, until: string): string[] {
  const out: string[] = [];
  const start = new Date(since + "T00:00:00Z");
  const end = new Date(until + "T00:00:00Z");
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// ─── get_data simulator ──────────────────────────────────────────────

export interface GetDataArgs {
  source: SourceId;
  accounts: string[];
  metrics: string[];
  breakdowns?: string[];
  since: string;
  until: string;
  dateType?: string;
  tileData?: boolean;
}

export interface GetDataResult {
  rows: MMRow[];
  source: SourceId;
  accounts: string[];
  metrics: string[];
  breakdowns: string[];
  since: string;
  until: string;
  tileData: boolean;
}

export function simulateGetData(args: GetDataArgs): GetDataResult {
  const breakdowns = args.breakdowns ?? [];
  const dates = eachDate(args.since, args.until);
  const rows: MMRow[] = [];

  // Cross-product breakdown values
  const crossKeys: Array<{ campaign?: string; date?: string; accountId?: string }> = [];
  for (const accountId of args.accounts) {
    const campaigns = CAMPAIGNS_BY_ACCOUNT[accountId] ?? ["Default Campaign"];
    const wantsDate = breakdowns.includes("date") || breakdowns.length === 0;
    const wantsCampaign = breakdowns.includes("campaign_name");
    const dateList = wantsDate ? dates : [args.until];
    const campaignList = wantsCampaign ? campaigns : [campaigns[0]];
    for (const date of dateList) {
      for (const campaign of campaignList) {
        crossKeys.push({ accountId, campaign, date });
      }
    }
  }

  for (const key of crossKeys) {
    const seed = `${key.accountId}|${key.campaign}|${key.date}`;
    const rand = makeRand(seed);
    const baseSpend = 80 + rand() * 700;
    const impressions = Math.round((baseSpend / (2 + rand() * 4)) * 1000);
    const clicks = Math.round(impressions * (0.012 + rand() * 0.02));
    const conversions = Math.round(clicks * (0.02 + rand() * 0.03));
    const revenue = conversions * (60 + rand() * 200);
    const ctr = impressions ? clicks / impressions : 0;
    const cpc = clicks ? baseSpend / clicks : 0;
    const cpm = impressions ? (baseSpend / impressions) * 1000 : 0;
    const cpa = conversions ? baseSpend / conversions : 0;
    const roas = baseSpend ? revenue / baseSpend : 0;

    const row: MMRow = {};
    if (breakdowns.includes("date") || breakdowns.length === 0) row.date = key.date!;
    if (breakdowns.includes("campaign_name")) row.campaign_name = key.campaign!;
    if (breakdowns.includes("country")) row.country = ["CO", "MX", "US", "CL"][Math.floor(rand() * 4)];
    if (breakdowns.includes("device")) row.device = ["mobile", "desktop", "tablet"][Math.floor(rand() * 3)];
    if (breakdowns.includes("ad_set_name")) row.ad_set_name = `${key.campaign} — AS${Math.floor(rand() * 4) + 1}`;
    if (breakdowns.includes("ad_name")) row.ad_name = `Ad ${Math.floor(rand() * 12) + 1}`;

    const metricValues: Record<string, number> = {
      spend: round(baseSpend),
      impressions,
      clicks,
      ctr: round(ctr, 4),
      cpc: round(cpc),
      cpm: round(cpm),
      conversions,
      cpa: round(cpa),
      revenue: round(revenue),
      roas: round(roas, 3),
      orders: conversions,
      aov: conversions ? round(revenue / conversions) : 0,
    };
    for (const m of args.metrics) {
      if (m in metricValues) row[m] = metricValues[m];
    }
    rows.push(row);
  }

  // tileData=true → aggregate everything into a single totals row
  if (args.tileData) {
    const totals: MMRow = {};
    for (const m of args.metrics) {
      const sum = rows.reduce((acc, r) => acc + (Number(r[m]) || 0), 0);
      // Ratios + percents should average rather than sum
      const isAvg = ["ctr", "cpc", "cpm", "cpa", "roas", "aov"].includes(m);
      totals[m] = isAvg && rows.length ? round(sum / rows.length, 4) : round(sum);
    }
    return {
      rows: [totals],
      source: args.source,
      accounts: args.accounts,
      metrics: args.metrics,
      breakdowns: [],
      since: args.since,
      until: args.until,
      tileData: true,
    };
  }

  return {
    rows,
    source: args.source,
    accounts: args.accounts,
    metrics: args.metrics,
    breakdowns,
    since: args.since,
    until: args.until,
    tileData: false,
  };
}

function round(n: number, places = 2) {
  const f = Math.pow(10, places);
  return Math.round(n * f) / f;
}

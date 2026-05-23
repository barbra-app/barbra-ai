/**
 * Mock Master Metrics data layer.
 *
 * This stands in for the real MCP server until MASTERMETRICS_MCP_URL/TOKEN
 * are wired. Shape mirrors what MM exposes: accounts (clients), campaigns
 * per account, and time-series metrics per campaign across Meta/Google/
 * TikTok/LinkedIn.
 */

export type Channel = "meta" | "google" | "tiktok" | "linkedin";

export interface Account {
  id: string;
  name: string;
  industry: string;
  activeCampaigns: number;
}

export interface Campaign {
  id: string;
  accountId: string;
  name: string;
  channel: Channel;
  status: "active" | "paused" | "ended";
  startDate: string;
  endDate?: string;
}

export interface MetricPoint {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
}

export const MOCK_ACCOUNTS: Account[] = [
  { id: "acc_lux", name: "Atelier Couture", industry: "Luxury Fashion", activeCampaigns: 4 },
  { id: "acc_live", name: "Estéreo Live", industry: "Live Entertainment", activeCampaigns: 6 },
  { id: "acc_ent", name: "Vértice Enterprise", industry: "B2B SaaS", activeCampaigns: 3 },
  { id: "acc_spa", name: "Casa del Mar Hotels", industry: "Hospitality", activeCampaigns: 5 },
];

export const MOCK_CAMPAIGNS: Campaign[] = [
  { id: "cmp_001", accountId: "acc_lux", name: "FW26 Capsule Launch", channel: "meta", status: "active", startDate: "2026-04-15" },
  { id: "cmp_002", accountId: "acc_lux", name: "FW26 Capsule Launch — Search", channel: "google", status: "active", startDate: "2026-04-15" },
  { id: "cmp_003", accountId: "acc_lux", name: "Resort Edit Teaser", channel: "tiktok", status: "active", startDate: "2026-05-01" },
  { id: "cmp_004", accountId: "acc_lux", name: "VIP Re-engagement", channel: "meta", status: "paused", startDate: "2026-03-01", endDate: "2026-04-10" },

  { id: "cmp_010", accountId: "acc_live", name: "Bad Bunny Bogotá — Pre-sale", channel: "meta", status: "ended", startDate: "2026-02-01", endDate: "2026-03-15" },
  { id: "cmp_011", accountId: "acc_live", name: "Bad Bunny Bogotá — General", channel: "google", status: "active", startDate: "2026-03-16" },
  { id: "cmp_012", accountId: "acc_live", name: "Festival Estéreo Picnic 2026", channel: "tiktok", status: "active", startDate: "2026-01-20" },
  { id: "cmp_013", accountId: "acc_live", name: "Karol G — VIP Boxes", channel: "meta", status: "active", startDate: "2026-04-01" },
  { id: "cmp_014", accountId: "acc_live", name: "Concert Series Awareness", channel: "linkedin", status: "active", startDate: "2026-02-15" },
  { id: "cmp_015", accountId: "acc_live", name: "Last-Minute Tickets Retarget", channel: "meta", status: "active", startDate: "2026-05-10" },

  { id: "cmp_020", accountId: "acc_ent", name: "Q2 Demo Generation", channel: "linkedin", status: "active", startDate: "2026-04-01" },
  { id: "cmp_021", accountId: "acc_ent", name: "Brand Lift — Enterprise", channel: "google", status: "active", startDate: "2026-03-01" },
  { id: "cmp_022", accountId: "acc_ent", name: "ABM Top Accounts", channel: "linkedin", status: "active", startDate: "2026-04-20" },

  { id: "cmp_030", accountId: "acc_spa", name: "Summer Bookings — Meta", channel: "meta", status: "active", startDate: "2026-04-01" },
  { id: "cmp_031", accountId: "acc_spa", name: "Summer Bookings — Google", channel: "google", status: "active", startDate: "2026-04-01" },
  { id: "cmp_032", accountId: "acc_spa", name: "Wedding Season Spotlight", channel: "meta", status: "active", startDate: "2026-03-15" },
  { id: "cmp_033", accountId: "acc_spa", name: "Direct Booking Push", channel: "tiktok", status: "active", startDate: "2026-04-25" },
  { id: "cmp_034", accountId: "acc_spa", name: "Loyalty Reactivation", channel: "meta", status: "paused", startDate: "2026-02-01", endDate: "2026-03-30" },
];

/**
 * Generate a deterministic 30-day time series for a campaign.
 * Seeded by campaign id so results are stable across calls.
 */
export function generateMetrics(campaignId: string, days = 30): MetricPoint[] {
  // Simple hash → seed
  let seed = 0;
  for (const c of campaignId) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  const baseSpend = 800 + rand() * 1800;
  const baseCTR = 0.012 + rand() * 0.018;
  const baseCVR = 0.018 + rand() * 0.025;
  const baseAOV = 60 + rand() * 220;

  const points: MetricPoint[] = [];
  const today = new Date("2026-05-23T00:00:00Z");
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);

    // Trend: gentle upward + weekly seasonality + noise
    const trend = 1 + (days - i) * 0.008;
    const weekly = 1 + 0.18 * Math.sin((i / 7) * Math.PI * 2);
    const noise = 0.85 + rand() * 0.3;

    const spend = baseSpend * trend * weekly * noise;
    const impressions = Math.round((spend / (2 + rand() * 4)) * 1000);
    const clicks = Math.round(impressions * baseCTR * (0.9 + rand() * 0.2));
    const conversions = Math.round(clicks * baseCVR * (0.85 + rand() * 0.3));
    const revenue = conversions * baseAOV * (0.9 + rand() * 0.2);

    points.push({
      date: d.toISOString().slice(0, 10),
      spend: Math.round(spend * 100) / 100,
      impressions,
      clicks,
      conversions,
      revenue: Math.round(revenue * 100) / 100,
    });
  }
  return points;
}

export function aggregateMetrics(series: MetricPoint[]) {
  const totals = series.reduce(
    (acc, p) => ({
      spend: acc.spend + p.spend,
      impressions: acc.impressions + p.impressions,
      clicks: acc.clicks + p.clicks,
      conversions: acc.conversions + p.conversions,
      revenue: acc.revenue + p.revenue,
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 }
  );
  return {
    ...totals,
    ctr: totals.impressions ? totals.clicks / totals.impressions : 0,
    cvr: totals.clicks ? totals.conversions / totals.clicks : 0,
    cpa: totals.conversions ? totals.spend / totals.conversions : 0,
    roas: totals.spend ? totals.revenue / totals.spend : 0,
  };
}

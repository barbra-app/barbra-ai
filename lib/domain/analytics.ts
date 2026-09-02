export type DateRangePreset = "7d" | "30d" | "90d";
export type DateRange = DateRangePreset | "custom";
export type CampaignStatus = "active" | "paused" | "completed";
export type MemberRole = "admin" | "user";

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  clientName: string;
  status: "active" | "archived";
}

export interface Campaign {
  id: string;
  projectId: string;
  name: string;
  channel: string;
  objective: string;
  status: CampaignStatus;
}

export interface Artist {
  id: string;
  projectId: string;
  displayName: string;
}

export interface Concert {
  id: string;
  projectId: string;
  artistId: string;
  displayName: string;
  namePattern: string;
}

export interface AppUser {
  uid: string;
  name: string;
  email: string;
  role: MemberRole;
  organizationId: string | null;
  organizationIds: string[];
  projectIds: string[];
}

export interface AnalyticsQuery {
  organizationId: string;
  projectId: string;
  campaignId?: string | null;
  range: DateRange;
  startDate?: string;
  endDate?: string;
}

export interface ConcertQuery {
  organizationId: string;
  projectId: string;
  artistId: string;
  concertId?: string | null;
  range: DateRange;
  startDate?: string;
  endDate?: string;
}

export interface ConcertCampaignBreakdown {
  campaignId: string;
  campaignName: string;
  spend: number;
  billedSpend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
}

export interface ConcertPlatformBreakdown {
  source: string;
  spend: number;
  billedSpend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
  campaigns: ConcertCampaignBreakdown[];
}

export interface ConcertTrendPoint {
  date: string;
  billedSpend: number;
  conversions: number;
}

export type ConcertMetricKey = "spend" | "billedSpend" | "impressions" | "clicks" | "conversions" | "revenue" | "ctr" | "cpc" | "cpa" | "roas";

// What Barbra Intelligence (the chat advisor) is scoped to. Either a
// campaign-level context (Dashboard tab) or an artist/concert context
// (Campañas tab) — never both.
export interface AdvisorScope {
  organizationId: string;
  projectId: string;
  campaignId?: string | null;
  artistId?: string;
  concertId?: string | null;
}

export interface ConcertPlatformTrendPoint {
  date: string;
  source: string;
  spend: number;
  billedSpend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
}

export interface ConcertSummary {
  query: ConcertQuery;
  currency: string;
  updatedAt: string;
  total: ConcertPlatformBreakdown;
  byPlatform: ConcertPlatformBreakdown[];
  trend: ConcertTrendPoint[];
  platformTrend: ConcertPlatformTrendPoint[];
}

export interface MetricSummary {
  id: "spend" | "impressions" | "clicks" | "conversions" | "cpa" | "roas";
  label: string;
  value: number;
  previousValue: number;
  format: "currency" | "number" | "percent" | "ratio";
  positiveWhen: "up" | "down";
}

export interface TrendPoint {
  date: string;
  spend: number;
  revenue: number;
  conversions: number;
}

export interface ChannelBreakdown {
  channel: string;
  spend: number;
  conversions: number;
  color: string;
}

export interface CampaignPerformance {
  id: string;
  name: string;
  channel: string;
  status: CampaignStatus;
  spend: number;
  conversions: number;
  cpa: number;
  roas: number;
}

export interface AdvisorInsight {
  id: string;
  tone: "opportunity" | "risk" | "info";
  title: string;
  summary: string;
  metric: string;
  action: string;
}

export interface DashboardSnapshot {
  query: AnalyticsQuery;
  currency: string;
  updatedAt: string;
  periodLabel: string;
  metrics: MetricSummary[];
  trend: TrendPoint[];
  channelMix: ChannelBreakdown[];
  campaigns: CampaignPerformance[];
  insights: AdvisorInsight[];
}

export const DEMO_ORGANIZATIONS: Organization[] = [
  { id: "org_barbra", name: "Barbra", slug: "barbra" },
];

export const DEMO_PROJECTS: Project[] = [
  { id: "prj_ritvales", organizationId: "org_barbra", name: "Ritvales", clientName: "Ritvales", status: "active" },
  { id: "prj_estereo", organizationId: "org_barbra", name: "Estéreo Live", clientName: "Estéreo Live", status: "active" },
  { id: "prj_atelier", organizationId: "org_barbra", name: "Atelier Couture", clientName: "Atelier Couture", status: "active" },
];

export const DEMO_CAMPAIGNS: Campaign[] = [
  { id: "cmp_awareness", projectId: "prj_ritvales", name: "Always-on Awareness", channel: "Meta", objective: "Awareness", status: "active" },
  { id: "cmp_leads", projectId: "prj_ritvales", name: "Lead Generation · Q3", channel: "Google", objective: "Leads", status: "active" },
  { id: "cmp_retarget", projectId: "prj_ritvales", name: "High Intent Retargeting", channel: "Meta", objective: "Conversions", status: "active" },
  { id: "cmp_festival", projectId: "prj_estereo", name: "Festival Estéreo Picnic", channel: "Meta", objective: "Ticket sales", status: "active" },
  { id: "cmp_search", projectId: "prj_estereo", name: "Concert Search", channel: "Google", objective: "Ticket sales", status: "active" },
  { id: "cmp_capsule", projectId: "prj_atelier", name: "FW26 Capsule", channel: "Meta", objective: "Revenue", status: "active" },
];

export const DEMO_ARTISTS: Artist[] = [
  { id: "art_festival", projectId: "prj_estereo", displayName: "Festival Estéreo Picnic" },
];

export const DEMO_CONCERTS: Concert[] = [
  {
    id: "cct_festival_bogota",
    projectId: "prj_estereo",
    artistId: "art_festival",
    displayName: "Festival Estéreo Picnic — Bogotá",
    namePattern: "BFL_FestivalEstereo",
  },
];

export const DEMO_USER: AppUser = {
  uid: "demo_steve",
  name: "Steve Suárez",
  email: "steve@barbra.com.co",
  role: "admin",
  organizationId: null,
  organizationIds: ["org_barbra"],
  projectIds: DEMO_PROJECTS.map((project) => project.id),
};

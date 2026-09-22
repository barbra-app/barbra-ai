export type DateRangePreset = "7d" | "30d" | "90d" | "all";
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
  sourceName?: string;
  channel: string;
  objective: string;
  status: CampaignStatus;
}

export interface Artist {
  id: string;
  projectId: string;
  displayName: string;
  photoUrl?: string;
}

export interface Concert {
  id: string;
  projectId: string;
  artistId: string;
  displayName: string;
  namePattern: string;
  photoUrl?: string;
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

export interface ConcertCreative {
  adId: string;
  adName: string;
  creativeType: string;
  thumbnailUrl: string;
  // Where clicking the creative goes: the live Facebook post for meta_ads,
  // the full-size image for google_ads (no live public page to link to).
  permalinkUrl?: string;
  // Per-ad/asset metrics for the query's date range — only available for
  // meta_ads (Google's Performance Max API doesn't expose real per-asset
  // impressions/clicks/conversions). Undefined, not 0, when unavailable —
  // 0 would misleadingly read as "ran but got nothing."
  impressions?: number;
  linkClicks?: number;
  conversions?: number;
  // billedSpend (real spend * 1.6) / conversions; only set alongside the
  // metrics above.
  costPerConversion?: number;
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
  // Only populated for sources with creative ingestion
  creatives: ConcertCreative[];
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
  range?: DateRange;
  startDate?: string;
  endDate?: string;
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

export interface EventPerformance {
  id: string;
  displayName: string;
  artistId: string;
  artistName: string;
  photoUrl?: string;
  artistPhotoUrl?: string;
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

export interface AdPerformance {
  adId: string;
  adName: string;
  creativeType: string;
  thumbnailUrl: string;
  permalinkUrl?: string;
  source: string;
  campaignName: string;
  eventId?: string;
  eventDisplayName?: string;
  impressions: number;
  linkClicks: number;
  conversions: number;
  costPerConversion: number;
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
  // Every matched event/ad for the project's date range, unsorted-safe —
  // the UI sorts and slices to a top 10 by whichever metric is selected.
  // Empty, not an error, when the project has no events configured yet.
  topEvents: EventPerformance[];
  topAds: AdPerformance[];
}

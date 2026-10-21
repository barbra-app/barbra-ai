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
  // The ad-platform's own campaign id — pairs with `channel` to form the
  // "source:campaignId" keys used by Concert.excludedCampaignIds.
  externalCampaignId: string;
  objective: string;
  status: CampaignStatus;
}

export interface Artist {
  id: string;
  projectId: string;
  displayName: string;
  photoUrl?: string;
}

export interface ConcertEvidencePhoto {
  url: string;
  caption: string;
  uploadedAt: string;
}

// A platform whose numbers arrive outside the ad APIs and are typed in by an admin. Not tied to the selected date
// range and not summed into the API-backed KPIs. 
export interface ConcertManualSource {
  id: string;
  platform: string;
  // On/off status set by the admin; drives the same green/red dot as API
  active: boolean;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  // Fraction (0.013 = 1.3%), same as the API-backed rows.
  ctr: number | null;
  billedSpend: number | null;
  notes: string;
  updatedAt: string;
}

export interface Concert {
  id: string;
  projectId: string;
  artistId: string;
  displayName: string;
  namePatterns: string[];
  photoUrl?: string;
  // ISO date (YYYY-MM-DD) of the event itself — once past, the event is
  // considered finished regardless of campaign status.
  eventDate?: string;
  // "source:campaignId" keys to exclude from this concert's analytics, for
  // campaigns that were renamed/repurposed on the ad platform (same
  // campaign_id, different campaign_name over time) and now wrongly match
  // this concert's namePatterns on their old historical rows.
  excludedCampaignIds?: string[];
  evidencePhotos?: ConcertEvidencePhoto[];
  manualSources?: ConcertManualSource[];
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

export interface ConcertSegmentBreakdown {
  label: string;
  // Only set for breakdowns that span more than one ad platform (currently
  // publisherPlatformBreakdown: Meta's publisher_platform and Google's
  // ad_network_type use unrelated label sets, so the source disambiguates).
  source?: string;
  spend: number;
  billedSpend: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

export interface ConcertSummary {
  query: ConcertQuery;
  currency: string;
  updatedAt: string;
  // Includes every manual source, regardless of the selected period.
  total: ConcertPlatformBreakdown;
  byPlatform: ConcertPlatformBreakdown[];
  manualSources: ConcertManualSource[];
  trend: ConcertTrendPoint[];
  platformTrend: ConcertPlatformTrendPoint[];
  deviceBreakdown: ConcertSegmentBreakdown[];
  geoBreakdown: ConcertSegmentBreakdown[];
  ageBreakdown: ConcertSegmentBreakdown[];
  genderBreakdown: ConcertSegmentBreakdown[];
  publisherPlatformBreakdown: ConcertSegmentBreakdown[];
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

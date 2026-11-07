import type { AnalyticsQuery, ConcertQuery, ConcertSummary, DashboardSnapshot } from "@/lib/domain/analytics";

export interface UnmappedCampaign {
  campaignName: string;
  source: string;
}

export interface AnalyticsRepository {
  getDashboard(query: AnalyticsQuery, context?: { firestoreToken?: string }): Promise<DashboardSnapshot>;
  getConcertSummary(query: ConcertQuery, context?: { firestoreToken?: string }): Promise<ConcertSummary>;
  findUnmappedCampaigns(params: { clientId: string; namePatterns: string[] }): Promise<UnmappedCampaign[]>;
}

export function calculateDelta(current: number, previous: number): number {
  if (!previous) return current ? 1 : 0;
  return (current - previous) / previous;
}

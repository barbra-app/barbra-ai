import type { AnalyticsQuery, ConcertQuery, ConcertSummary, DashboardSnapshot } from "@/lib/domain/analytics";

export interface AnalyticsRepository {
  getDashboard(query: AnalyticsQuery): Promise<DashboardSnapshot>;
  getConcertSummary(query: ConcertQuery): Promise<ConcertSummary>;
}

export function calculateDelta(current: number, previous: number): number {
  if (!previous) return current ? 1 : 0;
  return (current - previous) / previous;
}

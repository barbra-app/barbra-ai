import type { AnalyticsQuery, DashboardSnapshot } from "@/lib/domain/analytics";

export interface AnalyticsRepository {
  getDashboard(query: AnalyticsQuery, context?: { firestoreToken?: string }): Promise<DashboardSnapshot>;
}

export function calculateDelta(current: number, previous: number): number {
  if (!previous) return current ? 1 : 0;
  return (current - previous) / previous;
}

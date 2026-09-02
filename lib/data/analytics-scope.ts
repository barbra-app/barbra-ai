import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import type { AnalyticsQuery, ConcertQuery } from "@/lib/domain/analytics";

export interface CampaignAnalyticsScope {
  source: string;
  accountId: string;
  campaignId: string;
}

export interface AnalyticsScope {
  clientId: string;
  campaigns: CampaignAnalyticsScope[];
}

function requiredString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function campaignScope(data: FirebaseFirestore.DocumentData | undefined): CampaignAnalyticsScope | null {
  const source = requiredString(data?.source ?? data?.channel);
  const accountId = requiredString(data?.accountId);
  const campaignId = requiredString(data?.externalCampaignId);
  return source && accountId && campaignId ? { source, accountId, campaignId } : null;
}

/**
 * Translates Firebase catalog ids into the canonical BigQuery identifiers.
 * Firebase owns tenancy/access; BigQuery only knows clients and ad-platform ids.
 */
export async function resolveAnalyticsScope(query: AnalyticsQuery): Promise<AnalyticsScope> {
  const db = getFirebaseAdminFirestore();
  const [organization, project] = await Promise.all([
    db.collection("organizations").doc(query.organizationId).get(),
    db.collection("projects").doc(query.projectId).get(),
  ]);

  if (!organization.exists || !project.exists) throw new Error("ANALYTICS_SCOPE_NOT_FOUND");
  if (requiredString(project.data()?.organizationId) !== query.organizationId) {
    throw new Error("ANALYTICS_SCOPE_MISMATCH");
  }

  const clientId = requiredString(organization.data()?.analyticsClientId);
  if (!clientId) throw new Error("ANALYTICS_CLIENT_NOT_CONFIGURED");

  if (query.campaignId) {
    const campaign = await db.collection("campaigns").doc(query.campaignId).get();
    if (!campaign.exists || requiredString(campaign.data()?.projectId) !== query.projectId) {
      throw new Error("ANALYTICS_CAMPAIGN_NOT_FOUND");
    }
    const scope = campaignScope(campaign.data());
    if (!scope) throw new Error("ANALYTICS_CAMPAIGN_NOT_CONFIGURED");
    return { clientId, campaigns: [scope] };
  }

  const campaigns = await db.collection("campaigns").where("projectId", "==", query.projectId).get();
  const scopes = campaigns.docs
    .map((document) => campaignScope(document.data()))
    .filter((scope): scope is CampaignAnalyticsScope => scope !== null);

  if (!scopes.length) throw new Error("ANALYTICS_PROJECT_NOT_CONFIGURED");
  return { clientId, campaigns: scopes };
}

export interface ConcertAnalyticsScope {
  clientId: string;
  namePatterns: string[];
}

/**
 * Translates a Firestore artist/concert selection into the raw campaign_name
 * prefixes used to match campaigns across sources in BigQuery. A single
 * concert resolves to one pattern; omitting concertId resolves to every
 * concert under that artist (the combined multi-date summary).
 */
export async function resolveConcertScope(query: ConcertQuery): Promise<ConcertAnalyticsScope> {
  const db = getFirebaseAdminFirestore();
  const [organization, project] = await Promise.all([
    db.collection("organizations").doc(query.organizationId).get(),
    db.collection("projects").doc(query.projectId).get(),
  ]);

  if (!organization.exists || !project.exists) throw new Error("ANALYTICS_SCOPE_NOT_FOUND");
  if (requiredString(project.data()?.organizationId) !== query.organizationId) {
    throw new Error("ANALYTICS_SCOPE_MISMATCH");
  }

  const clientId = requiredString(organization.data()?.analyticsClientId);
  if (!clientId) throw new Error("ANALYTICS_CLIENT_NOT_CONFIGURED");

  if (query.concertId) {
    const concert = await db.collection("concerts").doc(query.concertId).get();
    const data = concert.data();
    if (!concert.exists || requiredString(data?.projectId) !== query.projectId || requiredString(data?.artistId) !== query.artistId) {
      throw new Error("ANALYTICS_CONCERT_NOT_FOUND");
    }
    const pattern = requiredString(data?.namePattern);
    if (!pattern) throw new Error("ANALYTICS_CONCERT_NOT_CONFIGURED");
    return { clientId, namePatterns: [pattern] };
  }

  const concerts = await db
    .collection("concerts")
    .where("projectId", "==", query.projectId)
    .where("artistId", "==", query.artistId)
    .get();
  const namePatterns = concerts.docs
    .map((document) => requiredString(document.data()?.namePattern))
    .filter((pattern): pattern is string => pattern !== null);

  if (!namePatterns.length) throw new Error("ANALYTICS_ARTIST_NOT_CONFIGURED");
  return { clientId, namePatterns };
}

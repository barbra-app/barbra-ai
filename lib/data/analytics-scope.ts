import { getFirestoreDocument, queryFirestoreDocuments } from "@/lib/firebase/firestore-rest";
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

function campaignScope(data: Record<string, unknown> | undefined): CampaignAnalyticsScope | null {
  const source = requiredString(data?.source ?? data?.channel);
  const accountId = requiredString(data?.accountId);
  const campaignId = requiredString(data?.externalCampaignId);
  return source && accountId && campaignId ? { source, accountId, campaignId } : null;
}

/**
 * Translates Firebase catalog ids into the canonical BigQuery identifiers.
 * Firebase owns tenancy/access; BigQuery only knows clients and ad-platform ids.
 */
export async function resolveAnalyticsScope(query: AnalyticsQuery, firebaseIdToken?: string): Promise<AnalyticsScope> {
  const [organization, project] = await Promise.all([
    getFirestoreDocument("organizations", query.organizationId, firebaseIdToken),
    getFirestoreDocument("projects", query.projectId, firebaseIdToken),
  ]);

  if (!organization.exists || !project.exists) throw new Error("ANALYTICS_SCOPE_NOT_FOUND");
  if (requiredString(project.data.organizationId) !== query.organizationId) {
    throw new Error("ANALYTICS_SCOPE_MISMATCH");
  }

  const clientId = requiredString(organization.data.analyticsClientId);
  if (!clientId) throw new Error("ANALYTICS_CLIENT_NOT_CONFIGURED");

  if (query.campaignId) {
    const campaign = await getFirestoreDocument("campaigns", query.campaignId, firebaseIdToken);
    if (!campaign.exists || requiredString(campaign.data.projectId) !== query.projectId) {
      throw new Error("ANALYTICS_CAMPAIGN_NOT_FOUND");
    }
    const scope = campaignScope(campaign.data);
    if (!scope) throw new Error("ANALYTICS_CAMPAIGN_NOT_CONFIGURED");
    return { clientId, campaigns: [scope] };
  }

  const campaigns = await queryFirestoreDocuments("campaigns", "projectId", query.projectId, firebaseIdToken);
  const scopes = campaigns
    .map((document) => campaignScope(document.data))
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
export async function resolveConcertScope(query: ConcertQuery, firebaseIdToken?: string): Promise<ConcertAnalyticsScope> {
  const [organization, project] = await Promise.all([
    getFirestoreDocument("organizations", query.organizationId, firebaseIdToken),
    getFirestoreDocument("projects", query.projectId, firebaseIdToken),
  ]);

  if (!organization.exists || !project.exists) throw new Error("ANALYTICS_SCOPE_NOT_FOUND");
  if (requiredString(project.data.organizationId) !== query.organizationId) {
    throw new Error("ANALYTICS_SCOPE_MISMATCH");
  }

  const clientId = requiredString(organization.data.analyticsClientId);
  if (!clientId) throw new Error("ANALYTICS_CLIENT_NOT_CONFIGURED");

  if (query.concertId) {
    const concert = await getFirestoreDocument("concerts", query.concertId, firebaseIdToken);
    if (!concert.exists || requiredString(concert.data.projectId) !== query.projectId || requiredString(concert.data.artistId) !== query.artistId) {
      throw new Error("ANALYTICS_CONCERT_NOT_FOUND");
    }
    const pattern = requiredString(concert.data.namePattern);
    if (!pattern) throw new Error("ANALYTICS_CONCERT_NOT_CONFIGURED");
    return { clientId, namePatterns: [pattern] };
  }

  // Firestore REST queries only filter on one field; narrow by artistId and
  // verify projectId in memory rather than adding a compound index.
  const concerts = await queryFirestoreDocuments("concerts", "artistId", query.artistId, firebaseIdToken);
  const namePatterns = concerts
    .filter((document) => requiredString(document.data.projectId) === query.projectId)
    .map((document) => requiredString(document.data.namePattern))
    .filter((pattern): pattern is string => pattern !== null);

  if (!namePatterns.length) throw new Error("ANALYTICS_ARTIST_NOT_CONFIGURED");
  return { clientId, namePatterns };
}

export interface ProjectEventScope {
  id: string;
  artistId: string;
  displayName: string;
  namePattern: string;
  photoUrl?: string;
  artistName: string;
  artistPhotoUrl?: string;
}

/**
 * Every concert/event configured across the whole project, regardless of
 * artist, used to rank events and ads for the Dashboard tab. Takes clientId as an argument
 * (rather than re-resolving it) since callers already have it from resolveAnalyticsScope.
 */
export async function resolveProjectConcertScope(query: { projectId: string }, firebaseIdToken?: string): Promise<ProjectEventScope[]> {
  const [concerts, artists] = await Promise.all([
    queryFirestoreDocuments("concerts", "projectId", query.projectId, firebaseIdToken),
    queryFirestoreDocuments("artists", "projectId", query.projectId, firebaseIdToken),
  ]);

  const artistsById = new Map(artists.map((document) => [document.id, document.data]));

  return concerts
    .map((document): ProjectEventScope | null => {
      const namePattern = requiredString(document.data.namePattern);
      const artistId = requiredString(document.data.artistId);
      if (!namePattern || !artistId) return null;
      const artist = artistsById.get(artistId);
      return {
        id: document.id,
        artistId,
        displayName: requiredString(document.data.displayName) ?? "",
        namePattern,
        photoUrl: requiredString(document.data.photoUrl) ?? undefined,
        artistName: requiredString(artist?.displayName) ?? "",
        artistPhotoUrl: requiredString(artist?.photoUrl) ?? undefined,
      };
    })
    .filter((scope): scope is ProjectEventScope => scope !== null);
}

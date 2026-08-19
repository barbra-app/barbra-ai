import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import type { AnalyticsQuery } from "@/lib/domain/analytics";

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

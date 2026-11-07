import { concertNamePatterns } from "@/lib/data/analytics-scope";
import { createFirestoreDocument, listFirestoreDocuments, queryFirestoreDocuments, updateFirestoreDocument } from "@/lib/firebase/firestore-rest";

// Re-running the BigQuery scan on every notifications poll (every 60s, per
// admin) would be wasteful — most checks would just confirm nothing changed.
// Throttle per organization via a timestamp stored on its own doc.
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

function requiredString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function checkOrganization(organizationId: string, clientId: string, firebaseIdToken?: string) {
  const projects = await queryFirestoreDocuments("projects", "organizationId", organizationId, firebaseIdToken);
  const concertsByProject = await Promise.all(
    projects.map((project) => queryFirestoreDocuments("concerts", "projectId", project.id, firebaseIdToken)),
  );
  const namePatterns = concertsByProject.flat().flatMap((concert) => concertNamePatterns(concert.data));
  if (!namePatterns.length) return;

  const { getAnalyticsRepository } = await import("@/lib/data/get-analytics-repository");
  const repository = await getAnalyticsRepository();
  const unmapped = await repository.findUnmappedCampaigns({ clientId, namePatterns });
  if (!unmapped.length) return;

  for (const campaign of unmapped) {
    const dedupeKey = `unmapped:${organizationId}:${campaign.campaignName}`;
    const existing = await queryFirestoreDocuments("notifications", "dedupeKey", dedupeKey, firebaseIdToken);
    if (existing.some((doc) => doc.exists)) continue;

    await createFirestoreDocument("notifications", {
      organizationId,
      createdBy: "system",
      type: "unmapped_campaign",
      dedupeKey,
      title: "Campaña sin mapear",
      message: `La campaña "${campaign.campaignName}" (${campaign.source}) no coincide con ningún evento configurado`,
      createdAt: new Date().toISOString(),
      readBy: [],
    }, firebaseIdToken);
  }
}

// Runs the scan across every organization with an analytics client configured,
// skipping any checked within the last hour. Called as a side effect of an
// admin loading notifications — failures here must never break that request.
export async function checkUnmappedCampaignsForAllOrganizations(firebaseIdToken?: string) {
  const organizations = await listFirestoreDocuments("organizations", firebaseIdToken);

  for (const organization of organizations) {
    if (!organization.exists) continue;
    const clientId = requiredString(organization.data.analyticsClientId);
    if (!clientId) continue;

    const lastCheckedAt = typeof organization.data.lastUnmappedCampaignCheckAt === "string"
      ? Date.parse(organization.data.lastUnmappedCampaignCheckAt)
      : 0;
    if (Date.now() - lastCheckedAt < CHECK_INTERVAL_MS) continue;

    try {
      await checkOrganization(organization.id, clientId, firebaseIdToken);
    } catch (error) {
      console.error(`[unmapped-campaigns] check failed for organization ${organization.id}`, error);
    } finally {
      await updateFirestoreDocument(
        "organizations",
        organization.id,
        { lastUnmappedCampaignCheckAt: new Date().toISOString() },
        firebaseIdToken,
      ).catch((error) => console.error(`[unmapped-campaigns] failed to record check timestamp for ${organization.id}`, error));
    }
  }
}

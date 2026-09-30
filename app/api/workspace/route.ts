import { NextResponse } from "next/server";
import { getRequestUser, requestBearerToken } from "@/lib/auth/server-session";
import { runtimeEnv } from "@/lib/runtime-env";
import { humanizeCampaignName } from "@/lib/campaign-name";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getRequestUser(request);
    const { getFirestoreDocument, listFirestoreDocuments, queryFirestoreDocuments } = await import("@/lib/firebase/firestore-rest");
    const useServiceAccount = await runtimeEnv("FIRESTORE_USE_SERVICE_ACCOUNT") === "true";
    const firebaseIdToken = useServiceAccount ? undefined : requestBearerToken(request) ?? undefined;
    const admin = user.role === "admin";
    const organizationIds = user.organizationId ? [user.organizationId] : user.organizationIds;
    const [organizationDocs, projectDocs] = await Promise.all([
      admin
        ? listFirestoreDocuments("organizations", firebaseIdToken)
        : Promise.all(organizationIds.map((id) => getFirestoreDocument("organizations", id, firebaseIdToken))),
      admin
        ? listFirestoreDocuments("projects", firebaseIdToken)
        : user.projectIds.length
          ? Promise.all(user.projectIds.map((id) => getFirestoreDocument("projects", id, firebaseIdToken)))
          : Promise.all(organizationIds.map((id) => queryFirestoreDocuments("projects", "organizationId", id, firebaseIdToken)))
              .then((snapshots) => snapshots.flat()),
    ]);
    const organizations = organizationDocs.filter((doc) => doc.exists).map((doc) => ({
      id: doc.id,
      name: String(doc.data.name ?? doc.id),
      slug: String(doc.data.slug ?? doc.id),
    }));
    const projects = projectDocs.filter((doc) => doc.exists).map((doc) => ({
      id: doc.id,
      organizationId: String(doc.data.organizationId ?? ""),
      name: String(doc.data.name ?? doc.id),
      clientName: String(doc.data.clientName ?? doc.data.name ?? doc.id),
      status: doc.data.status === "archived" ? "archived" as const : "active" as const,
    }));
    const [campaignSnapshots, artistSnapshots, concertSnapshots] = await Promise.all([
      Promise.all(projects.map((project) => queryFirestoreDocuments("campaigns", "projectId", project.id, firebaseIdToken))),
      Promise.all(projects.map((project) => queryFirestoreDocuments("artists", "projectId", project.id, firebaseIdToken))),
      Promise.all(projects.map((project) => queryFirestoreDocuments("concerts", "projectId", project.id, firebaseIdToken))),
    ]);
    const campaigns = campaignSnapshots.flatMap((snapshot) => snapshot.flatMap((doc) => {
      const data = doc.data;
      // Only expose campaigns that have a complete mapping to the canonical
      // BigQuery mart. This keeps selectors and analytics queries consistent.
      if (!data.source || !data.accountId || !data.externalCampaignId) return [];
      const sourceName = String(data.name ?? doc.id);
      return [{
        id: doc.id,
        projectId: String(data.projectId),
        name: String(data.displayName ?? humanizeCampaignName(sourceName)),
        sourceName,
        channel: String(data.source),
        objective: String(data.objective ?? "Performance"),
        status: (["active", "paused", "completed"].includes(String(data.status)) ? String(data.status) : "active") as "active" | "paused" | "completed",
      }];
    }));
    const artists = artistSnapshots
      .flatMap((snapshot) => snapshot.map((doc) => ({
        id: doc.id,
        projectId: String(doc.data.projectId ?? ""),
        displayName: String(doc.data.displayName ?? doc.id),
        photoUrl: doc.data.photoUrl ? String(doc.data.photoUrl) : undefined,
      })))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));
    const concerts = concertSnapshots
      .flatMap((snapshot) => snapshot.flatMap((doc) => {
        const data = doc.data;
        // Only expose concerts with a usable pattern — an incomplete doc
        // would otherwise resolve to zero campaigns silently.
        if (!data.artistId || !data.namePattern) return [];
        return [{
          id: doc.id,
          projectId: String(data.projectId),
          artistId: String(data.artistId),
          displayName: String(data.displayName ?? doc.id),
          namePattern: String(data.namePattern),
          photoUrl: data.photoUrl ? String(data.photoUrl) : undefined,
        }];
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));

    return NextResponse.json({ data: { user, organizations, projects, campaigns, artists, concerts }, mode: "firebase" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNAUTHENTICATED";
    console.error("[workspace] load failed:", error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    if (message.startsWith("FIRESTORE_") || message.startsWith("GOOGLE_")) {
      return NextResponse.json(
        { error: "No pudimos conectar con el catálogo de datos. Intenta nuevamente en unos minutos." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: message === "USER_PROFILE_NOT_FOUND" ? "User profile not provisioned" : "Authentication required" },
      { status: message === "USER_PROFILE_NOT_FOUND" ? 403 : 401 },
    );
  }
}

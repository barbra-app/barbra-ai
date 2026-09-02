import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/server-session";
import { DEMO_ARTISTS, DEMO_CAMPAIGNS, DEMO_CONCERTS, DEMO_ORGANIZATIONS, DEMO_PROJECTS, DEMO_USER } from "@/lib/domain/analytics";

export const dynamic = "force-dynamic";

function demoWorkspace(user = DEMO_USER) {
  const organizations = user.role === "admin"
    ? DEMO_ORGANIZATIONS
    : DEMO_ORGANIZATIONS.filter((organization) => organization.id === user.organizationId);
  const organizationIds = new Set(organizations.map((organization) => organization.id));
  const projects = DEMO_PROJECTS.filter((project) => organizationIds.has(project.organizationId) && (user.role === "admin" || user.projectIds.length === 0 || user.projectIds.includes(project.id)));
  const projectIds = new Set(projects.map((project) => project.id));
  const campaigns = DEMO_CAMPAIGNS.filter((campaign) => projectIds.has(campaign.projectId));
  const artists = DEMO_ARTISTS.filter((artist) => projectIds.has(artist.projectId));
  const concerts = DEMO_CONCERTS.filter((concert) => projectIds.has(concert.projectId));
  return { user, organizations, projects, campaigns, artists, concerts };
}

export async function GET(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!request.headers.get("authorization")) return NextResponse.json({ data: demoWorkspace(), mode: "demo" });
    if ((process.env.ANALYTICS_PROVIDER ?? "mock") === "mock") {
      return NextResponse.json({ data: demoWorkspace(user), mode: "firebase-auth" });
    }

    const { getFirebaseAdminFirestore } = await import("@/lib/firebase/admin");
    const db = getFirebaseAdminFirestore();
    const admin = user.role === "admin";
    const organizationIds = user.organizationId ? [user.organizationId] : user.organizationIds;
    const [organizationDocs, projectDocs] = await Promise.all([
      admin
        ? db.collection("organizations").get().then((snapshot) => snapshot.docs)
        : Promise.all(organizationIds.map((id) => db.collection("organizations").doc(id).get())),
      admin
        ? db.collection("projects").get().then((snapshot) => snapshot.docs)
        : user.projectIds.length
          ? Promise.all(user.projectIds.map((id) => db.collection("projects").doc(id).get()))
          : Promise.all(organizationIds.map((id) => db.collection("projects").where("organizationId", "==", id).get()))
              .then((snapshots) => snapshots.flatMap((snapshot) => snapshot.docs)),
    ]);
    const organizations = organizationDocs.filter((doc) => doc.exists).map((doc) => ({
      id: doc.id,
      name: String(doc.data()?.name ?? doc.id),
      slug: String(doc.data()?.slug ?? doc.id),
    }));
    const projects = projectDocs.filter((doc) => doc.exists).map((doc) => ({
      id: doc.id,
      organizationId: String(doc.data()?.organizationId ?? ""),
      name: String(doc.data()?.name ?? doc.id),
      clientName: String(doc.data()?.clientName ?? doc.data()?.name ?? doc.id),
      status: doc.data()?.status === "archived" ? "archived" as const : "active" as const,
    }));
    const [campaignSnapshots, artistSnapshots, concertSnapshots] = await Promise.all([
      Promise.all(projects.map((project) => db.collection("campaigns").where("projectId", "==", project.id).get())),
      Promise.all(projects.map((project) => db.collection("artists").where("projectId", "==", project.id).get())),
      Promise.all(projects.map((project) => db.collection("concerts").where("projectId", "==", project.id).get())),
    ]);
    const campaigns = campaignSnapshots.flatMap((snapshot) => snapshot.docs.flatMap((doc) => {
      const data = doc.data();
      // Only expose campaigns that have a complete mapping to the canonical
      // BigQuery mart. This keeps selectors and analytics queries consistent.
      if (!data.source || !data.accountId || !data.externalCampaignId) return [];
      return [{
        id: doc.id,
        projectId: String(data.projectId),
        name: String(data.name ?? doc.id),
        channel: String(data.source),
        objective: String(data.objective ?? "Performance"),
        status: (["active", "paused", "completed"].includes(data.status) ? data.status : "active") as "active" | "paused" | "completed",
      }];
    }));
    const artists = artistSnapshots
      .flatMap((snapshot) => snapshot.docs.map((doc) => ({
        id: doc.id,
        projectId: String(doc.data()?.projectId ?? ""),
        displayName: String(doc.data()?.displayName ?? doc.id),
      })))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));
    const concerts = concertSnapshots
      .flatMap((snapshot) => snapshot.docs.flatMap((doc) => {
        const data = doc.data();
        // Only expose concerts with a usable pattern — an incomplete doc
        // would otherwise resolve to zero campaigns silently.
        if (!data.artistId || !data.namePattern) return [];
        return [{
          id: doc.id,
          projectId: String(data.projectId),
          artistId: String(data.artistId),
          displayName: String(data.displayName ?? doc.id),
          namePattern: String(data.namePattern),
        }];
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));

    return NextResponse.json({ data: { user, organizations, projects, campaigns, artists, concerts }, mode: "firebase" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNAUTHENTICATED";
    return NextResponse.json(
      { error: message === "USER_PROFILE_NOT_FOUND" ? "User profile not provisioned" : "Authentication required" },
      { status: message === "USER_PROFILE_NOT_FOUND" ? 403 : 401 },
    );
  }
}

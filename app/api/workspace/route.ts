import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/server-session";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { DEMO_CAMPAIGNS, DEMO_ORGANIZATIONS, DEMO_PROJECTS, DEMO_USER } from "@/lib/domain/analytics";

export const dynamic = "force-dynamic";

function demoWorkspace() {
  return { user: DEMO_USER, organizations: DEMO_ORGANIZATIONS, projects: DEMO_PROJECTS, campaigns: DEMO_CAMPAIGNS };
}

export async function GET(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!request.headers.get("authorization")) return NextResponse.json({ data: demoWorkspace(), mode: "demo" });

    const db = getFirebaseAdminFirestore();
    const [organizationDocs, projectDocs] = await Promise.all([
      Promise.all(user.organizationIds.map((id) => db.collection("organizations").doc(id).get())),
      Promise.all(user.projectIds.map((id) => db.collection("projects").doc(id).get())),
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
    const campaignSnapshots = await Promise.all(
      projects.map((project) => db.collection("campaigns").where("projectId", "==", project.id).get()),
    );
    const campaigns = campaignSnapshots.flatMap((snapshot) => snapshot.docs.map((doc) => ({
      id: doc.id,
      projectId: String(doc.data().projectId),
      name: String(doc.data().name ?? doc.id),
      channel: String(doc.data().channel ?? doc.data().source ?? "unknown"),
      objective: String(doc.data().objective ?? "Performance"),
      status: (["active", "paused", "completed"].includes(doc.data().status) ? doc.data().status : "active") as "active" | "paused" | "completed",
    })));

    return NextResponse.json({ data: { user, organizations, projects, campaigns }, mode: "firebase" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNAUTHENTICATED";
    return NextResponse.json(
      { error: message === "USER_PROFILE_NOT_FOUND" ? "User profile not provisioned" : "Authentication required" },
      { status: message === "USER_PROFILE_NOT_FOUND" ? 403 : 401 },
    );
  }
}

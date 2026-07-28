import { DEMO_USER, type AppUser } from "@/lib/domain/analytics";

function bearerToken(request: Request) {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

export async function getRequestUser(request: Request): Promise<AppUser> {
  const token = bearerToken(request);
  const authRequired = process.env.REQUIRE_FIREBASE_AUTH === "true";
  if (!token) {
    if (authRequired) throw new Error("UNAUTHENTICATED");
    return DEMO_USER;
  }

  const { getFirebaseAdminAuth, getFirebaseAdminFirestore } = await import("@/lib/firebase/admin");
  const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
  const document = await getFirebaseAdminFirestore().collection("users").doc(decoded.uid).get();
  if (!document.exists) throw new Error("USER_PROFILE_NOT_FOUND");
  const profile = document.data() ?? {};
  const role = profile.role === "admin" || profile.role === "owner" ? "admin" : "user";
  const legacyOrganizationIds = Array.isArray(profile.organizationIds) ? profile.organizationIds.map(String) : [];
  const organizationId = profile.organizationId
    ? String(profile.organizationId)
    : legacyOrganizationIds[0] ?? null;
  return {
    uid: decoded.uid,
    name: String(profile.name ?? decoded.name ?? decoded.email ?? "Usuario"),
    email: String(profile.email ?? decoded.email ?? ""),
    role,
    organizationId,
    organizationIds: organizationId ? [organizationId] : legacyOrganizationIds,
    projectIds: Array.isArray(profile.projectIds) ? profile.projectIds.map(String) : [],
  };
}

export function assertProjectAccess(user: AppUser, organizationId: string, projectId: string) {
  if (user.role === "admin") return;
  const belongsToOrganization = user.organizationId === organizationId || user.organizationIds.includes(organizationId);
  const projectAllowed = user.projectIds.length === 0 || user.projectIds.includes(projectId);
  if (!belongsToOrganization || !projectAllowed) {
    throw new Error("FORBIDDEN");
  }
}

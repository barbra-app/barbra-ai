import { DEMO_USER, type AppUser } from "@/lib/domain/analytics";
import { verifyFirebaseIdToken } from "@/lib/firebase/id-token";
import { runtimeEnv } from "@/lib/runtime-env";

function bearerToken(request: Request) {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

export async function getRequestUser(request: Request): Promise<AppUser> {
  const token = bearerToken(request);
  const authRequired = runtimeEnv("REQUIRE_FIREBASE_AUTH") === "true";
  if (!token) {
    if (authRequired) throw new Error("UNAUTHENTICATED");
    return DEMO_USER;
  }

  const decoded = await verifyFirebaseIdToken(token);
  const claim = decoded.barbra && typeof decoded.barbra === "object" ? decoded.barbra as Record<string, unknown> : null;
  if (claim) {
    const role = claim.role === "admin" ? "admin" : "user";
    const organizationId = typeof claim.organizationId === "string" ? claim.organizationId : null;
    const projectIds = Array.isArray(claim.projectIds) ? claim.projectIds.map(String) : [];
    return {
      uid: decoded.uid,
      name: String(claim.name ?? decoded.name ?? decoded.email ?? "Usuario"),
      email: String(decoded.email ?? ""),
      role,
      organizationId,
      organizationIds: organizationId ? [organizationId] : [],
      projectIds,
    };
  }
  const { getFirebaseAdminFirestore } = await import("@/lib/firebase/admin");
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

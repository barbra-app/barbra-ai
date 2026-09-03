import type { AppUser } from "@/lib/domain/analytics";
import { verifyFirebaseIdToken } from "@/lib/firebase/id-token";
import { runtimeEnv } from "@/lib/runtime-env";

export function requestBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

export async function getRequestUser(request: Request): Promise<AppUser> {
  const token = requestBearerToken(request);
  if (!token) throw new Error("UNAUTHENTICATED");

  const decoded = await verifyFirebaseIdToken(token);
  // Firestore is the canonical authorization source. Firebase custom claims
  // can remain stale after an administrator changes a user's role or scope,
  // so use them only as a fallback for legacy provisioned accounts.
  const { getFirestoreDocument } = await import("@/lib/firebase/firestore-rest");
  const useServiceAccount = await runtimeEnv("FIRESTORE_USE_SERVICE_ACCOUNT") === "true";
  const document = await getFirestoreDocument("users", decoded.uid, useServiceAccount ? undefined : token);
  if (document.exists) {
    const profile = document.data;
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
  throw new Error("USER_PROFILE_NOT_FOUND");
}

export function assertProjectAccess(user: AppUser, organizationId: string, projectId: string) {
  if (user.role === "admin") return;
  const belongsToOrganization = user.organizationId === organizationId || user.organizationIds.includes(organizationId);
  const projectAllowed = user.projectIds.length === 0 || user.projectIds.includes(projectId);
  if (!belongsToOrganization || !projectAllowed) {
    throw new Error("FORBIDDEN");
  }
}

export function assertAdmin(user: AppUser) {
  if (user.role !== "admin") throw new Error("FORBIDDEN");
}

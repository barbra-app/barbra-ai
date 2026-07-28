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
  return {
    uid: decoded.uid,
    name: String(profile.name ?? decoded.name ?? decoded.email ?? "Usuario"),
    email: String(profile.email ?? decoded.email ?? ""),
    role: profile.role ?? "viewer",
    organizationIds: Array.isArray(profile.organizationIds) ? profile.organizationIds : [],
    projectIds: Array.isArray(profile.projectIds) ? profile.projectIds : [],
  };
}

export function assertProjectAccess(user: AppUser, organizationId: string, projectId: string) {
  if (!user.organizationIds.includes(organizationId) || !user.projectIds.includes(projectId)) {
    throw new Error("FORBIDDEN");
  }
}

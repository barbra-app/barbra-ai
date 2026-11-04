import { runtimeEnv } from "@/lib/runtime-env";
import { googleAccessToken } from "@/lib/google/access-token";

// Talks to the Identity Toolkit admin REST API directly instead of
// firebase-admin — its Auth module pulls in jwks-rsa -> jose, which ships
// ESM-only and breaks Next's Turbopack production build (ERR_REQUIRE_ESM)
// the moment anything imports "firebase-admin/auth". The rest of this app
// already avoids firebase-admin entirely (see firestore-rest.ts,
// storage-rest.ts) for the same Workers/edge-compatibility reasons.

async function accessToken() {
  let raw = await runtimeEnv("FIREBASE_SERVICE_ACCOUNT_JSON");
  const file = await runtimeEnv("FIREBASE_SERVICE_ACCOUNT_FILE");
  if (!raw && file) {
    const { readFile } = await import("node:fs/promises");
    raw = await readFile(file, "utf8");
  }
  return googleAccessToken("https://www.googleapis.com/auth/identitytoolkit", raw);
}

async function projectId() {
  return (await runtimeEnv("FIREBASE_PROJECT_ID")) ?? (await runtimeEnv("GCP_PROJECT_ID"));
}

async function identityToolkitRequest(path: string, body: Record<string, unknown>) {
  const [token, project] = await Promise.all([accessToken(), projectId()]);
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as { error?: { message?: string } } & Record<string, unknown>;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `IDENTITY_TOOLKIT_REQUEST_FAILED_${response.status}`);
  }
  return payload;
}

export async function createFirebaseUser(options: { email: string; displayName: string }): Promise<{ uid: string }> {
  try {
    const payload = await identityToolkitRequest("", {
      email: options.email,
      displayName: options.displayName,
      emailVerified: false,
    });
    return { uid: String(payload.localId) };
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_EXISTS") {
      throw new Error("auth/email-already-exists");
    }
    throw error;
  }
}

export async function updateFirebaseUserDisplayName(uid: string, displayName: string): Promise<void> {
  try {
    await identityToolkitRequest(":update", { localId: uid, displayName });
  } catch (error) {
    if (error instanceof Error && error.message === "USER_NOT_FOUND") {
      throw new Error("auth/user-not-found");
    }
    throw error;
  }
}

export async function deleteFirebaseUser(uid: string): Promise<void> {
  try {
    await identityToolkitRequest(":delete", { localId: uid });
  } catch (error) {
    if (error instanceof Error && error.message === "USER_NOT_FOUND") {
      throw new Error("auth/user-not-found");
    }
    throw error;
  }
}

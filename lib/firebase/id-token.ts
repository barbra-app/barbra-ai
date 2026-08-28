import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { runtimeEnv } from "@/lib/runtime-env";

const GOOGLE_SECURE_TOKEN_KEYS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

export type FirebaseIdToken = JWTPayload & {
  uid: string;
  email?: string;
  name?: string;
  barbra?: Record<string, unknown>;
};

export async function verifyFirebaseIdToken(token: string): Promise<FirebaseIdToken> {
  const projectId = (await runtimeEnv("FIREBASE_PROJECT_ID")) ?? (await runtimeEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"));
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID_MISSING");

  const { payload } = await jwtVerify(token, GOOGLE_SECURE_TOKEN_KEYS, {
    algorithms: ["RS256"],
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });
  if (!payload.sub || typeof payload.sub !== "string") throw new Error("INVALID_FIREBASE_TOKEN");

  return { ...payload, uid: payload.sub } as FirebaseIdToken;
}

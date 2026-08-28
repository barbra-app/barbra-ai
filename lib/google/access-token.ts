import { importPKCS8, SignJWT } from "jose";
import { runtimeEnv } from "@/lib/runtime-env";

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

async function parseServiceAccount(raw: string): Promise<ServiceAccount> {
  let normalized = raw.trim();
  if (normalized.startsWith("{")) return JSON.parse(normalized) as ServiceAccount;
  if (normalized.startsWith('"')) normalized = JSON.parse(normalized) as string;
  if (!normalized.includes("-----BEGIN")) {
    try {
      const decoded = atob(normalized.replace(/\s/g, ""));
      if (decoded.trim().startsWith("{")) return JSON.parse(decoded) as ServiceAccount;
      normalized = decoded;
    } catch {
      // Leave the original value in place so the format check below produces
      // a safe, actionable error without logging credential contents.
    }
  }
  let privateKey = normalized;
  if (privateKey.startsWith('"')) {
    privateKey = JSON.parse(privateKey) as string;
  }
  privateKey = privateKey.replace(/\\n/g, "\n");
  const pem = privateKey.match(/-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/)?.[0] ?? privateKey;
  if (!pem.startsWith("-----BEGIN PRIVATE KEY-----")) {
    throw new Error(`GOOGLE_PRIVATE_KEY_FORMAT_INVALID_LENGTH_${pem.length}`);
  }
  return {
    client_email: (await runtimeEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL")) ?? "",
    private_key: pem,
  };
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function googleAccessToken(scope: string, credentialsJson?: string) {
  const cached = tokenCache.get(scope);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  if (!credentialsJson) {
    const explicitToken = await runtimeEnv("GOOGLE_API_ACCESS_TOKEN");
    if (!explicitToken) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON_MISSING");
    tokenCache.set(scope, { token: explicitToken, expiresAt: Date.now() + 45 * 60 * 1000 });
    return explicitToken;
  }
  const account = await parseServiceAccount(credentialsJson);
  if (!account.client_email || !account.private_key) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON_INVALID");
  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(account.private_key, "RS256");
  const assertion = await new SignJWT({ scope })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) throw new Error(`GOOGLE_TOKEN_FAILED_${response.status}`);
  const payload = await response.json() as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error("GOOGLE_TOKEN_MISSING");
  tokenCache.set(scope, { token: payload.access_token, expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000 });
  return payload.access_token;
}

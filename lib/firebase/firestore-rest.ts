import { runtimeEnv } from "@/lib/runtime-env";
import { googleAccessToken } from "@/lib/google/access-token";

export interface FirestoreDocument {
  id: string;
  exists: boolean;
  data: Record<string, unknown>;
}

async function accessToken() {
  let raw = await runtimeEnv("FIREBASE_SERVICE_ACCOUNT_JSON");
  const file = await runtimeEnv("FIREBASE_SERVICE_ACCOUNT_FILE");
  if (!raw && file) {
    const { readFile } = await import("node:fs/promises");
    raw = await readFile(file, "utf8");
  }
  return googleAccessToken("https://www.googleapis.com/auth/datastore", raw);
}

async function baseUrl() {
  const projectId = (await runtimeEnv("FIREBASE_PROJECT_ID")) ?? (await runtimeEnv("GCP_PROJECT_ID"));
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID_MISSING");
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

function decodeValue(value: Record<string, unknown>): unknown {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) {
    const values = (value.arrayValue as { values?: Record<string, unknown>[] }).values ?? [];
    return values.map(decodeValue);
  }
  if ("mapValue" in value) {
    return decodeFields((value.mapValue as { fields?: Record<string, Record<string, unknown>> }).fields ?? {});
  }
  return undefined;
}

function decodeFields(fields: Record<string, Record<string, unknown>>) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

function decodeDocument(document?: { name?: string; fields?: Record<string, Record<string, unknown>> }): FirestoreDocument {
  return {
    id: document?.name?.split("/").pop() ?? "",
    exists: Boolean(document?.name),
    data: decodeFields(document?.fields ?? {}),
  };
}

function encodeValue(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === "object") return { mapValue: { fields: encodeFields(value as Record<string, unknown>) } };
  return { stringValue: String(value) };
}

function encodeFields(data: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeValue(value)]));
}

async function authorizedFetch(url: string, init?: RequestInit, firebaseIdToken?: string) {
  const token = firebaseIdToken ?? await accessToken();
  const response = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init?.headers },
  });
  return response;
}

export async function getFirestoreDocument(collection: string, id: string, firebaseIdToken?: string) {
  const response = await authorizedFetch(`${await baseUrl()}/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, undefined, firebaseIdToken);
  if (response.status === 404) return decodeDocument();
  if (!response.ok) throw new Error(`FIRESTORE_GET_FAILED_${response.status}`);
  return decodeDocument(await response.json());
}

export async function listFirestoreDocuments(collection: string, firebaseIdToken?: string) {
  const documents: FirestoreDocument[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${await baseUrl()}/${encodeURIComponent(collection)}`);
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await authorizedFetch(url.toString(), undefined, firebaseIdToken);
    if (!response.ok) throw new Error(`FIRESTORE_LIST_FAILED_${response.status}`);
    const payload = await response.json() as { documents?: Parameters<typeof decodeDocument>[0][]; nextPageToken?: string };
    documents.push(...(payload.documents ?? []).map(decodeDocument));
    pageToken = payload.nextPageToken;
  } while (pageToken);
  return documents;
}

export async function createFirestoreDocument(collection: string, data: Record<string, unknown>, firebaseIdToken?: string) {
  const response = await authorizedFetch(`${await baseUrl()}/${encodeURIComponent(collection)}`, {
    method: "POST",
    body: JSON.stringify({ fields: encodeFields(data) }),
  }, firebaseIdToken);
  if (!response.ok) throw new Error(`FIRESTORE_CREATE_FAILED_${response.status}`);
  return decodeDocument(await response.json());
}

export async function updateFirestoreDocument(collection: string, id: string, data: Record<string, unknown>, firebaseIdToken?: string) {
  const url = new URL(`${await baseUrl()}/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`);
  // updateMask limits the write to exactly these fields — every other field
  // on the existing document is left untouched (a plain PATCH would replace
  // the whole document with just the fields sent).
  for (const key of Object.keys(data)) url.searchParams.append("updateMask.fieldPaths", key);
  const response = await authorizedFetch(url.toString(), {
    method: "PATCH",
    body: JSON.stringify({ fields: encodeFields(data) }),
  }, firebaseIdToken);
  if (!response.ok) throw new Error(`FIRESTORE_UPDATE_FAILED_${response.status}`);
  return decodeDocument(await response.json());
}

export async function queryFirestoreDocuments(collection: string, field: string, stringValue: string, firebaseIdToken?: string) {
  const root = (await baseUrl()).replace(/\/documents$/, "");
  const response = await authorizedFetch(`${root}/documents:runQuery`, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue } } },
      },
    }),
  }, firebaseIdToken);
  if (!response.ok) throw new Error(`FIRESTORE_QUERY_FAILED_${response.status}`);
  const rows = await response.json() as { document?: Parameters<typeof decodeDocument>[0] }[];
  return rows.flatMap((row) => row.document ? [decodeDocument(row.document)] : []);
}

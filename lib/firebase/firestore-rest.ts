import { runtimeEnv } from "@/lib/runtime-env";
import { googleAccessToken } from "@/lib/google/access-token";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

export interface FirestoreDocument {
  id: string;
  exists: boolean;
  data: Record<string, unknown>;
}

async function serviceAccount() {
  const raw = await runtimeEnv("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!raw) return null;
  const account = JSON.parse(raw) as ServiceAccount;
  if (!account.client_email || !account.private_key) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON_INVALID");
  return account;
}

async function accessToken() {
  const raw = await runtimeEnv("FIREBASE_SERVICE_ACCOUNT_JSON");
  return googleAccessToken("https://www.googleapis.com/auth/datastore", raw);
}

async function baseUrl() {
  const account = await serviceAccount();
  const projectId = (await runtimeEnv("FIREBASE_PROJECT_ID")) ?? account?.project_id ?? (await runtimeEnv("GCP_PROJECT_ID"));
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

async function authorizedFetch(url: string, init?: RequestInit) {
  const token = await accessToken();
  const response = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init?.headers },
  });
  return response;
}

export async function getFirestoreDocument(collection: string, id: string) {
  const response = await authorizedFetch(`${await baseUrl()}/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`);
  if (response.status === 404) return decodeDocument();
  if (!response.ok) throw new Error(`FIRESTORE_GET_FAILED_${response.status}`);
  return decodeDocument(await response.json());
}

export async function listFirestoreDocuments(collection: string) {
  const documents: FirestoreDocument[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${await baseUrl()}/${encodeURIComponent(collection)}`);
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await authorizedFetch(url.toString());
    if (!response.ok) throw new Error(`FIRESTORE_LIST_FAILED_${response.status}`);
    const payload = await response.json() as { documents?: Parameters<typeof decodeDocument>[0][]; nextPageToken?: string };
    documents.push(...(payload.documents ?? []).map(decodeDocument));
    pageToken = payload.nextPageToken;
  } while (pageToken);
  return documents;
}

export async function queryFirestoreDocuments(collection: string, field: string, stringValue: string) {
  const root = (await baseUrl()).replace(/\/documents$/, "");
  const response = await authorizedFetch(`${root}/documents:runQuery`, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue } } },
      },
    }),
  });
  if (!response.ok) throw new Error(`FIRESTORE_QUERY_FAILED_${response.status}`);
  const rows = await response.json() as { document?: Parameters<typeof decodeDocument>[0] }[];
  return rows.flatMap((row) => row.document ? [decodeDocument(row.document)] : []);
}

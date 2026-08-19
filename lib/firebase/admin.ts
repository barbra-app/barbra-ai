import { cert, getApp, getApps, initializeApp, type AppOptions } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { runtimeEnv } from "@/lib/runtime-env";

async function credential() {
  const json = await runtimeEnv("FIREBASE_SERVICE_ACCOUNT_JSON");
  return json ? cert(JSON.parse(json)) : undefined;
}

export async function getFirebaseAdminApp() {
  if (getApps().length) return getApp();
  const options: AppOptions = {
    projectId: (await runtimeEnv("FIREBASE_PROJECT_ID")) ?? (await runtimeEnv("GCP_PROJECT_ID")),
  };
  const adminCredential = await credential();
  if (adminCredential) options.credential = adminCredential;
  return initializeApp(options);
}

export async function getFirebaseAdminAuth() {
  return getAuth(await getFirebaseAdminApp());
}

export async function getFirebaseAdminFirestore() {
  return getFirestore(await getFirebaseAdminApp());
}

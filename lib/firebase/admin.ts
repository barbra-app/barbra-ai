import { cert, getApp, getApps, initializeApp, type AppOptions } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function credential() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  return json ? cert(JSON.parse(json)) : undefined;
}

export function getFirebaseAdminApp() {
  if (getApps().length) return getApp();
  const options: AppOptions = {
    projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.GCP_PROJECT_ID,
  };
  const adminCredential = credential();
  if (adminCredential) options.credential = adminCredential;
  return initializeApp(options);
}

export function getFirebaseAdminAuth() {
  return getAuth(getFirebaseAdminApp());
}

export function getFirebaseAdminFirestore() {
  return getFirestore(getFirebaseAdminApp());
}

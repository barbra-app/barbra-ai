import { applicationDefault, cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function credential() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) return applicationDefault();
  return cert(JSON.parse(json));
}

export function getFirebaseAdminApp() {
  if (getApps().length) return getApp();
  return initializeApp({
    credential: credential(),
    projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.GCP_PROJECT_ID,
  });
}

export function getFirebaseAdminAuth() {
  return getAuth(getFirebaseAdminApp());
}

export function getFirebaseAdminFirestore() {
  return getFirestore(getFirebaseAdminApp());
}

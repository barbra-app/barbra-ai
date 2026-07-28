import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

function config() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

export function isFirebaseClientConfigured() {
  const value = config();
  return Boolean(value.apiKey && value.authDomain && value.projectId && value.appId);
}

export function isFirebaseAuthEnabled() {
  return isFirebaseClientConfigured() && process.env.NEXT_PUBLIC_ENABLE_FIREBASE_AUTH === "true";
}

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseClientConfigured()) {
    throw new Error("Firebase client environment variables are not configured");
  }
  return getApps().length ? getApp() : initializeApp(config());
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

export function getFirebaseFirestore(): Firestore {
  return getFirestore(getFirebaseApp());
}

export async function getFirebaseIdToken() {
  if (!isFirebaseAuthEnabled()) return null;
  return getFirebaseAuth().currentUser?.getIdToken() ?? null;
}

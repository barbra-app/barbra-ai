import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

function config() {
  return {
    // Firebase web configuration is public by design. These project defaults
    // keep authentication available in static/edge builds where NEXT_PUBLIC
    // variables cannot be injected after compilation.
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyAxjF8mwzUJbSWLty-KkonVEXJxxr2JrAs",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "barbra-intelligence-69fe6.firebaseapp.com",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "barbra-intelligence-69fe6",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "barbra-intelligence-69fe6.firebasestorage.app",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "884904373436",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "1:884904373436:web:3c73cc3e89a43a4379b4b9",
  };
}

export function isFirebaseClientConfigured() {
  const value = config();
  return Boolean(value.apiKey && value.authDomain && value.projectId && value.appId);
}

export function isFirebaseAuthEnabled() {
  return isFirebaseClientConfigured() && process.env.NEXT_PUBLIC_ENABLE_FIREBASE_AUTH !== "false";
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

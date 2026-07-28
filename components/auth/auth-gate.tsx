"use client";

import { useEffect, useState, type ReactNode } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, type User } from "firebase/auth";
import { ArrowRight, LoaderCircle, ShieldCheck } from "lucide-react";
import { Spark } from "@/components/layout/brand-mark";
import { getFirebaseAuth, isFirebaseAuthEnabled } from "@/lib/firebase/client";

export function AuthGate({ children }: { children: ReactNode }) {
  const configured = isFirebaseAuthEnabled();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!configured);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) return;
    return onAuthStateChanged(getFirebaseAuth(), (nextUser) => {
      setUser(nextUser);
      setReady(true);
    });
  }, [configured]);

  if (!ready) {
    return <div className="auth-loading"><LoaderCircle className="size-5 animate-spin" /> Preparando tu workspace…</div>;
  }

  if (!configured || user) return children;

  async function login() {
    setSigningIn(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(getFirebaseAuth(), provider);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No fue posible iniciar sesión");
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <span className="auth-mark"><Spark className="size-7" /></span>
        <span className="auth-kicker"><ShieldCheck className="size-3.5" /> Acceso seguro</span>
        <h1>Tu inteligencia de medios, en un solo lugar.</h1>
        <p>Ingresa con tu cuenta autorizada para ver únicamente las organizaciones, proyectos y campañas que te corresponden.</p>
        <button onClick={login} disabled={signingIn}>
          {signingIn ? <LoaderCircle className="size-4 animate-spin" /> : <span className="google-dot">G</span>}
          Continuar con Google
          {!signingIn && <ArrowRight className="size-4" />}
        </button>
        {error && <small>{error}</small>}
      </section>
    </main>
  );
}

"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, type User } from "firebase/auth";
import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import { IntelligenceDashboardSkeleton } from "@/components/dashboard/intelligence-dashboard-skeleton";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { getFirebaseAuth, isFirebaseAuthEnabled } from "@/lib/firebase/client";

type LoginMethod = "email" | null;

export function AuthGate({ children }: { children: ReactNode }) {
  const configured = isFirebaseAuthEnabled();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!configured);

  useEffect(() => {
    if (!configured) return;
    return onAuthStateChanged(getFirebaseAuth(), (nextUser) => {
      setUser(nextUser);
      setReady(true);
    });
  }, [configured]);

  if (!ready) {
    return <IntelligenceDashboardSkeleton />;
  }

  if (!configured || user) return children;

  return <LoginScreen />;
}

function LoginScreen() {
  const [method, setMethod] = useState<LoginMethod>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loginWithEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) return;
    setMethod("email");
    setError(null);
    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
    } catch (reason) {
      setError(authError(reason));
    } finally {
      setMethod(null);
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-theme-toggle"><ThemeToggle /></div>
      <section className="auth-card" aria-labelledby="auth-title">
        <img className="auth-logo" src="/barbra-logo.png" width="158" height="25" alt="Barbra" />
        <span className="auth-kicker"><LockKeyhole className="size-3.5" /> Acceso privado</span>
        <h1 id="auth-title">Barbra Intelligence</h1>
        <p>Ingresa para consultar únicamente las organizaciones, proyectos y campañas asignadas a tu perfil.</p>

        <form className="auth-form" onSubmit={loginWithEmail}>
          <label className="auth-field" htmlFor="auth-email">
            <span>Correo</span>
            <input id="auth-email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(null); }} aria-invalid={Boolean(error)} disabled={method !== null} required />
          </label>
          <label className="auth-field" htmlFor="auth-password">
            <span>Contraseña</span>
            <input id="auth-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setError(null); }} aria-invalid={Boolean(error)} disabled={method !== null} required />
          </label>
          <button className="auth-submit" type="submit" disabled={method !== null || !email.trim() || !password}>
            {method === "email" ? <LoaderCircle className="size-4 animate-spin" /> : <span />}
            Ingresar
            {method !== "email" && <ArrowRight className="size-4" />}
          </button>
        </form>

        <small className={error ? "auth-error" : "auth-helper"} aria-live="polite">{error ?? "Usa una cuenta autorizada por Barbra."}</small>
      </section>
    </main>
  );
}

function authError(reason: unknown) {
  const code = reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "Correo o contraseña incorrectos.";
  if (code.includes("too-many-requests")) return "Demasiados intentos. Intenta nuevamente más tarde.";
  return "No fue posible iniciar sesión. Intenta nuevamente.";
}

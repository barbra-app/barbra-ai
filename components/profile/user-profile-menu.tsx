"use client";

import { useEffect, useRef } from "react";
import { Building2, Check, LogOut, ShieldCheck, UserRound, X } from "lucide-react";
import type { AppUser } from "@/lib/domain/analytics";
import { getFirebaseAuth, isFirebaseAuthEnabled } from "@/lib/firebase/client";

interface UserProfileMenuProps {
  user: AppUser;
  organizationName?: string;
  organizationCount: number;
  projectCount: number;
  campaignCount: number;
}

export function UserProfileMenu({ user, organizationName, organizationCount, projectCount, campaignCount }: UserProfileMenuProps) {
  const rootRef = useRef<HTMLDetailsElement>(null);
  const initials = user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const admin = user.role === "admin";

  useEffect(() => {
    function closeOnPointer(event: PointerEvent) {
      if (rootRef.current?.open && !rootRef.current.contains(event.target as Node)) rootRef.current.removeAttribute("open");
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") rootRef.current?.removeAttribute("open");
    }
    document.addEventListener("pointerdown", closeOnPointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  async function signOut() {
    if (!isFirebaseAuthEnabled()) return;
    await getFirebaseAuth().signOut();
    rootRef.current?.removeAttribute("open");
  }

  return (
    <details className="profile-menu-root" ref={rootRef}>
      <summary
        className="user-avatar"
        aria-label={`Abrir perfil de ${user.name}`}
        aria-controls="user-profile-panel"
      >
        {initials}
      </summary>

      <section className="profile-panel" id="user-profile-panel" aria-label="Perfil de usuario">
          <header className="profile-header">
            <div className="profile-identity">
              <span className="profile-avatar">{initials}</span>
              <div><strong>{user.name}</strong><span>{user.email || "Cuenta Barbra"}</span></div>
            </div>
            <button onClick={() => rootRef.current?.removeAttribute("open")} aria-label="Cerrar perfil"><X className="size-4" /></button>
          </header>

          <div className="profile-role">
            <span>{admin ? <ShieldCheck className="size-4" /> : <UserRound className="size-4" />}</span>
            <div>
              <strong>{admin ? "Administrador" : "Usuario"}</strong>
              <p>{admin ? "Acceso global a Barbra Intelligence" : `Acceso asignado a ${organizationName ?? "tu organización"}`}</p>
            </div>
            <Check className="size-4" />
          </div>

          <div className="profile-access">
            <div><Building2 className="size-4" /><span>{admin ? `${organizationCount} organizaciones` : organizationName ?? "Organización asignada"}</span></div>
            <dl>
              <div><dt>Proyectos</dt><dd>{projectCount}</dd></div>
              <div><dt>Campañas</dt><dd>{campaignCount}</dd></div>
            </dl>
          </div>

          {isFirebaseAuthEnabled() ? (
            <button className="profile-signout" onClick={signOut}><LogOut className="size-4" />Cerrar sesión</button>
          ) : (
            <p className="profile-demo-note">Perfil de demostración</p>
          )}
      </section>
    </details>
  );
}

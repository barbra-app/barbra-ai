"use client";

import { useEffect, useRef, useState } from "react";
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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const initials = user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const admin = user.role === "admin";

  useEffect(() => {
    if (!open) return;
    function closeOnPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnPointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  async function signOut() {
    if (!isFirebaseAuthEnabled()) return;
    await getFirebaseAuth().signOut();
    setOpen(false);
  }

  return (
    <div className="profile-menu-root" ref={rootRef}>
      <button
        className="user-avatar"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Abrir perfil de ${user.name}`}
        aria-expanded={open}
        aria-controls="user-profile-panel"
      >
        {initials}
      </button>

      {open && (
        <section className="profile-panel" id="user-profile-panel" aria-label="Perfil de usuario">
          <header className="profile-header">
            <div className="profile-identity">
              <span className="profile-avatar">{initials}</span>
              <div><strong>{user.name}</strong><span>{user.email || "Cuenta Barbra"}</span></div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Cerrar perfil"><X className="size-4" /></button>
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
      )}
    </div>
  );
}

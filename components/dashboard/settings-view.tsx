"use client";

import { useState } from "react";
import { Building2, Users } from "lucide-react";
import type { AppUser, Organization } from "@/lib/domain/analytics";
import { OrganizationsPanel } from "./organizations-panel";
import { UserManagementPanel } from "./user-management-panel";

type SettingsTab = "users" | "organizations";

const TABS: { id: SettingsTab; label: string; icon: typeof Users }[] = [
  { id: "users", label: "Gestión de usuarios", icon: Users },
  { id: "organizations", label: "Organizaciones", icon: Building2 },
];

export function SettingsView({
  organizations,
  currentUser,
  onOrganizationUpdated,
}: {
  organizations: Organization[];
  currentUser: AppUser;
  onOrganizationUpdated: (organization: Organization) => void;
}) {
  const [tab, setTab] = useState<SettingsTab>("users");

  return (
    <div className="settings-view">
      <aside className="settings-sidebar" aria-label="Secciones de ajustes">
        <h1>Ajustes</h1>
        <nav>
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "active" : ""}
              onClick={() => setTab(item.id)}
            >
              <item.icon className="size-4" />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <section className="settings-content">
        {tab === "users" && <UserManagementPanel organizations={organizations} currentUser={currentUser} />}
        {tab === "organizations" && <OrganizationsPanel organizations={organizations} onOrganizationUpdated={onOrganizationUpdated} />}
      </section>
    </div>
  );
}

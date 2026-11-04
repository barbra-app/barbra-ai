"use client";

import { useState } from "react";
import type { Organization } from "@/lib/domain/analytics";
import { getFirebaseIdToken } from "@/lib/firebase/client";
import { AvatarPhotoField } from "./avatar-photo-field";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function validatePhoto(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "La foto debe ser JPG, PNG o WEBP";
  if (file.size > MAX_PHOTO_BYTES) return "La foto no puede pesar más de 5MB";
  return null;
}

export function OrganizationsPanel({
  organizations,
  onOrganizationUpdated,
}: {
  organizations: Organization[];
  onOrganizationUpdated: (organization: Organization) => void;
}) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function uploadLogo(organization: Organization, file: File | undefined) {
    if (!file) return;
    const issue = validatePhoto(file);
    if (issue) {
      setError(issue);
      return;
    }
    setSavingId(organization.id);
    setError(null);
    try {
      const token = await getFirebaseIdToken();
      const body = new FormData();
      body.set("id", organization.id);
      body.set("photo", file);
      const response = await fetch("/api/organizations", {
        method: "PATCH",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No fue posible actualizar el logo");
      onOrganizationUpdated({ ...organization, photoUrl: payload.data.photoUrl });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="user-management-panel">
      <header className="user-management-heading">
        <div>
          <h2>Organizaciones</h2>
          <p>Sube el logo que verán los usuarios cliente de cada organización.</p>
        </div>
      </header>

      {error && <small className="auth-error" aria-live="polite">{error}</small>}

      {organizations.length === 0 ? (
        <p className="user-management-empty">No hay organizaciones creadas.</p>
      ) : (
        <table className="user-management-table">
          <thead>
            <tr>
              <th aria-hidden="true" />
              <th>Organización</th>
            </tr>
          </thead>
          <tbody>
            {organizations.map((organization) => (
              <tr key={organization.id}>
                <td>
                  <AvatarPhotoField
                    label={`Logo de ${organization.name}`}
                    currentUrl={organization.photoUrl}
                    onFileChange={(file) => uploadLogo(organization, file)}
                  />
                </td>
                <td>
                  <div className="user-management-identity">
                    <strong>{organization.name}</strong>
                    <span>{savingId === organization.id ? "Subiendo…" : organization.slug}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

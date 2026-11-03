"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { Pencil, Plus, X } from "lucide-react";
import type { AppUser, Organization } from "@/lib/domain/analytics";
import { getFirebaseAuth, getFirebaseIdToken } from "@/lib/firebase/client";
import { useConfirmDialog } from "./confirm-dialog";
import { LabeledSelect } from "./labeled-select";

interface ManagedUser {
  uid: string;
  name: string;
  email: string;
  role: "admin" | "user";
  organizationId: string | null;
}

const ROLE_OPTIONS = [
  { value: "admin", label: "Administrador" },
  { value: "user", label: "Cliente" },
];

export function UserManagementPanel({
  organizations,
  currentUser,
}: {
  organizations: Organization[];
  currentUser: AppUser;
}) {
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingUid, setSavingUid] = useState<string | null>(null);

  const createDialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdNotice, setCreatedNotice] = useState<string | null>(null);

  const editDialogRef = useRef<HTMLDialogElement>(null);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const { confirm, element: confirmDialog } = useConfirmDialog();

  async function load() {
    setLoadError(null);
    try {
      const token = await getFirebaseIdToken();
      const response = await fetch("/api/users", { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No fue posible cargar los usuarios");
      setUsers(payload.data);
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  useEffect(() => { load(); }, []);

  function organizationName(id: string | null) {
    if (!id) return "Todas";
    return organizations.find((org) => org.id === id)?.name ?? id;
  }

  function openCreateDialog() {
    setCreateError(null);
    setCreatedNotice(null);
    createDialogRef.current?.showModal();
  }

  async function createUser(event: FormEvent) {
    event.preventDefault();
    if (role === "user" && !organizationId) {
      setCreateError("Selecciona una organización");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const token = await getFirebaseIdToken();
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ name, email, role, organizationId: role === "user" ? organizationId : undefined }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No fue posible crear el usuario");
      const created = payload.data as ManagedUser;
      setUsers((current) => [...(current ?? []), created].sort((a, b) => a.email.localeCompare(b.email)));
      createDialogRef.current?.close();
      try {
        await sendPasswordResetEmail(getFirebaseAuth(), email);
        setCreatedNotice(`Usuario creado. Se envió un correo a ${email} para que defina su contraseña.`);
      } catch {
        setCreatedNotice(`Usuario creado, pero no se pudo enviar el correo automáticamente — pídele que use "Olvidé mi contraseña" en el login con ${email}.`);
      }
      setName("");
      setEmail("");
      setRole("user");
    } catch (reason) {
      setCreateError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setCreating(false);
    }
  }

  async function updateUser(uid: string, patch: { name?: string; role: "admin" | "user"; organizationId: string | null }) {
    setSavingUid(uid);
    setLoadError(null);
    try {
      const token = await getFirebaseIdToken();
      const response = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          uid,
          ...(patch.name ? { name: patch.name } : {}),
          role: patch.role,
          organizationId: patch.role === "user" ? patch.organizationId ?? undefined : undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No fue posible actualizar el usuario");
      const updated = payload.data as ManagedUser;
      setUsers((current) => (current ?? []).map((item) => (item.uid === uid ? updated : item)));
      return updated;
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : String(reason));
      throw reason;
    } finally {
      setSavingUid(null);
    }
  }

  function openEditDialog(managedUser: ManagedUser) {
    setEditingUser(managedUser);
    setEditName(managedUser.name);
    setEditError(null);
    editDialogRef.current?.showModal();
  }

  async function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingUser) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      await updateUser(editingUser.uid, { name: editName, role: editingUser.role, organizationId: editingUser.organizationId });
      editDialogRef.current?.close();
    } catch (reason) {
      setEditError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setEditSubmitting(false);
    }
  }

  async function removeUser(managedUser: ManagedUser) {
    const confirmed = await confirm(`¿Borrar a "${managedUser.name || managedUser.email}"? Esta acción no se puede deshacer.`, "Borrar usuario");
    if (!confirmed) return;
    setSavingUid(managedUser.uid);
    setLoadError(null);
    try {
      const token = await getFirebaseIdToken();
      const response = await fetch(`/api/users?uid=${encodeURIComponent(managedUser.uid)}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No fue posible borrar el usuario");
      setUsers((current) => (current ?? []).filter((item) => item.uid !== managedUser.uid));
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSavingUid(null);
    }
  }

  return (
    <div className="user-management-panel">
      {confirmDialog}
      <header className="user-management-heading">
        <div>
          <h2>Gestión de usuarios</h2>
          <p>Crea cuentas, asigna organizaciones y controla quién tiene acceso administrativo.</p>
        </div>
        <button type="button" className="user-management-create-button" onClick={openCreateDialog}>
          <Plus className="size-4" />Crear usuario
        </button>
      </header>

      {loadError && <small className="auth-error" aria-live="polite">{loadError}</small>}
      {createdNotice && <small className="user-management-notice" aria-live="polite">{createdNotice}</small>}

      {users === null && !loadError && <p className="user-management-empty">Cargando usuarios…</p>}
      {users?.length === 0 && <p className="user-management-empty">No hay usuarios creados.</p>}

      {users && users.length > 0 && (
        <table className="user-management-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Organización</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {users.map((item) => (
              <tr key={item.uid}>
                <td>
                  <div className="user-management-identity">
                    <strong>{item.name || item.email}</strong>
                    <span>{item.email}</span>
                  </div>
                </td>
                <td>
                  <LabeledSelect
                    label="Rol"
                    hideLabel
                    value={item.role}
                    onChange={(value) => updateUser(item.uid, {
                      role: value as "admin" | "user",
                      organizationId: value === "admin" ? null : item.organizationId ?? organizations[0]?.id ?? null,
                    })}
                    options={ROLE_OPTIONS}
                    disabled={savingUid === item.uid || item.uid === currentUser.uid}
                  />
                </td>
                <td>
                  {item.role === "user" ? (
                    <LabeledSelect
                      label="Organización"
                      hideLabel
                      value={item.organizationId ?? ""}
                      onChange={(value) => updateUser(item.uid, { role: "user", organizationId: value })}
                      options={organizations.map((org) => ({ value: org.id, label: org.name }))}
                      disabled={savingUid === item.uid}
                    />
                  ) : (
                    <span className="user-management-org-placeholder">{organizationName(item.organizationId)}</span>
                  )}
                </td>
                <td>
                  <div className="user-management-row-actions">
                    <button
                      type="button"
                      className="user-management-edit"
                      onClick={() => openEditDialog(item)}
                      disabled={savingUid === item.uid}
                      aria-label={`Editar a ${item.name || item.email}`}
                    >
                      <Pencil className="size-3.5" />Editar
                    </button>
                    <button
                      type="button"
                      className="user-management-delete"
                      onClick={() => removeUser(item)}
                      disabled={savingUid === item.uid || item.uid === currentUser.uid}
                      aria-label={`Borrar a ${item.name || item.email}`}
                      title={item.uid === currentUser.uid ? "No puedes borrar tu propia cuenta" : "Borrar usuario"}
                    >
                      Borrar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <dialog
        ref={createDialogRef}
        className="event-dialog"
        aria-labelledby="create-user-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) createDialogRef.current?.close();
        }}
      >
        <div className="event-dialog-heading">
          <h2 id="create-user-title">Crear usuario</h2>
          <button type="button" aria-label="Cerrar" onClick={() => createDialogRef.current?.close()}><X className="size-4" /></button>
        </div>
        <form className="auth-field user-management-form" onSubmit={createUser}>
          <div className="identity-row">
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre" required />
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="correo@dominio.com" required />
          </div>
          <div className="identity-row identity-row-after-select">
            <LabeledSelect label="Rol" value={role} onChange={(value) => setRole(value as "admin" | "user")} options={ROLE_OPTIONS} />
            {role === "user" && (
              <LabeledSelect
                label="Organización"
                value={organizationId}
                onChange={setOrganizationId}
                options={organizations.map((org) => ({ value: org.id, label: org.name }))}
              />
            )}
          </div>
          <button className="auth-submit" type="submit" disabled={creating || !name.trim() || !email.trim()}>
            {creating ? "Creando…" : "Crear usuario"}
          </button>
          {createError && <small className="auth-error" aria-live="polite">{createError}</small>}
        </form>
      </dialog>

      <dialog
        ref={editDialogRef}
        className="event-dialog"
        aria-labelledby="edit-user-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) editDialogRef.current?.close();
        }}
      >
        <div className="event-dialog-heading">
          <h2 id="edit-user-title">Editar usuario</h2>
          <button type="button" aria-label="Cerrar" onClick={() => editDialogRef.current?.close()}><X className="size-4" /></button>
        </div>
        <form className="auth-field user-management-form" onSubmit={submitEdit}>
          <input value={editName} onChange={(event) => setEditName(event.target.value)} placeholder="Nombre" required />
          <button className="auth-submit" type="submit" disabled={editSubmitting || !editName.trim()}>
            {editSubmitting ? "Guardando…" : "Guardar cambios"}
          </button>
          {editError && <small className="auth-error" aria-live="polite">{editError}</small>}
        </form>
      </dialog>
    </div>
  );
}

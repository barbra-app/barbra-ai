"use client";

import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { ConcertManualSource } from "@/lib/domain/analytics";
import { getFirebaseIdToken } from "@/lib/firebase/client";
import { useConfirmDialog } from "./confirm-dialog";

type FieldKey = "impressions" | "clicks" | "conversions" | "ctr" | "billedSpend";

const NUMBER_FIELDS: { key: FieldKey; label: string; placeholder: string }[] = [
  { key: "impressions", label: "Impresiones", placeholder: "Ej. 120.000" },
  { key: "clicks", label: "Clics", placeholder: "Ej. 3.500" },
  { key: "conversions", label: "Conversiones", placeholder: "Ej. 12" },
  { key: "ctr", label: "CTR (%)", placeholder: "Se calcula si lo dejas vacío" },
  { key: "billedSpend", label: "Gasto", placeholder: "Ej. 1.500.000" },
];

const EMPTY_VALUES: Record<FieldKey, string> = { impressions: "", clicks: "", conversions: "", ctr: "", billedSpend: "" };

// Reports arrive written in Colombian format ("1.500.000", "$ 2.350.917"),
// so dots are thousand separators and a comma is the decimal mark.
function parseAmount(value: string) {
  const cleaned = value.replace(/[$\s]/g, "").replace(/\./g, "").replace(",", ".");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

// CTR is typed as a percentage ("1,3" or "1.3", with or without "%").
function parsePercent(value: string) {
  const cleaned = value.replace(/[%\s]/g, "").replace(",", ".");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed / 100 : Number.NaN;
}

function formatInput(value: number | null, percent = false) {
  if (value === null) return "";
  return percent
    ? String(Math.round(value * 10000) / 100).replace(".", ",")
    : new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(value);
}

export function ManualSourceDialog({
  dialogRef,
  organizationId,
  projectId,
  concertId,
  source,
  onSaved,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  organizationId: string;
  projectId: string;
  concertId: string;
  // Present when editing an existing source; absent when adding a new one.
  source?: ConcertManualSource;
  onSaved: (manualSources: ConcertManualSource[]) => void;
}) {
  const [platform, setPlatform] = useState("");
  const [active, setActive] = useState(true);
  const [values, setValues] = useState(EMPTY_VALUES);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, element: confirmDialog } = useConfirmDialog();

  useEffect(() => {
    setPlatform(source?.platform ?? "");
    setActive(source?.active ?? true);
    setValues(source
      ? {
        impressions: formatInput(source.impressions),
        clicks: formatInput(source.clicks),
        conversions: formatInput(source.conversions),
        ctr: formatInput(source.ctr, true),
        billedSpend: formatInput(source.billedSpend),
      }
      : EMPTY_VALUES);
    setNotes(source?.notes ?? "");
    setError(null);
  }, [source]);

  async function send(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) {
    const token = await getFirebaseIdToken();
    const response = await fetch("/api/concerts/manual-sources", {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ organizationId, projectId, concertId, ...body }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "No fue posible guardar la fuente");
    onSaved(payload.data.manualSources);
    dialogRef.current?.close();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const impressions = parseAmount(values.impressions);
    const clicks = parseAmount(values.clicks);
    const conversions = parseAmount(values.conversions);
    const billedSpend = parseAmount(values.billedSpend);
    let ctr = parsePercent(values.ctr);
    if ([impressions, clicks, conversions, billedSpend, ctr].some((value) => Number.isNaN(value))) {
      setError("Revisa los valores: deben ser números positivos (el CTR entre 0 y 100)");
      return;
    }
    if (ctr === null && impressions && clicks !== null) ctr = clicks / impressions;
    setSubmitting(true);
    setError(null);
    try {
      const payload = { platform, active, impressions, clicks, conversions, ctr, billedSpend, notes };
      await send(source ? "PATCH" : "POST", source ? { id: source.id, source: payload } : { source: payload });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!source) return;
    const confirmed = await confirm(`¿Borrar la fuente "${source.platform}"? Esta acción no se puede deshacer.`);
    if (!confirmed) return;
    setSubmitting(true);
    setError(null);
    try {
      await send("DELETE", { id: source.id });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="event-dialog"
      aria-labelledby="manual-source-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
    >
      {confirmDialog}
      <div className="event-dialog-heading">
        <h2 id="manual-source-title">{source ? "Editar fuente" : "Añadir fuente"}</h2>
        <button type="button" aria-label="Cerrar" onClick={() => dialogRef.current?.close()}><X className="size-4" /></button>
      </div>
      <form className="concert-admin-forms" onSubmit={submit}>
        <label className="auth-field">
          <span>Plataforma</span>
          <input value={platform} onChange={(event) => setPlatform(event.target.value)} placeholder="Nombre de la plataforma" maxLength={80} required />
        </label>
        <div className="manual-source-status">
          <span id="manual-source-status-label">Estado</span>
          <button
            type="button"
            role="switch"
            aria-checked={active}
            aria-labelledby="manual-source-status-label"
            className="status-switch"
            onClick={() => setActive((value) => !value)}
          >
            <span className="status-switch-track" aria-hidden="true"><span className="status-switch-thumb" /></span>
            <span className={`select-dot select-dot-${active ? "green" : "red"}`} aria-hidden="true" />
            {active ? "Activa" : "Inactiva"}
          </button>
        </div>
        <div className="manual-source-grid">
          {NUMBER_FIELDS.map((field) => (
            <label className="auth-field" key={field.key}>
              <span>{field.label}</span>
              <input
                inputMode="decimal"
                value={values[field.key]}
                onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                placeholder={field.placeholder}
              />
            </label>
          ))}
        </div>
        <label className="auth-field">
          <span>Anotaciones (opcional)</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Aclaraciones sobre estos datos"
            maxLength={1000}
            rows={3}
          />
        </label>
        <div className="manual-source-actions">
          {source && (
            <button type="button" className="manual-source-delete" onClick={remove} disabled={submitting}>Borrar fuente</button>
          )}
          <button className="auth-submit" type="submit" disabled={submitting || !platform.trim()}>
            {submitting ? "Guardando…" : source ? "Guardar cambios" : "Añadir fuente"}
          </button>
        </div>
        {error && <small className="auth-error" aria-live="polite">{error}</small>}
      </form>
    </dialog>
  );
}

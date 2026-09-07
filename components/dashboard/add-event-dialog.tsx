"use client";

import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { Artist, Concert } from "@/lib/domain/analytics";
import { getFirebaseIdToken } from "@/lib/firebase/client";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function validatePhoto(file: File | undefined) {
  if (!file) return null;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "La foto debe ser JPG, PNG o WEBP";
  if (file.size > MAX_PHOTO_BYTES) return "La foto no puede pesar más de 5MB";
  return null;
}

export function AddEventDialog({
  dialogRef,
  organizationId,
  projectId,
  artists,
  selectedArtistId,
  onArtistCreated,
  onConcertCreated,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  organizationId: string;
  projectId: string;
  artists: Artist[];
  selectedArtistId: string;
  onArtistCreated: (artist: Artist) => void;
  onConcertCreated: (concert: Concert) => void;
}) {
  const [artistName, setArtistName] = useState("");
  const [artistPhoto, setArtistPhoto] = useState<File | undefined>();
  const [artistSubmitting, setArtistSubmitting] = useState(false);
  const [artistError, setArtistError] = useState<string | null>(null);

  const [concertArtistId, setConcertArtistId] = useState(selectedArtistId);
  useEffect(() => setConcertArtistId(selectedArtistId), [selectedArtistId]);
  const [concertName, setConcertName] = useState("");
  const [namePattern, setNamePattern] = useState("");
  const [eventPhoto, setEventPhoto] = useState<File | undefined>();
  const [concertSubmitting, setConcertSubmitting] = useState(false);
  const [concertError, setConcertError] = useState<string | null>(null);

  async function submitArtist(event: FormEvent) {
    event.preventDefault();
    const photoIssue = validatePhoto(artistPhoto);
    if (photoIssue) {
      setArtistError(photoIssue);
      return;
    }
    setArtistSubmitting(true);
    setArtistError(null);
    try {
      const token = await getFirebaseIdToken();
      const body = new FormData();
      body.set("organizationId", organizationId);
      body.set("projectId", projectId);
      body.set("displayName", artistName);
      if (artistPhoto) body.set("photo", artistPhoto);
      const response = await fetch("/api/artists", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No fue posible crear el artista");
      onArtistCreated(payload.data);
      setArtistName("");
      setArtistPhoto(undefined);
    } catch (reason) {
      setArtistError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setArtistSubmitting(false);
    }
  }

  async function submitConcert(event: FormEvent) {
    event.preventDefault();
    const photoIssue = validatePhoto(eventPhoto);
    if (photoIssue) {
      setConcertError(photoIssue);
      return;
    }
    setConcertSubmitting(true);
    setConcertError(null);
    try {
      const token = await getFirebaseIdToken();
      const body = new FormData();
      body.set("organizationId", organizationId);
      body.set("projectId", projectId);
      body.set("artistId", concertArtistId);
      body.set("displayName", concertName);
      body.set("namePattern", namePattern);
      if (eventPhoto) body.set("photo", eventPhoto);
      const response = await fetch("/api/concerts", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No fue posible crear el concierto");
      onConcertCreated(payload.data);
      setConcertName("");
      setNamePattern("");
      setEventPhoto(undefined);
    } catch (reason) {
      setConcertError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setConcertSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="event-dialog"
      aria-labelledby="add-event-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
    >
      <div className="event-dialog-heading">
        <h2 id="add-event-title">Agregar evento</h2>
        <button type="button" aria-label="Cerrar" onClick={() => dialogRef.current?.close()}><X className="size-4" /></button>
      </div>
      <div className="concert-admin-forms">
        <form className="auth-field" onSubmit={submitArtist}>
          <span>1. Artista (si aún no existe)</span>
          <input value={artistName} onChange={(event) => setArtistName(event.target.value)} placeholder="Ej. Reykon" required />
          <label className="photo-field">
            <span>Foto del artista (opcional)</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setArtistPhoto(event.target.files?.[0])} />
          </label>
          <button className="auth-submit" type="submit" disabled={artistSubmitting || !artistName.trim()}>
            {artistSubmitting ? "Creando…" : "Crear artista"}
          </button>
          {artistError && <small className="auth-error" aria-live="polite">{artistError}</small>}
        </form>

        <form className="auth-field" onSubmit={submitConcert}>
          <span>2. Evento</span>
          <select value={concertArtistId} onChange={(event) => setConcertArtistId(event.target.value)} required>
            <option value="" disabled>Selecciona un artista</option>
            {artists.map((artist) => <option key={artist.id} value={artist.id}>{artist.displayName}</option>)}
          </select>
          <input value={concertName} onChange={(event) => setConcertName(event.target.value)} placeholder="Ej. Reykon — Bogotá 27 Jul" required />
          <input value={namePattern} onChange={(event) => setNamePattern(event.target.value)} placeholder="Ej. BFL_Reykon" required />
          <label className="photo-field">
            <span>Foto del evento (opcional)</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setEventPhoto(event.target.files?.[0])} />
          </label>
          <button
            className="auth-submit"
            type="submit"
            disabled={concertSubmitting || !concertArtistId || !concertName.trim() || !namePattern.trim()}
          >
            {concertSubmitting ? "Creando…" : "Crear evento"}
          </button>
          {concertError && <small className="auth-error" aria-live="polite">{concertError}</small>}
        </form>
      </div>
    </dialog>
  );
}

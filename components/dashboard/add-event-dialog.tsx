"use client";

import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { Artist, Concert } from "@/lib/domain/analytics";
import { AvatarPhotoField } from "./avatar-photo-field";
import { LabeledSelect } from "./labeled-select";
import { NamePatternsInput } from "./name-patterns-input";
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
  const [artistPhotoKey, setArtistPhotoKey] = useState(0);
  const [artistSubmitting, setArtistSubmitting] = useState(false);
  const [artistError, setArtistError] = useState<string | null>(null);

  const [concertArtistId, setConcertArtistId] = useState(selectedArtistId);
  useEffect(() => setConcertArtistId(selectedArtistId), [selectedArtistId]);
  const [concertName, setConcertName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [namePatterns, setNamePatterns] = useState<string[]>([]);
  const [eventPhoto, setEventPhoto] = useState<File | undefined>();
  const [eventPhotoKey, setEventPhotoKey] = useState(0);
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
      setArtistPhotoKey((key) => key + 1);
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
      body.set("namePatterns", JSON.stringify(namePatterns));
      if (eventDate) body.set("eventDate", eventDate);
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
      setEventDate("");
      setNamePatterns([]);
      setEventPhoto(undefined);
      setEventPhotoKey((key) => key + 1);
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
          <div className="identity-row">
            <AvatarPhotoField key={artistPhotoKey} label="Foto del artista (opcional)" onFileChange={setArtistPhoto} />
            <input value={artistName} onChange={(event) => setArtistName(event.target.value)} placeholder="Ej. Reykon" required />
          </div>
          <button className="auth-submit" type="submit" disabled={artistSubmitting || !artistName.trim()}>
            {artistSubmitting ? "Creando…" : "Crear artista"}
          </button>
          {artistError && <small className="auth-error" aria-live="polite">{artistError}</small>}
        </form>

        <form className="auth-field" onSubmit={submitConcert}>
          <span>2. Evento</span>
          <LabeledSelect
            label="Artista"
            hideLabel
            value={concertArtistId}
            onChange={setConcertArtistId}
            options={artists.map((artist) => ({ value: artist.id, label: artist.displayName }))}
          />
          <div className="identity-row identity-row-after-select">
            <AvatarPhotoField key={eventPhotoKey} label="Foto del evento (opcional)" onFileChange={setEventPhoto} />
            <input value={concertName} onChange={(event) => setConcertName(event.target.value)} placeholder="Ej. Reykon — Bogotá 27 Jul" required />
          </div>
          <label className="auth-field">
            <span>Fecha del evento (opcional)</span>
            <input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} />
          </label>
          <label className="auth-field">
            <span>Patrones de nombre de campaña</span>
            <NamePatternsInput value={namePatterns} onChange={setNamePatterns} />
          </label>
          <button
            className="auth-submit event-form-submit"
            type="submit"
            disabled={concertSubmitting || !concertArtistId || !concertName.trim() || !namePatterns.length}
          >
            {concertSubmitting ? "Creando…" : "Crear evento"}
          </button>
          {concertError && <small className="auth-error" aria-live="polite">{concertError}</small>}
        </form>
      </div>
    </dialog>
  );
}

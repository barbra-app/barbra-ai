"use client";

import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { Artist, Concert } from "@/lib/domain/analytics";
import { getFirebaseIdToken } from "@/lib/firebase/client";
import { AvatarPhotoField } from "./avatar-photo-field";
import { NamePatternsInput } from "./name-patterns-input";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function validatePhoto(file: File | undefined) {
  if (!file) return null;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "La foto debe ser JPG, PNG o WEBP";
  if (file.size > MAX_PHOTO_BYTES) return "La foto no puede pesar más de 5MB";
  return null;
}

export function EditEventDialog({
  dialogRef,
  organizationId,
  projectId,
  artist,
  concert,
  onArtistUpdated,
  onConcertUpdated,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  organizationId: string;
  projectId: string;
  artist?: Artist;
  concert?: Concert;
  onArtistUpdated: (artist: Artist) => void;
  onConcertUpdated: (concert: Concert) => void;
}) {
  const [artistName, setArtistName] = useState(artist?.displayName ?? "");
  const [artistPhoto, setArtistPhoto] = useState<File | undefined>();
  const [artistSubmitting, setArtistSubmitting] = useState(false);
  const [artistError, setArtistError] = useState<string | null>(null);

  const [concertName, setConcertName] = useState(concert?.displayName ?? "");
  const [eventDate, setEventDate] = useState(concert?.eventDate ?? "");
  const [namePatterns, setNamePatterns] = useState<string[]>(concert?.namePatterns ?? []);
  const [eventPhoto, setEventPhoto] = useState<File | undefined>();
  const [concertSubmitting, setConcertSubmitting] = useState(false);
  const [concertError, setConcertError] = useState<string | null>(null);

  // Re-sync the form whenever the dialog is pointed at a different artist or
  // concert (a different selection was made, or the dialog re-opened).
  useEffect(() => {
    setArtistName(artist?.displayName ?? "");
    setArtistPhoto(undefined);
    setArtistError(null);
  }, [artist?.id, artist?.displayName]);
  useEffect(() => {
    setConcertName(concert?.displayName ?? "");
    setEventDate(concert?.eventDate ?? "");
    setNamePatterns(concert?.namePatterns ?? []);
    setEventPhoto(undefined);
    setConcertError(null);
  }, [concert?.id, concert?.displayName, concert?.eventDate, concert?.namePatterns]);

  async function submitArtist(event: FormEvent) {
    event.preventDefault();
    if (!artist) return;
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
      body.set("id", artist.id);
      body.set("organizationId", organizationId);
      body.set("projectId", projectId);
      body.set("displayName", artistName);
      if (artistPhoto) body.set("photo", artistPhoto);
      const response = await fetch("/api/artists", {
        method: "PATCH",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No fue posible actualizar el artista");
      onArtistUpdated(payload.data);
      setArtistPhoto(undefined);
    } catch (reason) {
      setArtistError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setArtistSubmitting(false);
    }
  }

  async function submitConcert(event: FormEvent) {
    event.preventDefault();
    if (!concert) return;
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
      body.set("id", concert.id);
      body.set("organizationId", organizationId);
      body.set("projectId", projectId);
      body.set("artistId", concert.artistId);
      body.set("displayName", concertName);
      body.set("namePatterns", JSON.stringify(namePatterns));
      if (eventDate) body.set("eventDate", eventDate);
      if (eventPhoto) body.set("photo", eventPhoto);
      const response = await fetch("/api/concerts", {
        method: "PATCH",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No fue posible actualizar el evento");
      onConcertUpdated(payload.data);
      setEventPhoto(undefined);
    } catch (reason) {
      setConcertError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setConcertSubmitting(false);
    }
  }

  if (!artist) return null;

  return (
    <dialog
      ref={dialogRef}
      className="event-dialog"
      aria-labelledby="edit-event-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
    >
      <div className="event-dialog-heading">
        <h2 id="edit-event-title">Editar {concert ? "evento" : "artista"}</h2>
        <button type="button" aria-label="Cerrar" onClick={() => dialogRef.current?.close()}><X className="size-4" /></button>
      </div>
      <div className="concert-admin-forms">
        <form className="auth-field" onSubmit={submitArtist}>
          <span>Artista</span>
          <div className="identity-row">
            <AvatarPhotoField label="Foto del artista" currentUrl={artist.photoUrl} onFileChange={setArtistPhoto} />
            <input value={artistName} onChange={(event) => setArtistName(event.target.value)} placeholder="Ej. Reykon" required />
          </div>
          <button className="auth-submit" type="submit" disabled={artistSubmitting || !artistName.trim()}>
            {artistSubmitting ? "Guardando…" : "Guardar artista"}
          </button>
          {artistError && <small className="auth-error" aria-live="polite">{artistError}</small>}
        </form>

        {concert && (
          <form className="auth-field" onSubmit={submitConcert}>
            <span>Evento</span>
            <div className="identity-row">
              <AvatarPhotoField label="Foto del evento" currentUrl={concert.photoUrl} onFileChange={setEventPhoto} />
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
              disabled={concertSubmitting || !concertName.trim() || !namePatterns.length}
            >
              {concertSubmitting ? "Guardando…" : "Guardar evento"}
            </button>
            {concertError && <small className="auth-error" aria-live="polite">{concertError}</small>}
          </form>
        )}
      </div>
    </dialog>
  );
}

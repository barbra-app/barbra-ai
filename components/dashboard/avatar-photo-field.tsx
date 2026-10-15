"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";

export function AvatarPhotoField({
  label,
  currentUrl,
  onFileChange,
}: {
  label: string;
  currentUrl?: string;
  onFileChange: (file: File | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | undefined>();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // A new photoUrl from the server (own save, or the dialog re-synced to a
  // different artist/concert) means any staged-but-unsaved file is stale.
  useEffect(() => {
    setFile(undefined);
    if (inputRef.current) inputRef.current.value = "";
  }, [currentUrl]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0];
    setFile(next);
    onFileChange(next);
  }

  const displaySrc = previewUrl ?? currentUrl;

  return (
    <div className="avatar-field">
      <button
        type="button"
        className="avatar-picker"
        onClick={() => inputRef.current?.click()}
        title={label}
        aria-label={`Cambiar ${label.toLowerCase()}`}
      >
        {displaySrc ? <img src={displaySrc} alt="" /> : <span className="avatar-picker-placeholder" aria-hidden="true" />}
        <span className="avatar-picker-badge" aria-hidden="true">
          <Pencil className="size-3" />
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleChange}
        hidden
      />
    </div>
  );
}

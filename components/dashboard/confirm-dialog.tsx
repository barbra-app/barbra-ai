"use client";

import { useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

export function useConfirmDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const resolveRef = useRef<((value: boolean) => void) | undefined>(undefined);
  const [message, setMessage] = useState("");
  const [confirmLabel, setConfirmLabel] = useState("Borrar");

  function confirm(message: string, confirmLabel = "Borrar") {
    setMessage(message);
    setConfirmLabel(confirmLabel);
    dialogRef.current?.showModal();
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }

  function resolve(value: boolean) {
    dialogRef.current?.close();
    resolveRef.current?.(value);
  }

  const element = (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      onClick={(event) => {
        if (event.target === event.currentTarget) resolve(false);
      }}
      onCancel={(event) => {
        event.preventDefault();
        resolve(false);
      }}
    >
      <div className="confirm-dialog-icon" aria-hidden="true">
        <AlertTriangle className="size-5" />
      </div>
      <p className="confirm-dialog-message">{message}</p>
      <div className="confirm-dialog-actions">
        <button type="button" className="confirm-dialog-cancel" onClick={() => resolve(false)}>
          Cancelar
        </button>
        <button type="button" className="confirm-dialog-confirm" onClick={() => resolve(true)}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );

  return { confirm, element };
}

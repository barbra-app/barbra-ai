"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function LabeledSelect({
  label,
  value,
  onChange,
  options,
  disabled = false,
  hideLabel = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; dot?: "green" | "red" | "gray" }[];
  disabled?: boolean;
  hideLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; minWidth: number; maxWidth: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  // A native <dialog> renders in the browser's top layer, which sits above
  // regular document.body content regardless of z-index — so a popover
  // portaled to document.body would be invisible (or unclickable) behind an
  // open dialog. Portal into the dialog itself when the select lives inside
  // one, so the popover shares its top-layer stacking context.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalTarget(rootRef.current?.closest("dialog") ?? document.body);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    function updatePosition() {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({
        top: rect.bottom + 8,
        left: rect.left,
        minWidth: Math.max(rect.width, 192),
        maxWidth: Math.max(window.innerWidth - rect.left - 16, 192),
      });
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <label className="labeled-select">
      {!hideLabel && <span>{label}</span>}
      <div className="select-root" ref={rootRef}>
        <button
          type="button"
          className="select-control"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={label}
          disabled={disabled}
          onClick={() => setOpen((value) => !value)}
        >
          {selected?.dot && <span className={`select-dot select-dot-${selected.dot}`} aria-hidden="true" />}
          <span className="select-control-value">{selected?.label ?? ""}</span>
          <ChevronDown className="size-3.5" />
        </button>
        {open && position && portalTarget && createPortal(
          <div
            className="select-popover"
            ref={popoverRef}
            style={{ position: "fixed", top: position.top, left: position.left, minWidth: position.minWidth, maxWidth: position.maxWidth }}
          >
          <ul
            className="select-popover-list"
            role="listbox"
            aria-label={label}
          >
            {options.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  className={option.value === value ? "is-selected" : undefined}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span className="select-option-label">
                    {option.dot && <span className={`select-dot select-dot-${option.dot}`} aria-hidden="true" />}
                    {option.label}
                  </span>
                  {option.value === value && <Check className="size-3.5" />}
                </button>
              </li>
            ))}
          </ul>
          </div>,
          portalTarget,
        )}
      </div>
    </label>
  );
}

"use client";

import { X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

interface NamePatternsInputProps {
  value: string[];
  onChange: (next: string[]) => void;
}

export function NamePatternsInput({ value, onChange }: NamePatternsInputProps) {
  const [draft, setDraft] = useState("");

  function commit(text: string) {
    const next = text.trim();
    if (!next || value.includes(next)) return;
    onChange([...value, next]);
  }

  function remove(index: number) {
    onChange(value.filter((_, position) => position !== index));
  }

  function handleChange(text: string) {
    if (!text.includes(",")) {
      setDraft(text);
      return;
    }
    const parts = text.split(",");
    const pending = parts.pop() ?? "";
    const next = [...value];
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed && !next.includes(trimmed)) next.push(trimmed);
    }
    onChange(next);
    setDraft(pending);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit(draft);
      setDraft("");
    } else if (event.key === "Backspace" && !draft && value.length) {
      remove(value.length - 1);
    }
  }

  return (
    <div className="name-patterns-input">
      {value.map((pattern, index) => (
        <span key={pattern} className="name-pattern-chip">
          {pattern}
          <button type="button" aria-label={`Quitar ${pattern}`} onClick={() => remove(index)}>
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          commit(draft);
          setDraft("");
        }}
        placeholder={value.length ? "Agregar otro patrón" : "Ej. BFL_Reykon, BFL_ReykonBog"}
      />
    </div>
  );
}

"use client";

import { ChevronDown } from "lucide-react";

export function LabeledSelect({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <label className="labeled-select">
      <span>{label}</span>
      <span className="select-control">
        <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} disabled={disabled}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <ChevronDown className="size-3.5" />
      </span>
    </label>
  );
}

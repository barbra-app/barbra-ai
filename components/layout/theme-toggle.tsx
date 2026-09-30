"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "barbra-theme";
type Theme = "light" | "dark";

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(theme: Theme | null) {
  const root = document.documentElement;
  if (theme) root.setAttribute("data-theme", theme);
  else root.removeAttribute("data-theme");
}

export function ThemeToggle() {
  // Mirrors the inline bootstrap script in layout.tsx: null means "follow
  // the system preference" (no explicit override stored yet).
  const [theme, setTheme] = useState<Theme | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    setTheme(stored === "light" || stored === "dark" ? stored : null);
    setMounted(true);
  }, []);

  if (!mounted) return <span className="theme-toggle" aria-hidden="true" />;

  const effective: Theme = theme ?? (systemPrefersDark() ? "dark" : "light");

  function toggle() {
    const next: Theme = effective === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private browsing, blocked cookies) —
      // the theme still applies for this page load via the DOM attribute.
    }
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={effective === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={effective === "dark" ? "Modo claro" : "Modo oscuro"}
    >
      {effective === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

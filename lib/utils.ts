import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Locale por defecto — Barbra es una agencia colombiana, así que usamos
// formateo es-CO (punto miles, coma decimal). Cambiar a "es-ES" o
// "es-419" si se necesita otro mercado.
const LOCALE = "es-CO";

export function formatNumber(n: number, opts?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(LOCALE, opts).format(n);
}

export function formatCurrency(n: number, currency = "USD") {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatPercent(n: number, fractionDigits = 1) {
  return new Intl.NumberFormat(LOCALE, {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n);
}

/**
 * Tiny className combiner. Filters out falsy values and joins the rest with a space.
 * Kept dependency-free so we don't pull in clsx/twMerge for the small benefit it would bring.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

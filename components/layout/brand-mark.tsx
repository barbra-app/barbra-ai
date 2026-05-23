import { cn } from "@/lib/utils";

/**
 * Barbra brand lockup — yellow 4-point spark + spaced wordmark.
 * Matches the header on barbra.com.co.
 */
export function BrandMark({
  className,
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Spark className="size-5 shrink-0" />
      {showWordmark && (
        <span
          className="text-[15px] font-semibold tracking-[0.22em] text-[var(--color-fg)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          BARBRA
        </span>
      )}
    </div>
  );
}

/** 4-point asterisk spark mark, yellow. */
export function Spark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M12 2 C 13 8, 16 11, 22 12 C 16 13, 13 16, 12 22 C 11 16, 8 13, 2 12 C 8 11, 11 8, 12 2 Z"
        fill="var(--color-brand-spark)"
      />
    </svg>
  );
}

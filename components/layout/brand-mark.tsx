import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Barbra brand lockup — the official wordmark PNG (white-on-transparent,
 * sized for dark surfaces). Use <BrandMark> for the sidebar / app
 * headers, and <Spark> for tight spots like message avatars.
 */
export function BrandMark({
  className,
  height = 22,
}: {
  className?: string;
  height?: number;
}) {
  return (
    <div className={cn("flex items-center", className)}>
      <Image
        src="/barbra-logo.png"
        alt="Barbra"
        width={(600 / 95) * height}
        height={height}
        priority
        className="select-none"
      />
    </div>
  );
}

/**
 * 4-point asterisk spark mark, yellow — used standalone where the full
 * wordmark won't fit (message avatars, empty-state hero).
 */
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

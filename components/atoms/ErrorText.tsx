import { cn } from "@/lib/cn";

export function ErrorText({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  if (!children) return null;
  return (
    <p className={cn("mt-1 text-sm text-red-600", className)} role="alert">
      {children}
    </p>
  );
}

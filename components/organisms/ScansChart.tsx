import type { DailyScanPoint } from "@/types/domain";

/**
 * Minimal pure-CSS bar chart so we don't pull in a chart library.
 * Heights are normalized to the max value in the series.
 */
export function ScansChart({ data }: { data: DailyScanPoint[] }) {
  const max = Math.max(1, ...data.map((p) => p.count));

  return (
    <div>
      <div className="flex h-32 items-end gap-1">
        {data.map((point) => {
          const pct = (point.count / max) * 100;
          return (
            <div
              key={point.day}
              className="flex flex-1 flex-col items-center justify-end"
              title={`${point.day} — ${point.count}`}
            >
              <div
                className="w-full rounded-t bg-brand-500"
                style={{ height: `${Math.max(pct, point.count > 0 ? 6 : 1)}%` }}
                aria-label={`${point.day}: ${point.count}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-400">
        <span>{data[0]?.day}</span>
        <span>{data[data.length - 1]?.day}</span>
      </div>
    </div>
  );
}

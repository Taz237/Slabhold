import { salesDots, salesDotsLabel, type DotSale } from "@/lib/scan/sales-dots";

const WIDTH = 300;
const HEIGHT = 96;

function day(value: string): string {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * The comp sheet's one rich element: every dot is a real sold sale. The newest is brand purple,
 * the rest are quiet; a dashed line marks the value and a soft band where most sales landed.
 * Nothing renders under three dated sales. Laid out in percent, so dots stay round at any
 * width. No hooks, no motion.
 */
export function SalesDots({
  sales,
  medianCents,
  lowCents,
  highCents,
}: {
  sales: readonly DotSale[];
  medianCents?: number | null;
  lowCents?: number | null;
  highCents?: number | null;
}) {
  const chart = salesDots(sales, { width: WIDTH, height: HEIGHT, medianCents, lowCents, highCents });
  if (!chart) return null;
  const first = day(chart.firstDay);
  const last = day(chart.lastDay);
  return (
    <figure className="mt-4">
      <div role="img" aria-label={salesDotsLabel(sales)} className="relative h-24 w-full">
        {chart.band ? (
          <span
            aria-hidden
            className="absolute inset-x-0 rounded bg-zinc-900/[0.04] dark:bg-white/[0.05]"
            style={{ top: chart.band.top, height: Math.max(1, chart.band.bottom - chart.band.top) }}
          />
        ) : null}
        {chart.medianY != null ? (
          <span aria-hidden className="absolute inset-x-0 border-t border-dashed border-zinc-300 dark:border-zinc-700" style={{ top: chart.medianY }} />
        ) : null}
        {chart.dots.map((dot, index) => (
          <span
            key={`${dot.soldAt}-${index}`}
            aria-hidden
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${
              dot.newest ? "size-2.5 bg-violet-600 ring-2 ring-white dark:bg-[#A78BFA] dark:ring-zinc-950" : "size-2 bg-zinc-400 dark:bg-zinc-500"
            }`}
            style={{ left: `${(dot.x / WIDTH) * 100}%`, top: dot.y }}
          />
        ))}
      </div>
      <figcaption className="mt-1 flex justify-between font-mono text-11 text-zinc-500 dark:text-zinc-400 tabular-nums" aria-hidden>
        <span>{first}</span>
        {last !== first ? <span>{last}</span> : null}
      </figcaption>
    </figure>
  );
}

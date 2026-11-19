import type { ReactNode } from "react";
import { cardSection, cardSectionTitle } from "@/components/card-page/section-styles";
import { PRICE_BASIS_LINE, TRAWL_ATTRIBUTION } from "@/lib/comps/price-basis";
import type { PriceRead } from "@/lib/value/price-fallback";

/**
 * The card page's value read, shared by the public card and the owner's card:
 * a quiet label, one big price, one change pill, one short line, and an ⓘ that
 * holds the method, the USD basis and the sold-data credit. Light enough to
 * draw before the chart's chunk arrives.
 */

export { PRICE_BASIS_LINE, TRAWL_ATTRIBUTION };

export { cardSection, cardSectionTitle };
export const valueLabel = "text-13 leading-5 text-zinc-500 dark:text-zinc-400";
export const valuePrice = "text-[2.25rem] leading-11 font-semibold tracking-tight tabular-nums";
/** A last sale or a range: a real figure, but not the estimate, so it is set smaller. */
export const valuePriceSmall = "text-2xl leading-8 font-semibold tracking-tight tabular-nums";
export const valueText = "text-xl leading-7 font-semibold";
export const valueLine = "text-13 leading-5 text-zinc-500 tabular-nums dark:text-zinc-400";
/** The plot's height, and its skeleton's. */
export const VALUE_PLOT_HEIGHT = 208;

/** What ⓘ says about thin data. The value line says it shorter. */
export const ROUGH_VALUE_NOTE = "Few sales, rough value";
export const PRICE_INFO_LABEL = "About this price";

export type ValueHeadline = {
  label: string;
  /** A dollar figure, set big. */
  price?: string;
  /** Words instead of a figure ("No sales found yet"). */
  text?: ReactNode;
  /** A short fact for the line under it ("Oct 2"). */
  note?: string;
  /** The estimate: the one figure set at full size. */
  estimate?: boolean;
};

/**
 * A fallback label as the head shows it. "Last sold $24.50 on Oct 2" becomes
 * the label "Last sold", the price and the day, so those words show once. A
 * fallback's dollar is never set as big as the estimate's.
 */
export function headlineFromLabel(text: string): ValueHeadline {
  const last = text.match(/^Last sold (\$[\d,.]+)(?: on (.+))?$/);
  if (last) return { label: "Last sold", price: last[1], note: last[2] };
  const range = text.match(/^(~?\$[^ ]+) from (\d+ sales?)$/);
  if (range) return { label: "Recent sales", price: range[1] };
  return { label: "Recent sales", text };
}

/** A price read as the head shows it. Only an estimate gets the big dollar. */
export function valueHeadline(read: PriceRead | null | undefined, similarLabel = "Similar cards"): ValueHeadline | null {
  if (!read) return null;
  if (read.kind === "estimate") return { label: "Estimated value", price: read.text, estimate: true };
  if (read.kind === "similar") return { label: similarLabel, text: read.detail, note: read.priceText };
  return headlineFromLabel(read.text);
}

/** "3 recent sales", and "rough value" when there are only a few. */
export function recentSalesLine(count: number, { rough = false, note }: { rough?: boolean; note?: string | null } = {}): string {
  if (count < 1) return note ?? "";
  const sales = `${count} recent sale${count === 1 ? "" : "s"}`;
  return [note, rough ? `${sales}, rough value` : sales].filter(Boolean).join(" · ");
}

/** The lines every live price carries: the USD basis and the sold-data credit. */
export function priceInfoLines(extra: readonly (string | null | false | undefined)[] = []): string[] {
  return [...extra.filter((line): line is string => Boolean(line)), PRICE_BASIS_LINE, TRAWL_ATTRIBUTION];
}

/**
 * Label, price (or words), pill and one line, at fixed heights: 20 + 44 + 32,
 * so the skeleton, the pending read and the loaded read all land in one place.
 */
export function ValueHead({
  headline,
  price,
  chip,
  line,
  info,
  aside,
}: {
  headline: ValueHeadline | null;
  /** Drawn in place of the headline's price (the count-up). */
  price?: ReactNode;
  /** The change pill, beside the price. */
  chip?: ReactNode;
  /** The one short line under the price. */
  line?: ReactNode;
  /** ⓘ, at the right of the price row. */
  info?: ReactNode;
  /** At the right of the line: the range control. */
  aside?: ReactNode;
}) {
  return (
    <div data-value-head="">
      <p className={`h-5 truncate ${valueLabel}`}>{headline?.label ?? "Recent sales"}</p>
      <div className="flex min-h-11 items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2">
          {price || headline?.price ? (
            <p data-value-price="" className={price || headline?.estimate ? valuePrice : valuePriceSmall}>
              {price ?? headline?.price}
            </p>
          ) : headline?.text ? (
            <p className={`min-w-0 ${valueText}`}>{headline.text}</p>
          ) : (
            <span data-skeleton="hero" className="skeleton-shimmer block h-8 w-36 rounded-lg bg-zinc-200/70 dark:bg-white/5" />
          )}
          {chip}
        </div>
        {info}
      </div>
      <div className="flex min-h-8 items-center justify-between gap-3">
        <p className={`min-w-0 truncate ${valueLine}`}>{line}</p>
        {aside}
      </div>
    </div>
  );
}

/** A quiet notice in the value section: sold prices paused, log in, and so on. */
export function ValueNotice({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div data-value-notice="" className="mt-4 rounded-2xl bg-zinc-950/[0.03] px-4 py-4 dark:bg-white/[0.04]">
      {title ? <p className="text-sm font-semibold">{title}</p> : null}
      <div className={`text-sm leading-5 text-zinc-500 dark:text-zinc-400 ${title ? "mt-1" : ""}`}>{children}</div>
    </div>
  );
}

/** No sales yet: a calm, drawn empty chart. A dashed line where the value will sit, never "$0". */
export function PlotEmpty({ title = "No sales yet", children }: { title?: string | null; children?: ReactNode }) {
  return (
    <div data-plot-empty="" className="mt-4 text-center">
      <div className="flex min-h-16 flex-col items-center justify-end gap-1 px-6 pb-4">
        {title ? <p className="text-15 leading-5 font-semibold text-zinc-700 dark:text-zinc-200">{title}</p> : null}
        <p className="max-w-64 text-13 leading-5 text-zinc-500 dark:text-zinc-400">
          {"We'll show a value once this card has a recent sale"}
        </p>
      </div>
      <div aria-hidden="true" className="border-t border-dashed border-violet-600/35 dark:border-violet-400/35" />
      {children ? <div className="flex min-h-11 items-center justify-center text-13">{children}</div> : <div className="h-4" />}
    </div>
  );
}

/** The value section while it loads: the head and the plot, at their final sizes. */
export function ValuePending({
  headline = null,
  line,
  note = null,
  busy = true,
  slot,
}: {
  /** A price we already know, drawn in place. */
  headline?: ValueHeadline | null;
  line?: ReactNode;
  /** Words in the plot's place instead of a shimmer. */
  note?: ReactNode;
  busy?: boolean;
  slot?: string;
}) {
  return (
    <section data-slot={slot} data-comp-skeleton="" className={cardSection} aria-busy={busy || undefined}>
      {busy ? <span className="sr-only">Loading sold prices</span> : null}
      <ValueHead
        headline={headline}
        line={
          line ??
          (headline ? (headline.note ?? null) : <span className="skeleton-shimmer block h-3 w-28 rounded bg-zinc-200/70 dark:bg-white/5" />)
        }
      />
      {note ? (
        <ValueNotice>{note}</ValueNotice>
      ) : (
        <div
          data-skeleton="plot"
          className="skeleton-shimmer mt-4 rounded-2xl bg-zinc-200/50 dark:bg-white/[0.03]"
          style={{ height: VALUE_PLOT_HEIGHT }}
        />
      )}
    </section>
  );
}

/** Sales rows while they load: one line each, the height of a loaded row. */
export function SaleRowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="mt-2 divide-y divide-zinc-950/5 dark:divide-white/[0.06]" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="flex h-12 items-center justify-between gap-3">
          <span className="skeleton-shimmer block h-4 w-20 rounded bg-zinc-200/70 dark:bg-white/5" />
          <span className="skeleton-shimmer block h-3 w-12 rounded bg-zinc-200/70 dark:bg-white/5" />
        </li>
      ))}
    </ul>
  );
}

import type { ReactNode } from "react";
import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";
import { formatDate, money } from "@/lib/format";
import { basedOnSalesLabel } from "@/lib/comps/sales-label";
import type { SaleBasis } from "@/lib/comps/shared-value";

/** "Based on N sales" plus the date, price, and grade of each sale in that count. */
export function CompBasis({
  count,
  basis,
}: {
  count: number;
  basis: SaleBasis[];
}) {
  if (count < 1) return null;
  return (
    <div className="mt-1">
      <p className="text-[11px] text-zinc-500">{basedOnSalesLabel(count)}</p>
      {basis.length > 0 ? (
        <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
          {basis.map((sale, index) => (
            <li
              key={`${sale.date}-${sale.price}-${sale.grade}-${index}`}
              className="text-[11px] tabular-nums text-zinc-500"
            >
              {formatDate(sale.date)} · {money(sale.price, true)} · {sale.grade}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* Quick Comp design tokens, shared by the card page's comp card, its skeleton and the sales rows. */

/** Outer card. */
export const compCard =
  "rounded-2xl bg-white p-4 ring-1 ring-zinc-950/5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] dark:bg-zinc-900/60 dark:ring-white/[0.06]";
/** Inner tile: the range bar, the plot, the retry. */
export const compTile = "rounded-xl bg-zinc-50 dark:bg-white/[0.03]";
export const compLabel = "text-xs font-medium text-zinc-500";
/**
 * " · Low confidence" after the Recent sales caption for 1–4 live sales, unless
 * the comp card already shows its amber tag, so it is never on screen twice.
 */
export function lowConfidenceNote(salesCount: number, live: boolean, tagShown: boolean): string {
  return live && salesCount >= 1 && salesCount < 5 && !tagShown ? " · Low confidence" : "";
}

export const compCaption = "text-[11px] text-zinc-400 dark:text-zinc-500";
export const compHeroValue = "text-[34px] leading-10 font-semibold tracking-tight tabular-nums";
export const compSectionValue = "text-xl leading-[26px] font-semibold tabular-nums";
export const compRowPrice = "text-[15px] leading-5 font-semibold tabular-nums";
/** Plot tile height. The chart inside is 152px. */
export const COMP_PLOT_HEIGHT = 152;

/** The eyebrow over the hero, from the kind of price read. */
export function compEyebrow(kind: string | null | undefined, similarLabel = "Similar cards"): string {
  if (kind === "last_sale") return "Last sale";
  if (kind === "estimate") return "Estimated value";
  if (kind === "similar") return similarLabel;
  return "Recent sales";
}

/** "Oct 9", with the year only when it is not this year. */
export function saleDate(ymd: string, today = snapshotDateInNewYork()): string {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(String(y) === today.slice(0, 4) ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

/** "3d", "2w", "4mo" since a YYYY-MM-DD sale day. Today is "Today". */
export function shortDaysSince(ymd: string, today: string): string {
  const day = (value: string) => {
    const [y, m, d] = value.slice(0, 10).split("-").map(Number);
    return y && m && d ? Date.UTC(y, m - 1, d) : NaN;
  };
  const days = Math.round((day(today) - day(ymd)) / 86_400_000);
  if (!Number.isFinite(days)) return "";
  if (days <= 0) return "Today";
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}y`;
}

/** A plot tile with no plot yet: a dashed baseline. */
export function GhostPlot({ children }: { children?: ReactNode }) {
  return (
    <div className={`relative mt-4 flex h-44 flex-col items-center justify-center gap-2 px-4 text-center ${compTile}`}>
      <span
        aria-hidden="true"
        className="absolute inset-x-4 bottom-8 border-t border-dashed border-zinc-300 dark:border-white/15"
      />
      {children}
    </div>
  );
}

/** No sales yet: a designed empty read, never "$0". */
export function CompEmpty({
  label = "Recent sales",
  title = "No sales yet",
  caption = "We'll show a value once this card sells on eBay.",
  children,
  slot,
}: {
  label?: string;
  title?: string;
  caption?: string;
  /** Under the ghost plot: the eBay sold link, when it helps. */
  children?: ReactNode;
  slot?: string;
}) {
  return (
    <section data-slot={slot} data-comp-empty="" className={compCard}>
      <p className={`flex h-5 items-center ${compLabel}`}>{label}</p>
      <p className={`mt-1 text-xl leading-10 font-semibold tracking-tight text-zinc-500`}>{title}</p>
      <p className={`mt-2 leading-4 ${compCaption}`}>{caption}</p>
      <GhostPlot>{children}</GhostPlot>
    </section>
  );
}

function Bar({ className, name }: { className: string; name?: string }) {
  return <span data-skeleton={name} className={`skeleton-shimmer block rounded-md bg-zinc-100 dark:bg-white/5 ${className}`} />;
}

/** The comp card while it loads, in its final shapes and height. */
export function CompCardSkeleton({
  hero,
  note,
  plot,
  label = "Recent sales",
  range = true,
  chip = true,
  busy = true,
  slot,
}: {
  label?: string;
  /** A value we already know, drawn in place of the hero bar. */
  hero?: ReactNode;
  /** Text in the plot tile instead of a shimmer. */
  note?: string | null;
  /** Replaces the plot tile. Keep it h-44. */
  plot?: ReactNode;
  range?: boolean;
  chip?: boolean;
  busy?: boolean;
  slot?: string;
}) {
  return (
    <section data-slot={slot} data-comp-skeleton="" className={compCard} aria-busy={busy || undefined}>
      <span className="sr-only">Loading sold prices</span>
      <div className="flex h-5 items-center justify-between">
        <p className={compLabel}>{label}</p>
        <Bar className="h-3 w-24" />
      </div>
      {/* 40px, the hero's line height, so the loaded card lands without a shift. */}
      <div className="mt-1 flex min-h-9 items-center gap-2" style={{ minHeight: 40 }}>
        {hero ?? <Bar name="hero" className="h-8 w-32 rounded-lg" />}
        {chip ? <Bar name="chip" className="h-5 w-14" /> : null}
      </div>
      <div className="mt-2 flex h-4 items-center">
        <Bar className="h-2.5 w-44" />
      </div>
      {range ? (
        <div className={`mt-4 px-3 py-3 ${compTile}`}>
          <Bar className="h-1.5 w-full rounded-full" />
          <div className="mt-2 flex h-4 items-center justify-between">
            <Bar className="h-2.5 w-14" />
            <Bar className="h-2.5 w-14" />
          </div>
        </div>
      ) : null}
      {plot ?? <PlotSkeleton note={note} />}
      <div className="mt-4 border-t border-zinc-950/5 pt-3 dark:border-white/[0.06]">
        <div className="flex h-4 items-center">
          <Bar className="h-2.5 w-56" />
        </div>
      </div>
    </section>
  );
}

/** The 176px plot tile while it loads, or with a note in it. */
export function PlotSkeleton({ note }: { note?: string | null }) {
  return (
    <div
      data-skeleton="plot"
      className={`mt-4 flex h-44 items-center justify-center ${compTile} ${note ? "" : "skeleton-shimmer"}`}
    >
      {note ? <p className="px-4 text-center text-sm text-zinc-500">{note}</p> : null}
    </div>
  );
}

/** Four sales rows while they load: price and meta bars, the row height of the real thing. */
export function CompRowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="mt-3 divide-y divide-zinc-950/5 dark:divide-white/[0.06]" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex min-h-14 items-start justify-between gap-3 py-3">
          {/* 48px: price (20) + meta (16) + title (12), as in a loaded row. */}
          <div className="h-12 min-w-0 flex-1">
            <div className="flex h-5 items-center">
              <Bar className="h-4 w-20" />
            </div>
            <div className="flex h-4 items-center">
              <Bar className="h-3 w-28" />
            </div>
            <div className="flex h-3 items-center">
              <Bar className="h-2 w-48" />
            </div>
          </div>
          <div className="flex h-5 items-center">
            <Bar className="h-3 w-6" />
          </div>
        </li>
      ))}
    </ul>
  );
}

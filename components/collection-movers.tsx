"use client";

import Link from "next/link";
import { useState } from "react";
import { ShapedCardThumb } from "@/components/card-thumb";
import { ValueChart } from "@/components/charts/value-chart";
import { formatPct, pctTone, type ChangeTone } from "@/lib/chart/range";
import { MOVE_PILL, collectionMinSpan } from "@/lib/chart/theme";
import type { MoverCard, MoverRow } from "@/lib/collection/value-series";
import { cardTitle, money } from "@/lib/format";
import type { SportsCard } from "@/lib/types";
import { MoveArrow } from "@/components/move-arrow";

/** A held card as the collection block reads it. */
export type HeroCard = MoverCard & { card: SportsCard };

/** Muted text, shared with the hero. */
export const muted = "text-zinc-500 dark:text-zinc-400";

/** ▲ up, ▼ down, nothing when flat, plus the word for screen readers. */
export { MoveArrow };

export type MoverBasis = "week" | "paid";

const HEADING: Record<MoverBasis, string> = {
  week: "Biggest movers this week",
  paid: "Since you paid",
};

/**
 * The collection's movers, between the hero and the grid: one swipe row of
 * small cards, each with its thumbnail, a brand spark and the real change.
 * Opens on the market price change this week; with none, on the change since
 * the price paid. Both: a Week | Paid toggle. Neither: nothing is drawn.
 */
export function TopMovers({ week, paid }: { week: MoverRow<HeroCard>[]; paid: MoverRow<HeroCard>[] }) {
  const [picked, setPicked] = useState<MoverBasis>("week");
  if (!week.length && !paid.length) return null;
  const both = week.length > 0 && paid.length > 0;
  const basis: MoverBasis = both ? picked : week.length ? "week" : "paid";
  const rows = basis === "week" ? week : paid;
  return (
    <section aria-labelledby="top-movers-title" data-movers={basis}>
      <div className="flex h-7 items-center justify-between gap-2">
        <h2 id="top-movers-title" className={`truncate text-13 font-medium ${muted}`}>
          {HEADING[basis]}
        </h2>
        {both ? (
          <div role="group" aria-label="Movers basis" className="flex shrink-0 rounded-full bg-zinc-500/10 p-0.5 dark:bg-white/[0.06]">
            {(["week", "paid"] as const).map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={basis === id}
                onClick={() => setPicked(id)}
                className={`hit-44 rounded-full px-2.5 py-1 text-xs leading-4 font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-violet-600 ${
                  basis === id
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-white/[0.12] dark:text-zinc-50"
                    : muted
                }`}
              >
                {id === "week" ? "Week" : "Paid"}
                <span className="sr-only">{id === "week" ? ": biggest movers this week" : ": since you paid"}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <ul
        data-no-pull
        className="-mx-4 mt-1 flex snap-x gap-2 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {rows.map((row) => (
          <MoverItem key={row.card.id} row={row} basis={basis} />
        ))}
      </ul>
    </section>
  );
}

function MoverItem({ row, basis }: { row: MoverRow<HeroCard>; basis: MoverBasis }) {
  const rowTone: ChangeTone = row.fresh ? "flat" : pctTone(row.pct);
  const word = rowTone === "flat" ? "unchanged" : `${rowTone} ${formatPct(row.pct, false)}`;
  const last = row.points[row.points.length - 1]?.value ?? 0;
  const spark = row.points.length >= 2;
  // Since you paid: what was paid goes beside the change. Only cards with a paid value get here.
  const paidLine = basis === "paid" && row.card.paid != null && row.card.paid > 0;
  return (
    <li className="shrink-0 snap-start">
      <Link
        href={`/cards/${row.card.id}`}
        className="tap flex min-h-14 items-center gap-2.5 rounded-2xl border border-zinc-950/[0.07] bg-white py-2 pr-3 pl-2 outline-none focus-visible:ring-2 focus-visible:ring-violet-600 dark:border-white/[0.08] dark:bg-white/[0.04]"
      >
        <ShapedCardThumb card={row.card.card} className="h-10 w-[30px] shrink-0 rounded-md" landscapeClassName="h-[30px] w-10 shrink-0 rounded-md" />
        <span className="min-w-0">
          <span className="block max-w-36 truncate text-13 leading-5 font-medium" title={`${row.card.playerName} · ${cardTitle(row.card.card)}`}>
            {row.card.playerName}
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span
              data-gain={rowTone}
              className={`inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded-full px-2 font-mono text-xs font-semibold tabular-nums ${MOVE_PILL[rowTone]}`}
            >
              {row.fresh ? "New" : (
                <>
                  <MoveArrow tone={rowTone} />
                  {formatPct(row.pct)}
                </>
              )}
            </span>
            {/* 64x24, reserved, so a card never shifts. Always brand purple, like the collection chart. */}
            {spark ? (
              <span data-spark-slot="" className="flex h-6 w-16 shrink-0 items-center">
                <ValueChart
                  variant="spark"
                  points={row.points}
                  tone="brand"
                  height={24}
                  minSpan={collectionMinSpan(last)}
                  ariaLabel={`${row.card.playerName}, ${word} this week`}
                />
              </span>
            ) : paidLine ? (
              <span className={`font-mono text-xs leading-4 tabular-nums ${muted}`}>Paid {money(row.card.paid as number).replace(/\.00$/, "")}</span>
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  );
}

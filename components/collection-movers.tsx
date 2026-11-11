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

/** The collection block's card and muted text, shared with the hero. */
export const tile =
  "min-w-0 rounded-2xl border border-zinc-950/[0.08] bg-white p-3.5 dark:border-white/10 dark:bg-white/[0.03]";
export const muted = "text-zinc-500 dark:text-zinc-400";

/** ▲ up, ▼ down, nothing when flat, plus the word for screen readers. */
export { MoveArrow };

export type MoverBasis = "week" | "paid";

const HEADING: Record<MoverBasis, string> = {
  week: "Biggest movers this week",
  paid: "Since you paid",
};

const SUBLINE: Record<MoverBasis, string> = {
  week: "Market price change, past 7 days",
  paid: "Change vs what you paid",
};

/**
 * Top movers in the collection, under the hero. Defaults to the market price
 * change this week. "Since you paid" is offered only when a held card has a
 * paid value, and lists only those cards. 56px rows: the card, a 64x24 brand
 * spark (or "Paid $X" since you paid) and a 72px pill.
 */
export function TopMovers({ week, paid }: { week: MoverRow<HeroCard>[]; paid: MoverRow<HeroCard>[] }) {
  const [picked, setPicked] = useState<MoverBasis>("week");
  const basis: MoverBasis = paid.length ? picked : "week";
  const rows = basis === "week" ? week : paid;
  return (
    <section aria-labelledby="top-movers-title" data-movers={basis} className={`${tile} p-0`}>
      <div className="flex items-start justify-between gap-2 px-3.5 pt-3.5 pb-2">
        <div className="min-w-0">
          <h2 id="top-movers-title" className="text-[15px] leading-5 font-semibold tracking-tight">
            {HEADING[basis]}
          </h2>
          <p className={`mt-0.5 text-xs leading-4 ${muted}`}>{SUBLINE[basis]}</p>
        </div>
        {paid.length ? (
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
      {rows.length ? (
        <ul className="divide-y divide-zinc-950/[0.06] pb-1 dark:divide-white/[0.06]">
          {rows.map((row) => (
            <MoverItem key={row.card.id} row={row} basis={basis} />
          ))}
        </ul>
      ) : (
        <div className="px-3.5 pt-1 pb-3.5" data-slot="movers-empty">
          <p className="text-sm font-medium">No price moves this week yet</p>
          <p className={`mt-0.5 text-xs leading-4 ${muted}`}>
            Moves show here once your cards have a few days of recent sold prices.
          </p>
        </div>
      )}
    </section>
  );
}

function MoverItem({ row, basis }: { row: MoverRow<HeroCard>; basis: MoverBasis }) {
  const rowTone: ChangeTone = row.fresh ? "flat" : pctTone(row.pct);
  const word = rowTone === "flat" ? "unchanged" : `${rowTone} ${formatPct(row.pct, false)}`;
  const last = row.points[row.points.length - 1]?.value ?? 0;
  const spark = row.points.length >= 2;
  // Since you paid: what was paid goes under the name. Only cards with a paid value get here.
  const paidLine = basis === "paid" && row.card.paid != null && row.card.paid > 0;
  return (
    <li>
      <Link
        href={`/cards/${row.card.id}`}
        className="flex min-h-14 items-center gap-2.5 px-3.5 py-1.5 outline-none hover:bg-zinc-50 focus-visible:bg-zinc-50 dark:hover:bg-white/[0.03] dark:focus-visible:bg-white/[0.03]"
      >
        <ShapedCardThumb card={row.card.card} className="h-11 w-[33px] shrink-0 rounded-md" landscapeClassName="h-[33px] w-11 shrink-0 rounded-md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm leading-5 font-medium" title={row.card.playerName}>
            {row.card.playerName}
          </span>
          {paidLine ? (
            <span className={`block text-xs leading-4 tabular-nums ${muted}`}>Paid {money(row.card.paid as number).replace(/\.00$/, "")}</span>
          ) : (
            <span className={`block truncate text-xs leading-4 max-[359px]:hidden ${muted}`}>{cardTitle(row.card.card)}</span>
          )}
        </span>
        {/* 64x24, reserved, so a row never shifts. Always brand purple, like the collection chart. */}
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
        ) : null}
        <span
          data-gain={rowTone}
          className={`inline-flex h-6 w-[72px] shrink-0 items-center justify-center gap-1 rounded-full text-xs font-semibold tabular-nums ${MOVE_PILL[rowTone]}`}
        >
          {row.fresh ? "New" : (
            <>
              <MoveArrow tone={rowTone} />
              {formatPct(row.pct)}
            </>
          )}
        </span>
      </Link>
    </li>
  );
}

"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ShapedCardThumb } from "@/components/card-thumb";
import { ValueChart } from "@/components/charts/value-chart";
import { formatPct, pctTone } from "@/lib/chart/range";
import { PILL_TONE, collectionMinSpan } from "@/lib/chart/theme";
import type { MoverCard, Movers } from "@/lib/collection/value-series";
import { cardTitle, money } from "@/lib/format";
import type { SportsCard } from "@/lib/types";

/** A held card as the collection block reads it. */
export type HeroCard = MoverCard & { card: SportsCard };

/** The collection block's card and muted text, shared with the hero. */
export const tile =
  "min-w-0 rounded-2xl border border-zinc-950/[0.08] bg-white p-3.5 dark:border-white/10 dark:bg-white/[0.03]";
export const muted = "text-zinc-500 dark:text-zinc-400";

/**
 * Top movers in the collection, under the hero: 56px rows with the card, a
 * 64x24 spark (or "Paid $X" with no history) and a 72px pill.
 */
export function TopMovers({ movers }: { movers: Movers<HeroCard> }) {
  const basis = movers.basis === "history" ? "Past 30 days" : "Since you paid";
  return (
    <section aria-labelledby="top-movers-title" className={`${tile} p-0`}>
      <div className="px-3.5 pt-3.5 pb-2">
        <h2 id="top-movers-title" className="text-[15px] leading-5 font-semibold tracking-tight">
          Top movers in your collection
        </h2>
        {movers.rows.length ? <p className={`mt-0.5 text-xs leading-4 ${muted}`}>{basis}</p> : null}
      </div>
      {movers.rows.length ? (
        <ul className="divide-y divide-zinc-950/[0.06] pb-1 dark:divide-white/[0.06]">
          {movers.rows.map((row) => {
            const rowTone = pctTone(row.pct);
            const word = rowTone === "flat" ? "unchanged" : `${rowTone} ${formatPct(row.pct, false)}`;
            const last = row.points[row.points.length - 1]?.value ?? 0;
            // No history ("Since you paid"): what was paid goes under the name, and the name gets the width.
            const spark = row.points.length >= 2;
            return (
              <li key={row.card.id}>
                <Link
                  href={`/cards/${row.card.id}`}
                  className="flex min-h-14 items-center gap-2.5 px-3.5 py-1.5 outline-none hover:bg-zinc-50 focus-visible:bg-zinc-50 dark:hover:bg-white/[0.03] dark:focus-visible:bg-white/[0.03]"
                >
                  <ShapedCardThumb card={row.card.card} className="h-11 w-[33px] shrink-0 rounded-md" landscapeClassName="h-[33px] w-11 shrink-0 rounded-md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm leading-5 font-medium" title={row.card.playerName}>
                      {row.card.playerName}
                    </span>
                    {spark ? (
                      <span className={`block truncate text-xs leading-4 max-[359px]:hidden ${muted}`}>{cardTitle(row.card.card)}</span>
                    ) : row.card.paid != null ? (
                      <span className={`block text-xs leading-4 tabular-nums ${muted}`}>Paid {money(row.card.paid).replace(/\.00$/, "")}</span>
                    ) : null}
                  </span>
                  {/* 64x24, reserved, so a row never shifts. */}
                  {spark ? (
                    <span data-spark-slot="" className="flex h-6 w-16 shrink-0 items-center">
                      <ValueChart
                        variant="spark"
                        points={row.points}
                        tone={rowTone}
                        height={24}
                        minSpan={collectionMinSpan(last)}
                        ariaLabel={`${row.card.playerName}, ${word} past 30 days`}
                      />
                    </span>
                  ) : null}
                  <span
                    data-gain={rowTone}
                    className={`inline-flex h-6 w-[72px] shrink-0 items-center justify-center gap-0.5 rounded-full text-xs font-semibold tabular-nums ${PILL_TONE[rowTone]}`}
                  >
                    {/* ArrowUpRight turned a quarter is ArrowDownRight, without a second icon in the bundle. */}
                    {rowTone === "flat" ? null : (
                      <ArrowUpRight className={`h-4 w-4 shrink-0 ${rowTone === "down" ? "rotate-90" : ""}`} strokeWidth={1.5} aria-hidden />
                    )}
                    {formatPct(row.pct)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={`px-3.5 pt-1 pb-3.5 text-sm ${muted}`}>
          Add what you paid on a card with a value to see your top movers.
        </p>
      )}
    </section>
  );
}

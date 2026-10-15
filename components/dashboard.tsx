"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, TrendingDown, TrendingUp, WalletCards } from "lucide-react";
import { outlineButton, solidButton } from "@/components/button-styles";
import { useCollection } from "@/components/collection-provider";
import { CardThumb } from "@/components/card-thumb";
import { CollectionSkeleton, EmptyState } from "@/components/status";
import {
  cardSubtitle,
  cardTitle,
  isSold,
  money,
  pct,
  profit,
  profitPct,
  signedMoney,
} from "@/lib/format";
import {
  matchesFilter,
  matchesQuery,
  sortCards,
  summarize,
} from "@/lib/portfolio";
import type { PortfolioFilter } from "@/lib/types";

const FILTERS: { id: PortfolioFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "held", label: "Held" },
  { id: "sold", label: "Sold" },
  { id: "profit", label: "Profit" },
  { id: "loss", label: "Loss" },
];

export function Dashboard() {
  const { cards, ready, syncError } = useCollection();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PortfolioFilter>("all");

  const totals = useMemo(() => summarize(cards), [cards]);
  const profitTotal = totals.unrealizedProfit + totals.realizedProfit;
  const visible = useMemo(
    () =>
      sortCards(
        cards.filter(
          (card) => matchesQuery(card, query) && matchesFilter(card, filter),
        ),
      ),
    [cards, query, filter],
  );

  if (!ready) return <CollectionSkeleton />;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Your book</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Collection</h1>
        {syncError ? (
          <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{syncError}</p>
        ) : null}
      </div>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="Total invested"
          value={money(totals.invested)}
          hint={`${totals.heldCount} cards in hand`}
        />
        <Stat
          label="Estimated value"
          value={money(totals.estimatedValue)}
          hint="Held book value"
        />
        <Stat
          label="Profit"
          value={signedMoney(profitTotal)}
          hint={`${signedMoney(totals.unrealizedProfit)} open · ${signedMoney(totals.realizedProfit)} realized`}
          tone={profitTotal >= 0 ? "up" : "down"}
        />
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search player, set, year…"
            className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pr-3 pl-10 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                filter === item.id
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<WalletCards className="h-5 w-5" />}
          title={cards.length === 0 ? "No cards yet" : "No cards match"}
          detail={
            cards.length === 0
              ? "Add a pickup to start tracking what you paid and what it's worth."
              : "Nothing in your book matches that search or filter."
          }
        >
          {cards.length === 0 ? (
            <Link href="/cards/new" className={solidButton}>
              Add your first card
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
              className={outlineButton}
            >
              Clear filters
            </button>
          )}
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {visible.map((card) => {
            const p = profit(card);
            const sold = isSold(card);
            return (
              <li key={card.id}>
                <Link
                  href={`/cards/${card.id}`}
                  className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-3 transition hover:border-zinc-300 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20 dark:hover:bg-white/[0.06]"
                >
                  <CardThumb
                    card={card}
                    className="h-24 w-[68px] shrink-0 rounded-lg"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="truncate font-semibold">{card.playerName}</p>
                        <p className="truncate text-sm text-zinc-400">
                          {cardTitle(card)}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {cardSubtitle(card)}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          sold
                            ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                            : "bg-violet-500/15 text-violet-700 dark:text-violet-300"
                        }`}
                      >
                        {sold ? "Sold" : "Held"}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-zinc-400">
                        Paid {money(card.purchasePrice)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 font-medium ${
                          p >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {p >= 0 ? (
                          <TrendingUp className="h-3.5 w-3.5" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5" />
                        )}
                        {signedMoney(p)} {pct(profitPct(card))}
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-white/[0.03]">
      <p className="text-xs tracking-wide text-zinc-400 uppercase">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tracking-tight ${
          tone === "up"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "down"
              ? "text-rose-600 dark:text-rose-400"
              : ""
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-zinc-500">{hint}</p>
    </div>
  );
}

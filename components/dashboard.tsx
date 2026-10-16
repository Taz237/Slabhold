"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, TrendingDown, TrendingUp, WalletCards } from "lucide-react";
import { outlineButton, solidButton } from "@/components/button-styles";
import { CategoryBadge } from "@/components/category-picker";
import { useCollection } from "@/components/collection-provider";
import { CardThumb } from "@/components/card-thumb";
import { CollectionSkeleton, EmptyState } from "@/components/status";
import {
  cardSubtitle,
  cardTitle,
  isSold,
  money,
  pct,
  signedMoney,
} from "@/lib/format";
import { categoryLabel } from "@/lib/card-category";
import {
  cardProfit,
  cardProfitPct,
  matchesCategory,
  matchesFilter,
  matchesQuery,
  sortCards,
  summarize,
} from "@/lib/portfolio";
import type { CardCategory, PortfolioFilter } from "@/lib/types";
import { useCardValues } from "@/lib/value/use-card-values";

const LANES: { id: "all" | CardCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "flipping", label: "Flipping" },
  { id: "pc", label: "PC" },
];

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
  const [lane, setLane] = useState<(typeof LANES)[number]["id"]>("all");

  const cardIds = useMemo(() => cards.map((card) => card.id), [cards]);
  const { values } = useCardValues(cardIds);

  const inLane = useMemo(
    () => cards.filter((card) => matchesCategory(card, lane)),
    [cards, lane],
  );
  const totals = useMemo(() => summarize(inLane, values), [inLane, values]);
  const profitTotal = totals.unrealizedProfit + totals.realizedProfit;
  const visible = useMemo(
    () =>
      sortCards(
        inLane.filter(
          (card) =>
            matchesQuery(card, query) && matchesFilter(card, filter, values),
        ),
        values,
      ),
    [inLane, query, filter, values],
  );

  if (!ready) return <CollectionSkeleton />;

  const valueHint =
    totals.withoutValueCount > 0
      ? `${totals.withoutValueCount} card${totals.withoutValueCount === 1 ? "" : "s"} without a value yet`
      : "Held book value";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Your book</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Collection</h1>
        {syncError ? (
          <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{syncError}</p>
        ) : null}
      </div>
      <div className="grid grid-cols-3 rounded-full bg-zinc-100 p-1 dark:bg-white/10" role="tablist" aria-label="Collection">
        {LANES.map((item) => {
          const selected = lane === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setLane(item.id)}
              className={`min-h-11 rounded-full text-sm font-bold ${
                selected
                  ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-zinc-100"
                  : "text-zinc-500"
              }`}
            >
              {item.label}
            </button>
          );
        })}
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
          hint={valueHint}
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
          title={
            cards.length === 0
              ? "No cards yet"
              : inLane.length === 0
                ? `No ${categoryLabel(lane === "pc" ? "pc" : "flipping")} cards`
                : "No cards match"
          }
          detail={
            cards.length === 0
              ? "Add a pickup to start tracking what you paid and what it's worth."
              : inLane.length === 0
                ? "Cards you add here will show up in this tab."
                : "Nothing in this tab matches that search or filter."
          }
        >
          {cards.length === 0 ? (
            <Link href="/cards/new" className={solidButton}>
              Add your first card
            </Link>
          ) : inLane.length === 0 ? (
            <button type="button" onClick={() => setLane("all")} className={outlineButton}>
              Show all cards
            </button>
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
            const p = cardProfit(card, values);
            const pPct = cardProfitPct(card, values);
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
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <CategoryBadge card={card} />
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
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-zinc-400">
                        Paid {money(card.purchasePrice)}
                      </span>
                      {p == null || pPct == null ? (
                        <span className="text-zinc-400">—</span>
                      ) : (
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
                          {signedMoney(p)} {pct(pPct)}
                        </span>
                      )}
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

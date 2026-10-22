"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Info, Search, TrendingDown, TrendingUp, WalletCards } from "lucide-react";
import { outlineButton } from "@/components/button-styles";
import { CategoryBadge } from "@/components/category-picker";
import { CollectionHeader } from "@/components/collection-header";
import { CollectionValueHistory } from "@/components/collection-value-history";
import { useCollection } from "@/components/collection-provider";
import { CardThumb } from "@/components/card-thumb";
import { CollectionLaneEmpty } from "@/components/collection-lane-empty";
import { FirstCardWelcome } from "@/components/first-card-welcome";
import { shouldShowFirstCardWelcome } from "@/lib/collection/welcome";
import { CollectionSkeleton, EmptyState } from "@/components/status";
import {
  cardTitle,
  formatPaidLabel,
  hasPaid,
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
import {
  needsDetails,
  needsDetailsLabel,
  type CardCategory,
  type PortfolioFilter,
} from "@/lib/types";
import { displayedCollectionTotal } from "@/lib/collection/displayed-value";
import {
  investedAmountLabel,
  investedCardLabel,
  profitAmountLabel,
  profitAmountTone,
  profitCardLabel,
  sumPaid,
} from "@/lib/collection/profit-label";
import { EbaySoldLink } from "@/components/ebay-sold-link";
import { resolvePriceRead, tilePriceText } from "@/lib/value/price-fallback";
import { ebaySoldSearchUrlForCard } from "@/lib/value/ebay-sold";
import { useCardValues } from "@/lib/value/use-card-values";
import { WantList } from "@/components/want-list";
import { PullToRefresh } from "@/components/pull-to-refresh";

const LANES: { id: "all" | CardCategory | "wants"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "flipping", label: categoryLabel("flipping") },
  { id: "pc", label: categoryLabel("pc") },
  { id: "wants", label: "Want list" },
];

const FILTERS: { id: PortfolioFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "held", label: "Held" },
  { id: "sold", label: "Sold" },
  { id: "profit", label: "Profit" },
  { id: "loss", label: "Loss" },
];

export function Dashboard() {
  const { cards, ready, syncError, reload } = useCollection();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PortfolioFilter>("all");
  const [lane, setLane] = useState<(typeof LANES)[number]["id"]>("all");
  const summaryLane = lane === "wants" ? "all" : lane;

  const cardIds = useMemo(() => cards.map((card) => card.id), [cards]);
  const {
    values,
    loading: valuesLoading,
    error: valuesError,
    errorMessage: valuesMessage,
    retry: retryValues,
  } = useCardValues(cardIds);
  const valuesFailed = valuesError && !valuesLoading;

  const inLane = useMemo(
    () => cards.filter((card) => matchesCategory(card, summaryLane)),
    [cards, summaryLane],
  );
  const totals = useMemo(() => summarize(inLane, values), [inLane, values]);
  const collectionValue = useMemo(
    () => displayedCollectionTotal(inLane, values),
    [inLane, values],
  );
  const profitTotal = totals.unrealizedProfit + totals.realizedProfit;
  const pricedCount = totals.pricedCount;
  const cardCount = inLane.length;
  const paidCount = inLane.filter((card) => hasPaid(card)).length;
  const investedAmount = sumPaid(inLane);
  const profitTone = profitAmountTone(pricedCount, profitTotal);
  const visible = useMemo(
    () =>
      sortCards(
        inLane.filter(
          (card) =>
            matchesQuery(card, query) && matchesFilter(card, filter, values),
        ),
      ),
    [inLane, query, filter, values],
  );

  function refreshCollection() {
    reload();
    retryValues();
  }

  if (!ready) {
    return (
      <PullToRefresh onRefresh={refreshCollection}>
        <CollectionSkeleton />
      </PullToRefresh>
    );
  }

  const valueHint =
    totals.withoutValueCount > 0
      ? `${totals.withoutValueCount} card${totals.withoutValueCount === 1 ? "" : "s"} without a value yet`
      : "Held book value";
  const investedLabel = investedCardLabel(paidCount, cardCount);
  const profitLabel = profitCardLabel(pricedCount, cardCount);

  return (
    <PullToRefresh onRefresh={refreshCollection}>
    <div className="space-y-6">
      <CollectionHeader />
      {syncError ? (
        <p className="text-sm text-rose-600 dark:text-rose-400">{syncError}</p>
      ) : null}
      {cards.length === 0 ? null : (
        <CollectionValueHistory
          currentValue={collectionValue}
          valueLoading={valuesLoading}
          valueError={valuesFailed}
          onRetry={retryValues}
        />
      )}
      <div className="grid grid-cols-4 rounded-full bg-zinc-100 p-1 dark:bg-white/10" role="tablist" aria-label="Collection">
        {LANES.map((item) => {
          const selected = lane === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setLane(item.id)}
              className={`min-h-11 rounded-full px-1 text-[11px] font-bold sm:text-sm ${
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
      {cards.length === 0 ? null : (
      <>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="Total invested"
          value={investedAmountLabel(investedAmount)}
          hint={investedLabel}
          tone={paidCount > 0 ? undefined : "neutral"}
        />
        <Stat
          label="Estimated value"
          value={valuesFailed ? "" : money(collectionValue)}
          hint={valuesFailed ? "" : valueHint}
          message={
            valuesFailed ? (
              <ValuesRetry onRetry={retryValues} detail={valuesMessage} />
            ) : undefined
          }
          loading={valuesLoading}
        />
        <Stat
          label="Profit"
          value={valuesFailed ? "" : profitAmountLabel(pricedCount, profitTotal)}
          hint={valuesFailed || profitLabel === "—" ? "" : profitLabel}
          tone={profitTone}
          message={
            valuesFailed ? (
              <ValuesRetry onRetry={retryValues} detail={valuesMessage} />
            ) : undefined
          }
          loading={valuesLoading}
        />
      </section>
      <p className="flex items-start gap-1.5 text-xs text-zinc-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Profit only includes cards with a price paid and a current value.
      </p>
      </>
      )}

      {cards.length === 0 ? (
        lane === "wants" ? (
          <WantList />
        ) : syncError ? null : lane === "flipping" || lane === "pc" ? (
          <CollectionLaneEmpty lane={lane} />
        ) : shouldShowFirstCardWelcome({ cardCount: cards.length, ready, syncError }) ? (
          <FirstCardWelcome />
        ) : null
      ) : lane === "wants" ? (
        <WantList />
      ) : (
      <>
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
        inLane.length === 0 && (lane === "flipping" || lane === "pc") ? (
          <CollectionLaneEmpty lane={lane} onShowAll={() => setLane("all")} />
        ) : (
        <EmptyState
          icon={<WalletCards className="h-5 w-5" />}
          title="No cards match"
          detail="Nothing in this tab matches that search or filter."
        >
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
        </EmptyState>
        )
      ) : (
        <ul
          className="grid gap-3"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          }}
        >
          {visible.map((card) => {
            const value = values.get(card.id);
            const p = cardProfit(card, values);
            const pPct = cardProfitPct(card, values);
            const sold = isSold(card);
            const paid = card.purchasePrice;
            const valuePending = !sold && valuesLoading;
            const priceRead = sold
              ? null
              : resolvePriceRead({
                  value,
                  createdAt: card.createdAt,
                  similar: value?.similar,
                  ebayHref: ebaySoldSearchUrlForCard(card),
                  card,
                });
            const showProfit =
              !valuePending &&
              hasPaid(card) &&
              p != null &&
              pPct != null &&
              (sold || priceRead?.kind === "estimate");
            const valueLabel = sold
              ? card.sellPrice != null
                ? money(card.sellPrice)
                : "—"
              : valuePending
                ? null
                : valuesFailed
                  ? "—"
                  : priceRead
                    ? tilePriceText(priceRead)
                    : null;
            const tileEbay =
              !sold && !valuePending && !valuesFailed && priceRead?.showEbaySold
                ? ebaySoldSearchUrlForCard(card)
                : null;
            const titleText = card.playerName;
            const subtitleText = cardTitle(card);
            const grade = card.grade.trim();
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
                    <p className="font-semibold" title={titleText}>
                      {titleText}
                    </p>
                    <p className="text-sm text-zinc-400" title={subtitleText}>
                      {subtitleText}
                    </p>
                    <div className="mt-1.5 flex min-w-0 flex-wrap gap-1">
                      <CategoryBadge card={card} />
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          card.isPublic
                            ? "bg-zinc-900/10 text-zinc-700 dark:bg-white/10 dark:text-zinc-200"
                            : "bg-zinc-100 text-zinc-500 dark:bg-white/5 dark:text-zinc-400"
                        }`}
                      >
                        {card.isPublic ? "Public" : "Private"}
                      </span>
                      {needsDetails(card) ? (
                        <span
                          className="max-w-full truncate rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300"
                          title={needsDetailsLabel(card)}
                        >
                          {needsDetailsLabel(card)}
                        </span>
                      ) : null}
                      {card.isRookie ? (
                        <span className="rounded-full bg-zinc-900/10 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-white/10 dark:text-zinc-200">
                          RC
                        </span>
                      ) : null}
                      {grade ? (
                        <span
                          className="max-w-full truncate rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-300"
                          title={grade}
                        >
                          {grade}
                        </span>
                      ) : null}
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${
                          sold
                            ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                            : "bg-violet-500/15 text-violet-700 dark:text-violet-300"
                        }`}
                        title={sold ? "Sold" : "Held"}
                      >
                        {sold ? "Sold" : "Held"}
                      </span>
                    </div>
                    <div className="mt-3 flex min-w-0 items-start justify-between gap-2 text-sm">
                      <span className="text-zinc-400">
                        Paid {formatPaidLabel(paid)}
                      </span>
                      <div className="min-w-0 text-right">
                        {valuePending ? (
                          <span
                            className="mt-0.5 inline-block h-4 w-20 animate-pulse rounded bg-zinc-200/80 dark:bg-white/10"
                            aria-hidden
                          />
                        ) : (
                          <p
                            className="truncate font-medium whitespace-nowrap tabular-nums"
                            title={valueLabel ?? undefined}
                          >
                            {valueLabel}
                          </p>
                        )}
                        {showProfit ? (
                          <p
                            className={`mt-0.5 text-xs font-medium ${
                              p >= 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                            }`}
                            title={`${signedMoney(p)} ${pct(pPct)}`}
                          >
                            <span className="inline-flex items-center gap-0.5">
                              {p >= 0 ? (
                                <TrendingUp className="h-3 w-3 shrink-0" />
                              ) : (
                                <TrendingDown className="h-3 w-3 shrink-0" />
                              )}
                              {signedMoney(p)} {pct(pPct)}
                            </span>
                          </p>
                        ) : !valuePending && !hasPaid(card) ? (
                          <p className="mt-0.5 text-xs text-zinc-400">—</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </Link>
                {tileEbay ? (
                  <p className="px-1 pt-1 text-xs text-zinc-500">
                    <EbaySoldLink href={tileEbay} />
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      </>
      )}
    </div>
    </PullToRefresh>
  );
}

function ValuesRetry({
  onRetry,
  detail,
}: {
  onRetry: () => void;
  detail?: string | null;
}) {
  return (
    <p>
      {detail ?? "Couldn't load values."}{" "}
      <button type="button" onClick={onRetry} className="font-semibold underline">
        Retry
      </button>
    </p>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
  loading,
  message,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "up" | "down" | "neutral";
  loading?: boolean;
  message?: ReactNode;
}) {
  const toneClass =
    tone === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "down"
        ? "text-rose-600 dark:text-rose-400"
        : tone === "neutral"
          ? "text-zinc-500"
          : "";
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-white/[0.03]">
      <p className="text-xs tracking-wide text-zinc-400 uppercase">{label}</p>
      {loading ? (
        <>
          <div
            className="mt-2 h-8 w-24 animate-pulse rounded-md bg-zinc-200/80 dark:bg-white/10"
            aria-hidden
          />
          <div
            className="mt-2 h-3 w-36 max-w-full animate-pulse rounded-full bg-zinc-200/70 dark:bg-white/[0.06]"
            aria-hidden
          />
          <span className="sr-only">Loading {label}</span>
        </>
      ) : message ? (
        <div className="mt-1 text-sm font-medium leading-snug text-zinc-800 dark:text-zinc-100">
          {message}
        </div>
      ) : (
        <>
          <p className={`mt-1 text-2xl font-semibold tracking-tight ${toneClass}`}>
            {value}
          </p>
          {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
        </>
      )}
    </div>
  );
}

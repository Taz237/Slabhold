"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { CardThumb } from "@/components/card-thumb";
import { useCollection } from "@/components/collection-provider";
import { displayedCollectionTotal } from "@/lib/collection/displayed-value";
import {
  collectionDayChange,
  collectionTodayDismissKey,
  hasValuedMedians,
  shouldShowCollectionToday,
  topCollectionMovers,
} from "@/lib/collection/today";
import { money, signedMoney } from "@/lib/format";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { useCardValues } from "@/lib/value/use-card-values";

type DayRow = { date: string; value: number };
type SnapRow = { cardId: string; date: string; median: number | null };

export function CollectionToday() {
  const { cards } = useCollection();
  const cardIds = useMemo(() => cards.map((card) => card.id), [cards]);
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [days, setDays] = useState<DayRow[] | null>(null);
  const [snaps, setSnaps] = useState<SnapRow[] | null>(null);

  useEffect(() => {
    const key = collectionTodayDismissKey();
    setDismissed(window.localStorage.getItem(key) === "1");
  }, []);

  useEffect(() => {
    if (dismissed !== false) return;
    const supabase = createSupabaseBrowser();
    if (!supabase) {
      setDays([]);
      setSnaps([]);
      return;
    }
    let cancelled = false;
    void supabase
      .from("collection_snapshots")
      .select("snapshot_date, value")
      .order("snapshot_date", { ascending: true })
      .then(async ({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setDays([]);
          setSnaps([]);
          return;
        }
        const loaded = (data ?? []).map((row) => ({
          date: String(row.snapshot_date),
          value: Number(row.value) || 0,
        }));
        setDays(loaded);
        const change = collectionDayChange(loaded);
        if (!change) {
          setSnaps([]);
          return;
        }
        const { data: cardRows, error: cardError } = await supabase
          .from("card_value_snapshots")
          .select("card_id, snapshot_date, median")
          .in("snapshot_date", [change.previousDate, change.latestDate]);
        if (cancelled) return;
        if (cardError) {
          setSnaps([]);
          return;
        }
        setSnaps(
          (cardRows ?? []).map((row) => ({
            cardId: String(row.card_id),
            date: String(row.snapshot_date),
            median: row.median == null ? null : Number(row.median),
          })),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [dismissed]);

  const { values, loading: valuesLoading, error: valuesError } = useCardValues(
    dismissed === false ? cardIds : [],
  );
  const liveValue = useMemo(
    () => displayedCollectionTotal(cards, values),
    [cards, values],
  );

  if (dismissed !== false || !days || !snaps) return null;

  const change = collectionDayChange(days);
  if (!change) return null;
  const todayValue =
    valuesLoading || valuesError ? change.latest : liveValue;
  const delta = todayValue - change.previous;
  const latestMedians = snaps
    .filter((row) => row.date === change.latestDate)
    .map((row) => row.median);
  if (!shouldShowCollectionToday(2, hasValuedMedians(latestMedians))) return null;

  const movers = topCollectionMovers(snaps, change.latestDate, change.previousDate);
  const byId = new Map(cards.map((card) => [card.id, card]));
  const phrase =
    delta > 0
      ? `up ${money(delta)} since yesterday`
      : delta < 0
        ? `down ${money(Math.abs(delta))} since yesterday`
        : "flat since yesterday";
  const tone =
    delta > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : delta < 0
        ? "text-rose-600 dark:text-rose-400"
        : "text-zinc-500";

  function dismiss() {
    window.localStorage.setItem(collectionTodayDismissKey(), "1");
    setDismissed(true);
  }

  function moverRow(cardId: string, delta: number) {
    const card = byId.get(cardId);
    const up = delta > 0;
    return (
      <li key={cardId} className="flex min-w-0 items-center gap-2">
        <CardThumb
          card={{
            playerName: card?.playerName ?? "Card",
            photoDataUrl: card?.photoDataUrl ?? null,
            accent: card?.accent ?? "#7c5cff",
          }}
          className="h-8 w-8 shrink-0 rounded-md"
        />
        <span className="min-w-0 flex-1 truncate text-sm">{card?.playerName ?? "Card"}</span>
        <span
          className={`shrink-0 text-sm font-semibold tabular-nums ${
            up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
          }`}
        >
          {signedMoney(delta)}
        </span>
      </li>
    );
  }

  return (
    <section className="border-b border-zinc-200 px-4 py-3 dark:border-white/10">
      <div className="relative rounded-2xl border border-zinc-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.03]">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss for today"
          className="absolute top-2 right-2 grid h-8 w-8 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
        <Link href="/collection" className="block pr-8">
          <p className="text-sm leading-5">
            <span className="font-semibold">Your collection today:</span> {money(todayValue)},{" "}
            <span className={`font-semibold ${tone}`}>{phrase}</span>
          </p>
          {movers.gainers.length > 0 || movers.losers.length > 0 ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {movers.gainers.length > 0 ? (
                <div className="min-w-0">
                  <p className="mb-1.5 text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
                    Gainers
                  </p>
                  <ul className="space-y-1.5">{movers.gainers.map((row) => moverRow(row.cardId, row.delta))}</ul>
                </div>
              ) : null}
              {movers.losers.length > 0 ? (
                <div className="min-w-0">
                  <p className="mb-1.5 text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
                    Losers
                  </p>
                  <ul className="space-y-1.5">{movers.losers.map((row) => moverRow(row.cardId, row.delta))}</ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </Link>
      </div>
    </section>
  );
}

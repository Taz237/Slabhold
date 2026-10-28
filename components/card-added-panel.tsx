"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Check, X } from "lucide-react";
import { useCollection } from "@/components/collection-provider";
import { addedCollectionLine, addedValueLine } from "@/lib/cards/added-panel";
import { useCardValues } from "@/lib/value/use-card-values";
import type { CardValueResult } from "@/lib/value/types";

/**
 * Shown once on the card page right after Add card.
 * Reads card_values only. No Trawl call of its own.
 */
export function CardAddedPanel({
  cardId,
  value,
  loading,
  onDismiss,
  onSeeSales,
}: {
  cardId: string;
  value: CardValueResult | null;
  loading: boolean;
  onDismiss: () => void;
  onSeeSales: () => void;
}) {
  const { cards } = useCollection();
  const ids = useMemo(() => cards.map((card) => card.id), [cards]);
  const book = useCardValues(ids);
  const values = useMemo(() => {
    if (!value) return book.values;
    const next = new Map(book.values);
    next.set(cardId, value);
    return next;
  }, [book.values, cardId, value]);
  const valueLine = addedValueLine(value, loading);
  const collectionLine = addedCollectionLine(cards, values, !book.loading && !book.error);

  return (
    <section
      aria-label="Added to your collection"
      className="relative overflow-hidden rounded-2xl border border-violet-400/30 bg-violet-500/10 p-4 sm:p-5"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute top-1.5 right-1.5 grid size-11 place-items-center rounded-full text-zinc-500 hover:bg-zinc-900/5 hover:text-zinc-800 dark:hover:bg-white/10 dark:hover:text-zinc-200"
      >
        <X className="size-4" aria-hidden />
      </button>
      <div className="flex items-center gap-2 pr-10">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-violet-600 text-white">
          <Check className="size-3.5" strokeWidth={3} aria-hidden />
        </span>
        <h2 className="text-base font-bold tracking-tight">Added to your collection</h2>
      </div>
      <p
        aria-live="polite"
        className={`mt-3 text-sm ${
          valueLine.kind === "ok"
            ? "font-semibold text-zinc-900 dark:text-zinc-50"
            : "text-zinc-700 dark:text-zinc-300"
        }`}
      >
        {valueLine.kind === "pending" ? (
          <span
            aria-hidden
            className="mr-2 inline-block size-2 rounded-full bg-violet-500 align-middle motion-safe:animate-pulse"
          />
        ) : null}
        {valueLine.text}
        {valueLine.kind === "no_sales" ? (
          <>
            {" "}
            <Link
              href={`/cards/${cardId}/edit`}
              className="font-semibold text-violet-700 underline underline-offset-2 dark:text-violet-300"
            >
              Check the card details
            </Link>
          </>
        ) : null}
      </p>
      <p className="mt-1 text-sm text-zinc-500 tabular-nums">{collectionLine}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link
          href="/cards/new"
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-500"
        >
          Add another card
        </Link>
        <button
          type="button"
          onClick={onSeeSales}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-300 bg-white/60 px-4 text-sm font-semibold text-zinc-800 hover:bg-white dark:border-white/15 dark:bg-white/5 dark:text-zinc-100 dark:hover:bg-white/10"
        >
          See sales
        </button>
      </div>
    </section>
  );
}

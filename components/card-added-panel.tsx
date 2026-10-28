"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { CardSlabArt } from "@/components/card-slab-art";
import { tileArtCard } from "@/components/card-tile";
import { useCollection } from "@/components/collection-provider";
import {
  addedCollectionLine,
  addedValueLine,
  recentSoldPrices,
  type AddedRevealLine,
} from "@/lib/cards/added-panel";
import { photoSource, photoStatusAfter, type PhotoStatus } from "@/lib/collection/grid";
import type { SportsCard } from "@/lib/types";
import type { ConfidenceCopy, MatchConfidence } from "@/lib/value/match-confidence";
import { useCardValues } from "@/lib/value/use-card-values";
import type { CardValueResult } from "@/lib/value/types";

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]";

/**
 * Shown once on the card page right after Add card: the slab reveal, its value,
 * and up to three recent sold prices. Reads card_values and the sold comps the
 * card page already loaded. No fetch of its own for prices.
 */
export function CardAddedPanel({
  cardId,
  value,
  loading,
  sales = null,
  salesLoading = false,
  confidence = "strong",
  copy = null,
  onDismiss,
  onSeeSales,
}: {
  cardId: string;
  value: CardValueResult | null;
  loading: boolean;
  /** The card page's on-screen sold comps. Null until they are ready. */
  sales?: readonly { id?: string; soldPrice: number; soldDate: string }[] | null;
  salesLoading?: boolean;
  confidence?: MatchConfidence;
  copy?: ConfidenceCopy | null;
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
  const card = cards.find((item) => item.id === cardId) ?? null;
  const valueLine = addedValueLine(value, loading, card);
  const line: AddedRevealLine =
    confidence !== "strong" && copy
      ? {
          kind: confidence,
          text: copy.text,
          fix: copy.fix ? { label: copy.fix.label, href: `/cards/${cardId}/edit` } : null,
        }
      : valueLine;
  const collectionLine = addedCollectionLine(cards, values, !book.loading && !book.error);
  // Sold prices only back a strong match. A weak one would read like its price.
  const recent = line.kind === "ok" ? recentSoldPrices(sales) : [];
  const addAnother = card?.sport ? `/cards/new?sport=${encodeURIComponent(card.sport)}` : "/cards/new";

  return (
    <section
      aria-label="Added to your collection"
      data-slot="added-panel"
      className="relative overflow-hidden rounded-3xl border border-violet-400/30 bg-gradient-to-b from-violet-600/15 via-violet-500/5 to-transparent p-4 sm:p-6"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className={`absolute top-1.5 right-1.5 z-10 grid size-11 place-items-center rounded-full text-zinc-500 hover:bg-zinc-900/5 hover:text-zinc-800 dark:hover:bg-white/10 dark:hover:text-zinc-200 ${focusRing}`}
      >
        <X className="size-4" aria-hidden />
      </button>

      <div className="flex flex-col items-center text-center">
        <div className="relative w-36 sm:w-40">
          <span
            aria-hidden
            data-reveal="glow"
            className="pointer-events-none absolute -inset-8 rounded-full bg-violet-600/30 blur-3xl motion-safe:animate-[reveal-glow_900ms_ease-out_both]"
          />
          <div data-reveal="slab" className="relative motion-safe:animate-[slab-reveal_700ms_cubic-bezier(0.2,0.7,0.2,1)_both]">
            {card ? <RevealSlab card={card} /> : <div className="aspect-[3/5] w-full rounded-xl skeleton-shimmer" />}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-violet-600 text-white">
            <Check className="size-3.5" strokeWidth={3} aria-hidden />
          </span>
          <h2 className="text-lg font-extrabold tracking-tight">Added to your collection</h2>
        </div>
        {card ? (
          <p className="mt-0.5 text-sm text-zinc-500">{card.playerName}</p>
        ) : null}

        <div aria-live="polite" className="mt-4 w-full max-w-sm">
          {line.kind === "pending" ? (
            <div className="flex flex-col items-center gap-2" aria-busy="true">
              <span className="skeleton-shimmer block h-7 w-40 rounded-lg" aria-hidden />
              <p className="text-sm text-zinc-500">{line.text}</p>
            </div>
          ) : line.kind === "ok" ? (
            <p className="text-xl font-bold tracking-tight tabular-nums text-zinc-900 dark:text-zinc-50">
              {line.text}
            </p>
          ) : (
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              <span className="block text-base font-semibold text-zinc-900 dark:text-zinc-50">
                {line.text}
              </span>
              {"fix" in line && line.fix ? (
                <Link
                  href={line.fix.href}
                  className="inline-flex min-h-11 items-center font-semibold text-violet-700 underline underline-offset-2 dark:text-[#A78BFA]"
                >
                  {line.fix.label}
                </Link>
              ) : line.kind === "no_sales" ? (
                <Link
                  href={`/cards/${cardId}/edit`}
                  className="inline-flex min-h-11 items-center font-semibold text-violet-700 underline underline-offset-2 dark:text-[#A78BFA]"
                >
                  Check the card details
                </Link>
              ) : null}
            </p>
          )}
        </div>

        {line.kind === "ok" && salesLoading ? (
          <ul className="mt-3 w-full max-w-sm space-y-1.5" aria-hidden>
            {[0, 1, 2].map((row) => (
              <li key={row} className="skeleton-shimmer h-10 rounded-xl" />
            ))}
          </ul>
        ) : recent.length > 0 ? (
          <div className="mt-3 w-full max-w-sm">
            <ul aria-label="Recent sold prices" className="divide-y divide-zinc-200/70 rounded-2xl border border-zinc-200 bg-white/70 text-left dark:divide-white/5 dark:border-white/10 dark:bg-white/[0.03]">
              {recent.map((sale) => (
                <li key={sale.key} className="flex min-h-10 items-center justify-between gap-3 px-3 text-sm">
                  <span className="font-semibold tabular-nums">{sale.priceText}</span>
                  <span className="text-xs text-zinc-500 tabular-nums">{sale.dateText ?? "Recently"}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[11px] text-zinc-500">Recent sold prices via Trawl</p>
          </div>
        ) : null}

        <p className="mt-3 text-sm text-zinc-500 tabular-nums">{collectionLine}</p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Link
          href={addAnother}
          className={`inline-flex min-h-11 items-center justify-center rounded-full bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-500 ${focusRing}`}
        >
          Add another
        </Link>
        <button
          type="button"
          onClick={onSeeSales}
          className={`inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-300 bg-white/60 px-4 text-sm font-semibold text-zinc-800 hover:bg-white dark:border-white/15 dark:bg-white/5 dark:text-zinc-100 dark:hover:bg-white/10 ${focusRing}`}
        >
          See all sales
        </button>
      </div>
    </section>
  );
}

/** The new card's slab, the same art as its Collection tile. */
function RevealSlab({ card }: { card: SportsCard }) {
  const source = photoSource(card.photoDataUrl);
  const [state, setState] = useState<{ src: string | null; status: PhotoStatus }>({
    src: card.photoDataUrl,
    status: "loading",
  });
  const status = state.src === card.photoDataUrl ? state.status : "loading";
  const onStatus = useCallback(
    (event: "load" | "error") =>
      setState((current) => ({
        src: card.photoDataUrl,
        status: photoStatusAfter(current.src === card.photoDataUrl ? current.status : "loading", event),
      })),
    [card.photoDataUrl],
  );
  return (
    <CardSlabArt
      card={tileArtCard(card)}
      index={0}
      source={source}
      status={status}
      onStatus={onStatus}
      sizes="160px"
    />
  );
}

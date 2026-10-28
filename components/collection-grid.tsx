"use client";

import Link from "next/link";
import { useCallback, useState, type CSSProperties } from "react";
import { Camera, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { CardSlabArt } from "@/components/card-slab-art";
import {
  GRID_CLASS,
  photoSource,
  photoStatusAfter,
  showGhostTile,
  showPhotoPlaceholder,
  tileAccessibleName,
  tileGain,
  yearSetLine,
  type PhotoStatus,
} from "@/lib/collection/grid";
import { isSold, money } from "@/lib/format";
import { needsDetails, needsDetailsLabel, type SportsCard } from "@/lib/types";
import { ebaySoldSearchUrlForCard } from "@/lib/value/ebay-sold";
import { resolvePriceRead, tilePriceText } from "@/lib/value/price-fallback";
import type { CardValueResult } from "@/lib/value/types";

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]";

/** Stagger stops after a couple of rows so long grids don't wait. */
const STAGGER_MS = 35;
const STAGGER_CAP = 12;

export function CollectionGrid({
  cards,
  values,
  valuesLoading,
  valuesFailed,
}: {
  cards: SportsCard[];
  values: Map<string, CardValueResult>;
  valuesLoading: boolean;
  valuesFailed: boolean;
}) {
  return (
    <ul className={GRID_CLASS} aria-label="Your cards">
      {cards.map((card, index) => (
        <CollectionTile
          key={card.id}
          card={card}
          index={index}
          values={values}
          valuesLoading={valuesLoading}
          valuesFailed={valuesFailed}
        />
      ))}
      {showGhostTile(cards.length) ? <GhostTile index={cards.length} /> : null}
    </ul>
  );
}

function staggerStyle(index: number): CSSProperties {
  return { animationDelay: `${Math.min(index, STAGGER_CAP) * STAGGER_MS}ms` };
}

function tileValue(
  card: SportsCard,
  values: Map<string, CardValueResult>,
  valuesLoading: boolean,
  valuesFailed: boolean,
) {
  const sold = isSold(card);
  const value = values.get(card.id);
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
  const label = sold
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
  const gain = tileGain(card, values, {
    valuePending,
    estimate: !valuesFailed && priceRead?.kind === "estimate",
  });
  return { sold, valuePending, label, gain };
}

export function CollectionTile({
  card,
  index,
  values,
  valuesLoading,
  valuesFailed,
}: {
  card: SportsCard;
  index: number;
  values: Map<string, CardValueResult>;
  valuesLoading: boolean;
  valuesFailed: boolean;
}) {
  const source = photoSource(card.photoDataUrl);
  const [photo, setPhoto] = useState<{ src: string | null; status: PhotoStatus }>({
    src: card.photoDataUrl,
    status: "loading",
  });
  // A new photo URL starts over, so an old error doesn't stick.
  const status = photo.src === card.photoDataUrl ? photo.status : "loading";
  const onStatus = useCallback(
    (event: "load" | "error") =>
      setPhoto((current) => ({
        src: card.photoDataUrl,
        status: photoStatusAfter(
          current.src === card.photoDataUrl ? current.status : "loading",
          event,
        ),
      })),
    [card.photoDataUrl],
  );

  const { sold, valuePending, label, gain } = tileValue(
    card,
    values,
    valuesLoading,
    valuesFailed,
  );
  const missing = needsDetails(card);
  const name = tileAccessibleName(card, sold && label ? `sold for ${label}` : label);
  const placeholder = showPhotoPlaceholder(source, status);

  return (
    <li
      data-tile={card.id}
      className="relative motion-safe:animate-[tile-in_420ms_cubic-bezier(0.2,0.7,0.2,1)_both]"
      style={staggerStyle(index)}
    >
      <Link
        href={`/cards/${card.id}`}
        aria-label={name}
        className={`group block min-h-11 rounded-xl p-1 transition-transform duration-150 ease-out motion-safe:active:scale-[0.97] ${focusRing}`}
      >
        <div className="[perspective:900px]">
          <div className="relative transition-transform duration-300 ease-out motion-safe:group-hover:[transform:translateY(-4px)_rotateX(5deg)_rotateY(-7deg)]">
            <CardSlabArt
              card={card}
              index={index}
              source={source}
              status={status}
              onStatus={onStatus}
            />
            {sold ? <SoldRibbon /> : null}
          </div>
        </div>
        <div className="mt-2 px-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="min-w-0 truncate text-sm font-semibold tracking-tight">
              {card.playerName}
            </p>
            {card.isRookie ? (
              <span className="shrink-0 rounded bg-violet-500/15 px-1 font-mono text-[9px] leading-4 font-semibold tracking-wider text-violet-700 uppercase dark:text-[#A78BFA]">
                RC
              </span>
            ) : null}
            {missing ? (
              <span
                role="img"
                aria-label={needsDetailsLabel(card)}
                title={needsDetailsLabel(card)}
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
              />
            ) : null}
          </div>
          <p className="truncate text-xs text-zinc-500">{yearSetLine(card)}</p>
          <div className="mt-1 flex min-h-5 min-w-0 items-center justify-between gap-1.5">
            {valuePending ? (
              <span
                className="h-4 w-16 animate-pulse rounded bg-zinc-200/80 dark:bg-white/10"
                aria-hidden
              />
            ) : (
              <p
                className="min-w-0 truncate text-sm font-bold tracking-tight tabular-nums"
                title={label ?? undefined}
              >
                {label}
              </p>
            )}
            {gain ? (
              <span
                data-gain={gain.tone}
                title={`${gain.amountText} ${gain.pctText}`}
                className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                  gain.tone === "up"
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : "bg-rose-500/15 text-rose-700 dark:text-rose-400"
                }`}
              >
                {gain.tone === "up" ? (
                  <TrendingUp className="h-3 w-3" aria-hidden />
                ) : (
                  <TrendingDown className="h-3 w-3" aria-hidden />
                )}
                {gain.pctText}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
      {placeholder ? <AddPhotoHint card={card} /> : null}
    </li>
  );
}

/** Sits over the art, outside the tile link, so links don't nest. */
function AddPhotoHint({ card }: { card: SportsCard }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 p-1">
      <div className="relative aspect-[3/5] w-full">
      <Link
        href={`/cards/${card.id}/edit`}
        aria-label={`Add a photo of ${card.playerName}`}
        onClick={(event) => event.stopPropagation()}
        className={`group/hint pointer-events-auto absolute right-0 bottom-0 rounded-full p-2.5 ${focusRing}`}
      >
        {/* Padding makes the tap target 44px. The pill stays small. */}
        <span className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[10px] font-semibold text-white/90 backdrop-blur-sm transition group-hover/hint:bg-black/60">
          <Camera className="h-3 w-3" aria-hidden />
          Add photo
        </span>
      </Link>
      </div>
    </div>
  );
}

function SoldRibbon() {
  return (
    <span className="pointer-events-none absolute bottom-0 left-0 h-16 w-16 overflow-hidden rounded-bl-lg" aria-hidden>
      <span className="absolute bottom-[14px] left-[-26px] w-[100px] rotate-45 bg-sky-500 py-0.5 text-center font-mono text-[9px] font-bold tracking-widest text-white uppercase shadow-md">
        Sold
      </span>
    </span>
  );
}

function GhostTile({ index }: { index: number }) {
  return (
    <li
      className="motion-safe:animate-[tile-in_420ms_cubic-bezier(0.2,0.7,0.2,1)_both]"
      style={staggerStyle(index)}
    >
      <Link
        href="/cards/new"
        className={`flex aspect-[3/5] min-h-11 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 text-sm font-semibold text-zinc-500 transition hover:border-violet-500 hover:text-violet-600 motion-safe:active:scale-[0.97] dark:border-white/15 dark:hover:border-violet-400 dark:hover:text-[#A78BFA] ${focusRing}`}
      >
        <span className="grid h-10 w-10 place-items-center rounded-full bg-zinc-100 dark:bg-white/5">
          <Plus className="h-5 w-5" aria-hidden />
        </span>
        Add a card
      </Link>
    </li>
  );
}

"use client";

import Link from "next/link";
import { type CSSProperties } from "react";
import { Plus } from "lucide-react";
import { CardTile, tileFocusRing } from "@/components/card-tile";
import {
  GRID_CLASS,
  showGhostTile,
  tileAccessibleName,
  tileGain,
} from "@/lib/collection/grid";
import { isSold, money } from "@/lib/format";
import { needsDetails, needsDetailsLabel, type SportsCard } from "@/lib/types";
import { ebaySoldSearchUrlForCard } from "@/lib/value/ebay-sold";
import { resolvePriceRead, tilePriceText } from "@/lib/value/price-fallback";
import type { CardValueResult } from "@/lib/value/types";

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
  const { sold, valuePending, label, gain } = tileValue(
    card,
    values,
    valuesLoading,
    valuesFailed,
  );

  return (
    <CardTile
      card={card}
      href={`/cards/${card.id}`}
      index={index}
      ariaLabel={tileAccessibleName(card, sold && label ? `sold for ${label}` : label)}
      priceLabel={label}
      pricePending={valuePending}
      gain={gain}
      sold={sold}
      needsDetailsLabel={needsDetails(card) ? needsDetailsLabel(card) : null}
      addPhotoHref={`/cards/${card.id}/edit`}
      className="motion-safe:animate-[tile-in_420ms_cubic-bezier(0.2,0.7,0.2,1)_both]"
      style={staggerStyle(index)}
    />
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
        className={`flex aspect-[3/5] min-h-11 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 text-sm font-semibold text-zinc-500 transition hover:border-violet-500 hover:text-violet-600 motion-safe:active:scale-[0.97] dark:border-white/15 dark:hover:border-violet-400 dark:hover:text-[#A78BFA] ${tileFocusRing}`}
      >
        <span className="grid h-10 w-10 place-items-center rounded-full bg-zinc-100 dark:bg-white/5">
          <Plus className="h-5 w-5" aria-hidden />
        </span>
        Add a card
      </Link>
    </li>
  );
}

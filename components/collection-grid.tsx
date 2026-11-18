"use client";

import Link from "next/link";
import { openSheetFromLink } from "@/components/add-card-link";
import { useEffect, useRef, type CSSProperties } from "react";
import { Ellipsis, Plus } from "lucide-react";
import { CardTile, tileFocusRing } from "@/components/card-tile";
import type { VisibilitySave } from "@/components/card-visibility";
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
import { pressTick } from "@/lib/ui/press-tick";

/** Stagger stops after a couple of rows so long grids don't wait. */
const STAGGER_MS = 35;
const STAGGER_CAP = 12;

/** How long a finger rests on a tile before its quick actions open. */
export const LONG_PRESS_MS = 450;
/** A finger that moves this far is scrolling, not pressing. */
const LONG_PRESS_SLOP = 10;

export function CollectionGrid({
  cards,
  values,
  valuesLoading,
  valuesFailed,
  onVisibility,
  onActions,
}: {
  cards: SportsCard[];
  values: Map<string, CardValueResult>;
  valuesLoading: boolean;
  valuesFailed: boolean;
  /** Saves a card's public/private switch. Leave out to hide the lock. */
  onVisibility?: (card: SportsCard, isPublic: boolean) => VisibilitySave | void;
  /**
   * Opens a card's quick actions: a long press on its tile, a right click,
   * or its "More actions" button (shown on keyboard focus). Leave out for none.
   */
  onActions?: (card: SportsCard) => void;
}) {
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  /** Set when a long press opened the actions, so the tap that ends it does not also open the card. */
  const swallowClick = useRef(false);

  function cancel() {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  }
  useEffect(() => cancel, []);

  function cardAt(target: EventTarget | null): SportsCard | null {
    if (!(target instanceof Element)) return null;
    // The lock, Add photo and More actions keep their own taps.
    if (target.closest("button, [data-tile-own-tap]")) return null;
    const id = target.closest("[data-tile]")?.getAttribute("data-tile");
    return cards.find((card) => card.id === id) ?? null;
  }

  return (
    <ul
      className={`${GRID_CLASS} collection-grid`}
      aria-label="Your cards"
      onPointerDown={
        onActions
          ? (event) => {
              cancel();
              swallowClick.current = false;
              if (event.pointerType === "mouse") return;
              const card = cardAt(event.target);
              if (!card) return;
              const timer = window.setTimeout(() => {
                press.current = null;
                swallowClick.current = true;
                pressTick(10);
                onActions(card);
              }, LONG_PRESS_MS);
              press.current = { timer, x: event.clientX, y: event.clientY };
            }
          : undefined
      }
      onPointerMove={(event) => {
        const state = press.current;
        if (state && Math.hypot(event.clientX - state.x, event.clientY - state.y) > LONG_PRESS_SLOP) cancel();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onContextMenu={
        onActions
          ? (event) => {
              const card = cardAt(event.target);
              if (!card) return;
              event.preventDefault();
              // A long press that already opened the actions fires this too on Android.
              if (swallowClick.current) return;
              cancel();
              onActions(card);
            }
          : undefined
      }
      onClickCapture={(event) => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {cards.map((card, index) => (
        <CollectionTile
          key={card.id}
          card={card}
          index={index}
          values={values}
          valuesLoading={valuesLoading}
          valuesFailed={valuesFailed}
          onVisibility={onVisibility}
          onActions={onActions}
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
  onVisibility,
  onActions,
}: {
  card: SportsCard;
  index: number;
  values: Map<string, CardValueResult>;
  valuesLoading: boolean;
  valuesFailed: boolean;
  onVisibility?: (card: SportsCard, isPublic: boolean) => VisibilitySave | void;
  onActions?: (card: SportsCard) => void;
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
      visibility={
        onVisibility
          ? { isPublic: Boolean(card.isPublic), onChange: (next) => onVisibility(card, next) }
          : null
      }
      className="motion-safe:animate-[tile-in_420ms_cubic-bezier(0.2,0.7,0.2,1)_both]"
      style={staggerStyle(index)}
    >
      {onActions ? (
        // Off screen until it takes keyboard focus: the same actions a long press opens.
        <button
          type="button"
          aria-label={`More actions for ${card.playerName}`}
          aria-haspopup="dialog"
          onClick={() => onActions(card)}
          className="sr-only place-items-center rounded-full bg-zinc-950/80 text-white outline-none focus:not-sr-only focus:absolute! focus:top-2 focus:left-2 focus:grid focus:h-11! focus:w-11! focus:ring-2 focus:ring-violet-400"
        >
          <Ellipsis className="h-5 w-5" aria-hidden />
        </button>
      ) : null}
    </CardTile>
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
        onClick={openSheetFromLink}
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

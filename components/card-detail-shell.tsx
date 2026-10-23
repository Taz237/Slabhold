"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Ellipsis, Pencil } from "lucide-react";
import { CardThumb } from "@/components/card-thumb";
import { PlayerNameLink } from "@/components/player-name-link";
import { PriceFallbackText } from "@/components/price-readout";
import { useCollection } from "@/components/collection-provider";
import { cardTitle } from "@/lib/format";
import { needsDetails, needsDetailsLabel } from "@/lib/types";
import type { SportsCard } from "@/lib/types";

export const cardPanelClass =
  "rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03] sm:p-5";

const editButtonClass =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full bg-violet-600 px-3.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60";

const menuButtonClass =
  "inline-flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100";

export function cardDetailIdFromPath(pathname: string): string | null {
  const match = /^\/cards\/([^/]+)$/.exec(pathname);
  if (!match) return null;
  const id = decodeURIComponent(match[1] ?? "");
  if (!id || id === "new") return null;
  return id;
}

type HeroCard = SportsCard;

export function CardTopBar({
  editing = false,
  menuOpen = false,
  onEdit,
  onMenu,
  disabled = false,
}: {
  editing?: boolean;
  menuOpen?: boolean;
  onEdit?: () => void;
  onMenu?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Link
        href="/collection"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="h-4 w-4" />
        Collection
      </Link>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={editButtonClass}
          disabled={disabled || !onEdit}
          aria-expanded={onEdit ? editing : undefined}
          onClick={onEdit}
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit card
        </button>
        <button
          type="button"
          className={menuButtonClass}
          disabled={disabled || !onMenu}
          aria-label="Card actions"
          aria-expanded={onMenu ? menuOpen : undefined}
          aria-controls={menuOpen ? "card-actions" : undefined}
          onClick={onMenu}
        >
          <Ellipsis className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

export function CardHero({
  card,
  onFixDetails,
}: {
  card: HeroCard;
  onFixDetails?: () => void;
}) {
  return (
    <section data-slot="card-hero">
      <div className="mx-auto h-72 w-48">
        <CardThumb
          card={card}
          priority
          className="h-full w-full rounded-2xl shadow-xl shadow-violet-950/30 ring-1 ring-black/10 dark:ring-white/10"
        />
      </div>
      <h1 className="mt-4 text-center text-3xl font-semibold tracking-tight">
        <PlayerNameLink name={card.playerName} sport={card.sport} className="hover:underline" />
      </h1>
      <p className="mt-1 text-center text-sm text-zinc-500">
        {cardTitle(card)}
        {card.isRookie ? " · Rookie" : ""}
      </p>
      {needsDetails(card) ? (
        <p className="mx-auto mt-3 max-w-sm rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          {onFixDetails ? (
            <button
              type="button"
              onClick={onFixDetails}
              className="underline underline-offset-2 hover:text-amber-950 dark:hover:text-amber-100"
            >
              {needsDetailsLabel(card)}. Add them for accurate prices
            </button>
          ) : (
            <span>{needsDetailsLabel(card)}. Add them for accurate prices</span>
          )}
        </p>
      ) : null}
    </section>
  );
}

export function SalesChartPending({
  priceLabel = null,
  priceIsEstimate = false,
  note = null,
  busy = true,
}: {
  priceLabel?: string | null;
  /** The big dollar is only the estimate. A fallback stays a smaller labeled line. */
  priceIsEstimate?: boolean;
  note?: string | null;
  busy?: boolean;
}) {
  const bareEstimate =
    Boolean(priceLabel) &&
    (priceIsEstimate || /^\$[\d,]+\.\d{2}$/.test(priceLabel ?? ""));
  return (
    <section
      data-slot="sales-chart"
      className={cardPanelClass}
      aria-busy={busy || undefined}
    >
      <p className="text-[11px] tracking-wide text-zinc-500 uppercase">Recent sales</p>
      <div className="mt-1 flex min-h-9 items-end">
        {bareEstimate && priceLabel ? (
          <p className="text-3xl font-semibold tracking-tight tabular-nums">{priceLabel}</p>
        ) : priceLabel ? (
          <p className="max-w-full text-[clamp(0.95rem,3.6vw,1.125rem)] font-semibold tracking-tight leading-snug">
            <PriceFallbackText text={priceLabel} />
          </p>
        ) : (
          <div className="h-9 w-32 animate-pulse rounded-lg bg-zinc-100 dark:bg-white/5" />
        )}
      </div>
      <p className="mt-1 min-h-5 text-sm text-zinc-500">&nbsp;</p>
      <div
        className={`mt-3 flex h-44 items-center justify-center rounded-xl bg-zinc-100 dark:bg-white/5 ${
          note ? "" : "animate-pulse"
        }`}
      >
        {note ? <p className="px-4 text-center text-sm text-zinc-500">{note}</p> : null}
      </div>
    </section>
  );
}

export function SalesListPending() {
  return (
    <section data-slot="sales-list" className={cardPanelClass} aria-busy="true">
      <h2 className="font-semibold">Recent sales</h2>
      <p className="text-xs text-zinc-500">Loading sold listings…</p>
      <div className="mt-3 space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/5"
          />
        ))}
      </div>
    </section>
  );
}

export function CardTalkSkeleton({
  heading = "Who's talking about this card",
}: {
  heading?: string;
}) {
  return (
    <section data-slot="card-talk" className={cardPanelClass} aria-busy="true">
      <h2 className="font-semibold">{heading}</h2>
      <p className="text-xs text-zinc-500">Posts about this card</p>
      <div className="mt-3 space-y-3">
        {Array.from({ length: 2 }, (_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/5"
          />
        ))}
      </div>
    </section>
  );
}

function CardDetailFallback() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only">Loading card</span>
      <CardTopBar disabled />
      <div data-slot="card-hero">
        <div className="mx-auto h-72 w-48 animate-pulse rounded-2xl bg-zinc-200/80 dark:bg-white/10" />
        <div className="mx-auto mt-4 h-8 w-48 animate-pulse rounded-lg bg-zinc-200/80 dark:bg-white/10" />
        <div className="mx-auto mt-2 h-4 w-36 animate-pulse rounded bg-zinc-200/70 dark:bg-white/5" />
      </div>
      <SalesChartPending />
      <SalesListPending />
      <CardTalkSkeleton />
    </div>
  );
}

/** Photo and name from the open collection, with the slow sections reserved. */
export function CardDetailPending({ id }: { id?: string | null }) {
  const pathname = usePathname() || "";
  const resolved = id ?? cardDetailIdFromPath(pathname);
  const { ready, getCard } = useCollection();
  const card = resolved && ready ? getCard(resolved) : undefined;

  if (!card) return <CardDetailFallback />;

  return (
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only">Loading card</span>
      <CardTopBar disabled />
      <CardHero card={card} />
      <SalesChartPending />
      <SalesListPending />
      <CardTalkSkeleton />
    </div>
  );
}

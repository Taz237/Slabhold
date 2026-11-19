"use client";

import { backLinkClick } from "@/components/nav-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft, Ellipsis, Pencil } from "lucide-react";
import { CardStage } from "@/components/card-page/card-stage";
import { CardStageSkeleton } from "@/components/card-page/card-stage-frame";
import { CardHeading, cardSpecs } from "@/components/card-page/card-heading";
import {
  SaleRowsSkeleton,
  ValuePending,
  cardSection,
  cardSectionTitle,
  headlineFromLabel,
} from "@/components/card-page/value-head";
import { LazyResolvedPlayerName } from "@/components/player-name-lazy";
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
  share,
  disabled = false,
}: {
  editing?: boolean;
  menuOpen?: boolean;
  onEdit?: () => void;
  onMenu?: () => void;
  /** The owner's Share button. */
  share?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 big:flex-wrap">
      <Link
        href="/collection"
        data-nav-back=""
        onClick={(event) => backLinkClick(event, "/collection")}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="h-4 w-4" />
        Collection
      </Link>
      <div className="flex items-center gap-2 big:flex-wrap">
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
        {share}
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
  parallelName,
}: {
  card: HeroCard;
  onFixDetails?: () => void;
  /** The parallel's checklist name. The loading shell shows it as saved. */
  parallelName?: (setBrand: string, parallel: string) => string;
}) {
  return (
    <>
      <CardStage card={card} />
      <div>
        <CardHeading
          eyebrow={`${cardTitle(card)}${card.isRookie ? " · Rookie" : ""}`}
          name={<LazyResolvedPlayerName name={card.playerName} sport={card.sport} className="hover:underline" />}
          specs={cardSpecs({ ...card, sport: null }, parallelName)}
        />
        {needsDetails(card) ? (
          <p className="mt-3 rounded-2xl bg-amber-500/10 px-4 py-3 text-sm leading-5 text-amber-900 dark:text-amber-200">
            {onFixDetails ? (
              <button
                type="button"
                onClick={onFixDetails}
                className="hit-44 text-left underline underline-offset-2 hover:text-amber-950 dark:hover:text-amber-100"
              >
                {needsDetailsLabel(card)}. Add them for accurate prices
              </button>
            ) : (
              <span>{needsDetailsLabel(card)}. Add them for accurate prices</span>
            )}
          </p>
        ) : null}
      </div>
    </>
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
    <ValuePending
      slot="sales-chart"
      busy={busy}
      note={note}
      line={note ? "" : undefined}
      headline={
        priceLabel
          ? bareEstimate
            ? { label: "Estimated value", price: priceLabel, estimate: true }
            : headlineFromLabel(priceLabel)
          : null
      }
    />
  );
}

export function SalesListPending() {
  return (
    <section data-slot="sales-list" className={cardSection} aria-busy="true">
      <h2 className={cardSectionTitle}>Recent sales</h2>
      <span className="sr-only">Loading sold listings…</span>
      <SaleRowsSkeleton />
    </section>
  );
}

export function CardTalkSkeleton({
  heading = "Who's talking about this card",
}: {
  heading?: string;
}) {
  return (
    <section data-slot="card-talk" className={cardSection} aria-busy="true">
      <h2 className={cardSectionTitle}>{heading}</h2>
      <div className="mt-3 space-y-3">
        {Array.from({ length: 2 }, (_, i) => (
          <div
            key={i}
            className="h-16 skeleton-shimmer rounded-xl"
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
      <CardStageSkeleton />
      <div aria-hidden="true">
        <div className="flex h-5 items-center">
          <div className="h-3 w-36 skeleton-shimmer rounded" />
        </div>
        <div className="flex h-9 items-center">
          <div className="h-7 w-52 skeleton-shimmer rounded-lg" />
        </div>
        <div className="mt-1 flex h-5 items-center">
          <div className="h-3 w-44 skeleton-shimmer rounded" />
        </div>
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

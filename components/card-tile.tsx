"use client";

import Link from "next/link";
import { useCallback, useState, type CSSProperties, type ReactNode } from "react";
import { Camera, TrendingDown, TrendingUp } from "lucide-react";
import { CardSlabArt, type ArtCard } from "@/components/card-slab-art";
import { CountUp } from "@/components/count-up";
import { TileVisibilityButton, type VisibilitySave } from "@/components/card-visibility";
import {
  photoSource,
  photoStatusAfter,
  showPhotoPlaceholder,
  tilePriceSlot,
  yearSetLine,
  type PhotoStatus,
  type TileGain,
} from "@/lib/collection/grid";

export const tileFocusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]";

/** What a tile needs. Works for a SportsCard and a PublicCard. */
export type TileCard = {
  id: string;
  playerName: string;
  year: number;
  setBrand: string;
  accent: string;
  photoDataUrl: string | null;
  yearLabel?: string;
  grade?: string;
  conditionType?: "raw" | "graded";
  grader?: string;
  gradeQualifier?: string;
  certNumber?: string;
  isRookie?: boolean;
};

/** Fills the fields a PublicCard may not have. */
export function tileArtCard(card: TileCard): ArtCard {
  return {
    playerName: card.playerName,
    year: card.year,
    yearLabel: card.yearLabel ?? "",
    setBrand: card.setBrand,
    grade: card.grade ?? "",
    conditionType: card.conditionType,
    grader: card.grader,
    gradeQualifier: card.gradeQualifier ?? "",
    certNumber: card.certNumber ?? "",
    accent: card.accent,
  };
}

/**
 * The Collection slab tile: grader label, card photo in a slab, then name and
 * RC, year · set, and price with the gain chip. Used on Collection, profiles
 * and posts.
 */
export function CardTile({
  card,
  href,
  index,
  ariaLabel,
  priceLabel,
  pricePending = false,
  noValue = true,
  gain = null,
  chip = null,
  sold = false,
  needsDetailsLabel = null,
  addPhotoHref = null,
  visibility = null,
  badge = null,
  sizes,
  as: Tag = "li",
  prefetch,
  density = "regular",
  countUp = false,
  className = "",
  style,
  children,
}: {
  card: TileCard;
  href: string;
  /** Grid position. Sets eager loading for the first row or two. */
  index: number;
  ariaLabel?: string;
  priceLabel: string | null;
  pricePending?: boolean;
  /**
   * With no price, show a muted "No value yet" in the slot. False leaves it
   * empty, for a tile whose price is shown beside it.
   */
  noValue?: boolean;
  gain?: TileGain | null;
  /** A neutral chip in the gain slot, e.g. "New". Shown only with no gain. */
  chip?: ReactNode;
  sold?: boolean;
  /** Amber dot. Only for your own cards. */
  needsDetailsLabel?: string | null;
  /** "Add photo" hint over a missing photo. Only for your own cards. */
  addPhotoHref?: string | null;
  /** Public/private lock over the art. Only for your own cards. */
  visibility?: { isPublic: boolean; onChange: (next: boolean) => VisibilitySave | void } | null;
  badge?: ReactNode;
  sizes?: string;
  as?: "li" | "div";
  /**
   * False in long feeds, so rows scrolling by fetch nothing. True prefetches
   * the whole page when on screen, for the first few tiles of a rail or grid.
   */
  prefetch?: boolean;
  /** Compact: tighter text under the art, for rails and 3-column grids. */
  density?: "regular" | "compact";
  /** The gain chip's % counts up once (Home rail, first paint). */
  countUp?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Below the tile link, e.g. an eBay sold link. */
  children?: ReactNode;
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

  const art = tileArtCard(card);
  const price = noValue || priceLabel ? tilePriceSlot(priceLabel) : null;
  const placeholder = showPhotoPlaceholder(source, status);
  const compact = density === "compact";

  return (
    <Tag data-tile={card.id} className={`relative ${className}`.trim()} style={style}>
      <Link
        href={href}
        prefetch={prefetch}
        aria-label={ariaLabel}
        className={`group block min-h-11 touch-manipulation rounded-xl p-1 [-webkit-tap-highlight-color:transparent] transition-transform duration-150 ease-out motion-safe:active:scale-[0.97] ${tileFocusRing}`}
      >
        <div className="[perspective:900px]">
          <div className="relative transition-transform duration-300 ease-out motion-safe:group-hover:[transform:translateY(-4px)_rotateX(5deg)_rotateY(-7deg)]">
            <CardSlabArt
              card={art}
              index={index}
              source={source}
              status={status}
              onStatus={onStatus}
              sizes={sizes}
            />
            {sold ? <SoldRibbon /> : null}
          </div>
        </div>
        <div className={compact ? "mt-1.5 px-0.5" : "mt-2 px-0.5"} data-density={density}>
          {badge}
          <div className="flex min-w-0 items-center gap-1.5">
            <p
              className={
                compact
                  ? "min-w-0 truncate text-[13px] leading-[18px] font-semibold tracking-tight"
                  : "min-w-0 truncate text-sm font-semibold tracking-tight"
              }
            >
              {card.playerName}
            </p>
            {card.isRookie ? (
              <span className="shrink-0 rounded bg-violet-500/15 px-1 font-mono text-[9px] leading-4 font-semibold tracking-wider text-violet-700 uppercase dark:text-[#A78BFA]">
                RC
              </span>
            ) : null}
            {needsDetailsLabel ? (
              <span
                role="img"
                aria-label={needsDetailsLabel}
                title={needsDetailsLabel}
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
              />
            ) : null}
          </div>
          <p className={compact ? "truncate text-[11px] leading-4 text-zinc-500" : "truncate text-xs text-zinc-500"}>
            {yearSetLine(art)}
          </p>
          <div
            className={`${compact ? "mt-0.5" : "mt-1"} flex min-h-5 min-w-0 items-center justify-between gap-1.5`}
          >
            {pricePending ? (
              <span
                className="h-4 w-16 animate-pulse rounded bg-zinc-200/80 dark:bg-white/10"
                aria-hidden
              />
            ) : price?.muted ? (
              <p
                data-no-value=""
                className={`min-w-0 truncate ${compact ? "text-[13px]" : "text-sm"} font-medium tracking-tight text-zinc-500 dark:text-zinc-400`}
              >
                {price.text}
              </p>
            ) : (
              <p
                className={`min-w-0 truncate ${compact ? "text-[13px]" : "text-sm"} font-bold tracking-tight tabular-nums`}
                title={price?.text}
              >
                {price?.text}
              </p>
            )}
            {gain ? <GainChip gain={gain} compact={compact} countUp={countUp} /> : chip}
          </div>
        </div>
      </Link>
      {placeholder && addPhotoHref ? (
        <AddPhotoHint href={addPhotoHref} playerName={card.playerName} />
      ) : null}
      {visibility ? (
        <TileVisibilityButton
          isPublic={visibility.isPublic}
          playerName={card.playerName}
          onChange={visibility.onChange}
          raised={Boolean(placeholder && addPhotoHref)}
        />
      ) : null}
      {children}
    </Tag>
  );
}

/** Green up, red down. Movers pass a percent-only gain through the same chip. */
export function GainChip({
  gain,
  compact = false,
  large = false,
  countUp = false,
}: {
  gain: TileGain;
  compact?: boolean;
  /** The % counts up once from 0, for rail tiles that are entering. */
  countUp?: boolean;
  /** The featured mover's chip on See all. */
  large?: boolean;
}) {
  return (
    <span
      data-gain={gain.tone}
      title={[gain.amountText, gain.pctText].filter(Boolean).join(" ")}
      className={`inline-flex shrink-0 items-center rounded-full ${
        large
          ? "gap-1 px-2.5 py-1 text-base font-bold"
          : `gap-0.5 ${compact ? "px-1" : "px-1.5"} py-0.5 text-[10px] font-semibold`
      } tabular-nums ${
        gain.tone === "up"
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
          : "bg-rose-500/15 text-rose-700 dark:text-rose-400"
      }`}
    >
      {compact ? null : gain.tone === "up" ? (
        <TrendingUp className={large ? "h-4 w-4" : "h-3 w-3"} aria-hidden />
      ) : (
        <TrendingDown className={large ? "h-4 w-4" : "h-3 w-3"} aria-hidden />
      )}
      <CountUp text={gain.pctText} run={countUp} />
    </span>
  );
}

/** Sits over the art, outside the tile link, so links don't nest. */
function AddPhotoHint({ href, playerName }: { href: string; playerName: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 p-1">
      <div className="relative aspect-[3/5] w-full">
      <Link
        href={href}
        aria-label={`Add a photo of ${playerName}`}
        onClick={(event) => event.stopPropagation()}
        className={`group/hint pointer-events-auto absolute right-0 bottom-0 rounded-full p-2.5 ${tileFocusRing}`}
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

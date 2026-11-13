"use client";

import { useEffect, useId, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { focusRing } from "@/components/add-card/flow-ui";
import { safeListingPhoto } from "@/lib/scan/listing-photo";
import type { ScanMatch } from "@/lib/scan/match";

export const LISTING_COPY = {
  /** The thumbnail's name for a screen reader, and the enlarged view's title. */
  open: "See the sold listing's photo",
  title: "Compare with a sold listing",
  listing: "Sold listing",
  scan: "Your scan",
  view: "View the listing",
  close: "Close",
  none: "No listing photo",
  /** Under the main match: the one-line way in. */
  compare: "Compare with a sold listing",
} as const;

function cardLine(match: ScanMatch): string {
  return [match.playerName, match.yearLabel, match.setBrand, match.cardNumber ? `#${match.cardNumber}` : "", match.parallel].filter(Boolean).join(" ");
}

/** The same box for a photo and for none, so rows never shift. */
const thumbBox = "aspect-[5/7] w-8 shrink-0 overflow-hidden rounded-md ring-1 ring-zinc-900/10 dark:ring-white/10";

/** A designed empty card, never another card's photo and never a broken-image icon. */
function ThumbPlaceholder() {
  return (
    <div className="grid min-h-11 min-w-11 place-items-center">
      <div role="img" aria-label={LISTING_COPY.none} className={`${thumbBox} grid place-items-center bg-zinc-100 dark:bg-white/[0.06]`}>
        <span aria-hidden className="h-0.5 w-3 rounded-full bg-zinc-300 dark:bg-white/20" />
      </div>
    </div>
  );
}

/**
 * A small photo of this exact card from a sold listing, lazy-loaded straight from eBay's image
 * host with no referrer. Tap to enlarge it beside the scan. No photo, or one that fails to load:
 * the placeholder, in the same box.
 */
export function ListingThumb({ match, scan = null, label = false }: { match: ScanMatch; scan?: string | null; label?: boolean }) {
  const listing = safeListingPhoto(match.listing);
  const [failed, setFailed] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  if (!listing || failed === listing.imageUrl) return label ? null : <ThumbPlaceholder />;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${LISTING_COPY.open}: ${cardLine(match)}`}
        className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-3 rounded-lg text-left ${focusRing}`}
      >
        <span className={`${thumbBox} bg-zinc-100 dark:bg-white/[0.06]`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={listing.imageUrl}
            alt=""
            width={32}
            height={45}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            draggable={false}
            onError={() => setFailed(listing.imageUrl)}
            className="h-full w-full object-cover"
          />
        </span>
        {label ? <span className="text-sm font-medium text-violet-700 dark:text-[#A78BFA]">{LISTING_COPY.compare}</span> : null}
      </button>
      {open ? <ListingCompare match={match} imageUrl={listing.imageUrl} url={listing.url} scan={scan} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** The listing's photo, large, beside the scan when there is one. Escape or the backdrop closes it. */
function ListingCompare({
  match,
  imageUrl,
  url,
  scan,
  onClose,
}: {
  match: ScanMatch;
  imageUrl: string;
  url: string | null;
  scan: string | null;
  onClose: () => void;
}) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  const frame = "aspect-[5/7] w-full overflow-hidden rounded-xl bg-zinc-100 ring-1 ring-zinc-900/10 dark:bg-white/[0.06] dark:ring-white/10";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" data-slot="listing-compare">
      <button type="button" aria-label={LISTING_COPY.close} onClick={onClose} className="absolute inset-0 bg-zinc-950/70" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md rounded-3xl bg-white p-5 text-zinc-950 shadow-xl dark:bg-zinc-950 dark:text-zinc-50 dark:ring-1 dark:ring-white/10"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p id={titleId} className="text-[15px] leading-5 font-semibold">
              {LISTING_COPY.title}
            </p>
            <p className="mt-1 truncate text-sm leading-5 text-zinc-600 dark:text-zinc-400">{cardLine(match)}</p>
          </div>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label={LISTING_COPY.close}
            className={`-mt-2 -mr-2 grid size-11 shrink-0 place-items-center rounded-full text-zinc-500 dark:text-zinc-400 hover:bg-zinc-900/5 dark:hover:bg-white/10 ${focusRing}`}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className={`mt-4 grid gap-3 ${scan ? "grid-cols-2" : "mx-auto max-w-[240px] grid-cols-1"}`}>
          <figure className="m-0">
            <div className={frame}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt={`Sold listing photo of ${cardLine(match)}`} referrerPolicy="no-referrer" decoding="async" className="h-full w-full object-contain" />
            </div>
            <figcaption className="mt-2 text-[13px] leading-5 text-zinc-500 dark:text-zinc-400">{LISTING_COPY.listing}</figcaption>
          </figure>
          {scan ? (
            <figure className="m-0">
              <div className={frame}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={scan} alt="Your scan" className="h-full w-full object-contain" />
              </div>
              <figcaption className="mt-2 text-[13px] leading-5 text-zinc-500 dark:text-zinc-400">{LISTING_COPY.scan}</figcaption>
            </figure>
          ) : null}
        </div>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full text-sm font-semibold text-violet-700 dark:text-[#A78BFA] ${focusRing}`}
          >
            {LISTING_COPY.view}
            <ExternalLink className="size-4" aria-hidden />
          </a>
        ) : null}
      </div>
    </div>
  );
}

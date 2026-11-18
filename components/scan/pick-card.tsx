"use client";

import { ChevronRight } from "lucide-react";
import { SwatchDot, focusRing } from "@/components/add-card/flow-ui";
import { matchLine } from "@/lib/scan/confirm";
import { safeListingPhoto } from "@/lib/scan/listing-photo";
import type { ScanMatch } from "@/lib/scan/match";
import { REVEAL_COPY } from "@/lib/scan/reveal";

/** The same box for a photo and for none, so rows never shift. */
const thumb = "aspect-[5/7] w-12 shrink-0 overflow-hidden rounded-lg ring-1 ring-zinc-900/10 dark:ring-white/10";

/**
 * A row's card image: a sold listing's photo of that exact card (same set and #) when the search
 * had one, else the collector's own front photo (it is their card), else a designed empty card.
 * Never another card's photo, never a broken image.
 */
function RowThumb({ match, photo }: { match: ScanMatch; photo: string | null }) {
  const listing = safeListingPhoto(match.listing);
  if (!listing && photo) {
    return (
      <span className={`${thumb} bg-zinc-100 dark:bg-white/[0.06]`} data-thumb="own">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt="" width={48} height={67} decoding="async" className="h-full w-full object-cover" />
      </span>
    );
  }
  if (!listing) {
    return (
      <span aria-hidden className={`${thumb} grid place-items-center bg-zinc-100 dark:bg-white/[0.06]`}>
        <span className="h-0.5 w-4 rounded-full bg-zinc-300 dark:bg-white/20" />
      </span>
    );
  }
  return (
    <span className={`${thumb} bg-zinc-100 dark:bg-white/[0.06]`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={listing.imageUrl} alt="" width={48} height={67} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
    </span>
  );
}

/**
 * "Pick your card": the top matches, most likely first, each one tap from its price. A row shows
 * the card's image, player, year, set and #, and its parallel (or that it's still open).
 */
export function PickCard({
  matches,
  onPick,
  photo = null,
  body = REVEAL_COPY.pickBody,
  label = REVEAL_COPY.pickTitle,
  choices = false,
  notes = [],
}: {
  matches: readonly ScanMatch[];
  onPick: (index: number) => void;
  photo?: string | null;
  /** The line above the list. */
  body?: string;
  /** The list's accessible name. */
  label?: string;
  /** Choices to pick from, not ranked matches: no row is "Most likely" and no version line shows. */
  choices?: boolean;
  /** A quiet note over a row ("Picked by other collectors"), by row. */
  notes?: readonly (string | null | undefined)[];
}) {
  return (
    <div data-pick="list" className="motion-safe:animate-[comp-row-in_260ms_cubic-bezier(0.22,1,0.36,1)_both]" style={{ animationDelay: "520ms" }}>
      <p className="mb-3 text-center text-sm leading-5 text-zinc-600 dark:text-zinc-400">{body}</p>
      <ul className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 dark:divide-white/10 dark:border-white/10" aria-label={label}>
        {matches.map((match, index) => (
          <li key={`${match.catalogId ?? "read"}-${match.setBrand}-${match.cardNumber}-${index}`}>
            <button
              type="button"
              onClick={() => onPick(index)}
              className={`flex ${choices ? "min-h-16" : "min-h-[76px]"} w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-zinc-900/[0.03] active:bg-zinc-900/[0.05] dark:hover:bg-white/[0.04] dark:active:bg-white/[0.06] ${focusRing}`}
            >
              <RowThumb match={match} photo={photo} />
              <span className="min-w-0 flex-1">
                {index === 0 && !choices ? <span className="mb-0.5 block text-xs leading-4 font-medium text-violet-700 dark:text-[#A78BFA]">{REVEAL_COPY.likely}</span> : null}
                {notes[index] ? <span className="mb-0.5 block text-xs leading-4 font-medium text-violet-700 dark:text-[#A78BFA]">{notes[index]}</span> : null}
                <span className="block truncate text-15 leading-5 font-semibold">{match.playerName || REVEAL_COPY.open}</span>
                <span className="block break-words text-13 leading-5 text-zinc-600 dark:text-zinc-400">{matchLine(match) || REVEAL_COPY.open}</span>
                <span className={choices ? "hidden" : "mt-0.5 flex items-center gap-1.5 text-13 leading-5"}>
                  {match.parallel ? (
                    <>
                      <SwatchDot name={match.parallel} size="sm" />
                      <span className="truncate">{match.parallel}</span>
                    </>
                  ) : (
                    <span className="text-zinc-500 dark:text-zinc-400">{REVEAL_COPY.parallelOpen}</span>
                  )}
                  {match.serialRun ? <span className="font-mono text-zinc-500 tabular-nums dark:text-zinc-400">/{match.serialRun}</span> : null}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-zinc-400" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

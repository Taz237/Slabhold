"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import type { QuickCompIdentity } from "@/lib/quick-comp/identity";
import { safePhoto, type QuickCompPhoto } from "@/lib/quick-comp/photo";
import { textMuted } from "./tokens";

export const PHOTO_CAPTION = "Photo from a recent eBay sale";
export const NO_PHOTO_LABEL = "No photo in recent sales";

/** 224px at every width, so loading, photo and no photo take the same space. */
export const photoBox =
  "relative h-56 w-full overflow-hidden rounded-2xl border border-zinc-950/[0.08] bg-zinc-100 dark:border-white/[0.08] dark:bg-zinc-900";
/** The caption row under the box. Kept, empty, under the placeholder so nothing moves. */
export const photoCaptionRow = "mt-2 flex h-5 items-center";

export function photoAlt(identity: QuickCompIdentity): string {
  const number = identity.cardNumber ? ` #${identity.cardNumber}` : "";
  return `${identity.yearLabel} ${identity.setBrand} ${identity.playerName}${number}, ${identity.grade}, from a recent eBay sale`;
}

/**
 * One card photo above the value, so people can tell it's the card they mean.
 * Straight from eBay's image host (no optimizer) with no referrer. A missing
 * or broken photo is the neutral placeholder in the same box.
 */
export function QuickCompPhotoHero({
  photo,
  identity,
}: {
  photo: QuickCompPhoto | null | undefined;
  identity: QuickCompIdentity;
}) {
  const safe = safePhoto(photo);
  const [failed, setFailed] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);

  if (!safe || failed === safe.url) {
    return (
      <div data-quick-comp-photo="none">
        <div role="img" aria-label={NO_PHOTO_LABEL} className={`${photoBox} flex flex-col items-center justify-center gap-2`}>
          <ImageOff aria-hidden="true" size={18} strokeWidth={1.5} className={textMuted} />
          <span aria-hidden="true" className={`text-[13px] leading-5 ${textMuted}`}>
            {NO_PHOTO_LABEL}
          </span>
        </div>
        <div aria-hidden="true" className={photoCaptionRow} />
      </div>
    );
  }

  const src = safe.url;
  return (
    <figure data-quick-comp-photo="photo" className="m-0">
      <div className={photoBox}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={photoAlt(identity)}
          width={448}
          height={448}
          decoding="async"
          loading="eager"
          fetchPriority="high"
          referrerPolicy="no-referrer"
          draggable={false}
          ref={(img) => {
            // A photo can fail or finish before React attaches its handlers.
            if (!img?.complete) return;
            if (img.naturalWidth === 0) setFailed(src);
            else setLoaded(src);
          }}
          onLoad={() => setLoaded(src)}
          onError={() => setFailed(src)}
          className={`h-full w-full object-contain motion-safe:transition-opacity motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] ${loaded === src ? "opacity-100" : "opacity-0"}`}
        />
      </div>
      <figcaption className={`${photoCaptionRow} text-[13px] leading-5 ${textMuted}`}>{PHOTO_CAPTION}</figcaption>
    </figure>
  );
}

/** The hero while comps load: the same box and caption row, shimmering. */
export function QuickCompPhotoSkeleton() {
  return (
    <div aria-hidden="true" data-quick-comp-photo="loading">
      <div className={`${photoBox} skeleton-shimmer`} />
      <div className={photoCaptionRow}>
        <span className="skeleton-shimmer block h-3 w-40 rounded-md bg-zinc-100 dark:bg-white/5" />
      </div>
    </div>
  );
}

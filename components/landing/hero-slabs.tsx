"use client";

import { useCallback, useState, type CSSProperties } from "react";
import { CardSlabArt, type ArtCard } from "@/components/card-slab-art";
import { SAMPLE_SLABS } from "@/components/landing/sample-cards";
import { photoSource, photoStatusAfter, type PhotoStatus } from "@/lib/collection/grid";
import type { FounderCard } from "@/lib/landing/founder";

const NO_PHOTO = { kind: "none" } as const;
const noop = () => {};

/** Hero photos are above the fold: the center slab is widest. */
const SLAB_SIZES = "(min-width: 1024px) 140px, 38vw";

/**
 * Three slabs, fanned, drifting slowly. CSS only; still for reduced motion.
 * The side slabs stop short of the center one, so their labels (grade on
 * the right) are never under it at 390px or 1280px.
 */
export const HERO_PLACES: { className: string; style: CSSProperties }[] = [
  {
    className: "left-[0.5%] top-[14%] w-[31%] z-10",
    style: { "--tilt": "-8deg", animationDelay: "-2.4s" } as CSSProperties,
  },
  {
    className: "left-1/2 top-0 w-[37%] -translate-x-1/2 z-20",
    style: { "--tilt": "0deg", animationDelay: "0s" } as CSSProperties,
  },
  {
    className: "right-[0.5%] top-[14%] w-[31%] z-10",
    style: { "--tilt": "8deg", animationDelay: "-4.8s" } as CSSProperties,
  },
];

/** Best card in the center, then left, then right. Gaps keep the sample slab. */
const FILL_ORDER = [1, 0, 2];

/** The center slab is the widest, and the Home LCP for a visitor. */
const LCP_SLOT = FILL_ORDER[0];

type Slot = { key: string; art: ArtCard; photo: string | null };

export function heroSlots(cards: readonly FounderCard[]): Slot[] {
  const slots: Slot[] = SAMPLE_SLABS.map((art) => ({ key: art.playerName, art, photo: null }));
  cards.slice(0, FILL_ORDER.length).forEach((card, rank) => {
    const { id, photoUrl, ...art } = card;
    slots[FILL_ORDER[rank]] = { key: id, art, photo: photoUrl };
  });
  return slots;
}

/**
 * `cards` is null while the founder's cards load: the slabs hold their space
 * and fade in once there is something to show, real or sample.
 */
export function HeroSlabs({
  cards,
  owner = null,
}: {
  cards: readonly FounderCard[] | null;
  /** Shown under the slabs when they are real cards. */
  owner?: string | null;
}) {
  const ready = cards !== null;
  const real = Boolean(cards?.length);
  return (
    <div className="mx-auto w-full max-w-[360px]">
      <div aria-hidden className="relative aspect-[16/11] w-full" data-hero-slabs={real ? "founder" : "sample"}>
        <div className="absolute inset-x-[12%] top-[18%] bottom-[8%] rounded-full bg-[#7C3AED] opacity-45 blur-[56px]" />
        <div
          className={`absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none ${ready ? "opacity-100" : "opacity-0"}`}
        >
          {heroSlots(cards ?? []).map((slot, index) => (
            <div key={slot.key} className={`absolute ${HERO_PLACES[index].className}`}>
              <div className="landing-float drop-shadow-[0_18px_40px_rgba(124,58,237,0.45)]" style={HERO_PLACES[index].style}>
                {slot.photo ? (
                  <PhotoSlab art={slot.art} photo={slot.photo} index={index} lcp={index === LCP_SLOT} />
                ) : (
                  <CardSlabArt card={slot.art} index={index} source={NO_PHOTO} status="loading" onStatus={noop} sizes={SLAB_SIZES} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p
        className={`mt-1 h-4 text-center font-mono text-[10px] leading-4 tracking-wider text-zinc-500 uppercase ${ready ? "" : "invisible"}`}
        data-hero-caption
      >
        {real && owner ? `From @${owner}'s collection` : "Sample slabs"}
      </p>
    </div>
  );
}

/**
 * Only the center photo is preloaded from the head, at high priority. The
 * side slabs load eagerly at normal priority so they don't compete with it.
 */
function PhotoSlab({ art, photo, index, lcp }: { art: ArtCard; photo: string; index: number; lcp: boolean }) {
  const [status, setStatus] = useState<PhotoStatus>("loading");
  const onStatus = useCallback(
    (event: "load" | "error") => setStatus((current) => photoStatusAfter(current, event)),
    [],
  );
  return (
    <CardSlabArt
      card={art}
      index={index}
      source={photoSource(photo)}
      status={status}
      onStatus={onStatus}
      sizes={SLAB_SIZES}
      preload={lcp}
      fetchPriority={lcp ? "high" : "auto"}
    />
  );
}

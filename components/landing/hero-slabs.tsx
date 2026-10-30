import { getImageProps } from "next/image";
import { preload } from "react-dom";
import type { CSSProperties } from "react";
import { PhotoPlaceholder, SlabFrame, type ArtCard } from "@/components/card-slab-frame";
import { SAMPLE_SLABS } from "@/components/landing/sample-cards";
import type { FounderCard } from "@/lib/landing/founder";

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
 * Drawn on the server, once: no client code and no state, so the first paint
 * is the final one. `cards` is null while the founder's cards load: the
 * slabs hold their space and fade in once there is something to show.
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
                <SlabFrame card={slot.art}>
                  <PhotoPlaceholder card={slot.art} />
                  {slot.photo ? <HeroPhoto photo={slot.photo} lcp={index === LCP_SLOT} /> : null}
                </SlabFrame>
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
 * A plain <img> with next/image's optimizer props (AVIF/WebP, srcset, sizes).
 * Only the center photo is preloaded from the head, at high priority. The
 * side slabs load eagerly at normal priority so they don't compete with it.
 * The placeholder sits under it, so a photo that fails shows the placeholder
 * (alt="" draws no broken-image icon).
 */
function HeroPhoto({ photo, lcp }: { photo: string; lcp: boolean }) {
  const { props } = getImageProps({
    src: photo,
    alt: "",
    fill: true,
    sizes: SLAB_SIZES,
    quality: 75,
    loading: "eager",
    fetchPriority: lcp ? "high" : "auto",
  });
  if (lcp) {
    preload(props.src, {
      as: "image",
      imageSrcSet: props.srcSet,
      imageSizes: props.sizes,
      fetchPriority: "high",
    });
  }
  return (
    // getImageProps is next/image without its client code: this photo is drawn on the server only.
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} alt="" className="absolute inset-0 h-full w-full object-cover" />
  );
}

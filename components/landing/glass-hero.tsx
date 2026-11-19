import { getImageProps } from "next/image";
import { preload } from "react-dom";
import type { CSSProperties } from "react";
import { AppStoreBadge } from "@/components/landing/app-store-badge";
import { MotionPause, SlabTilt } from "@/components/landing/glass-island";
import { LandingOpen } from "@/components/landing/landing-links";

/** The slab's card window: 5:7, about 58vw on a phone. */
const CARD_SIZES = "(min-width: 1024px) 324px, (min-width: 768px) 284px, 58vw";

/** A real card photo for the slab. Never a sample. */
export type HeroCard = { src: string; alt: string };

const LINE_ONE = ["Scan", "it."];
const LINE_TWO = ["Know", "the", "exact", "version."];

function Words({ words, from }: { words: readonly string[]; from: number }) {
  return words.map((word, index) => (
    <span key={word}>
      {index > 0 ? " " : null}
      <span className="lg-w" style={{ "--i": from + index } as CSSProperties}>
        {word}
      </span>
    </span>
  ));
}

/**
 * A 40px line of real sold prices, oldest to newest. No axis, no numbers:
 * the shape is the fragment.
 */
function Sparkline({ prices }: { prices: readonly number[] }) {
  const width = 96;
  const height = 40;
  const low = Math.min(...prices);
  const span = Math.max(...prices) - low || 1;
  const points = prices
    .map((price, index) => {
      const x = (index / (prices.length - 1)) * (width - 4) + 2;
      const y = height - 4 - ((price - low) / span) * (height - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg role="img" aria-label="Recent sold prices" viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
      <polyline points={points} fill="none" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The photo, through next/image's optimizer with none of its client code.
 * It is the page's one high-priority image and the only one preloaded from
 * the head. Never blurred, never cropped.
 */
function CardPhoto({ card }: { card: HeroCard }) {
  const { props } = getImageProps({
    src: card.src,
    alt: card.alt,
    fill: true,
    sizes: CARD_SIZES,
    quality: 75,
    loading: "eager",
    fetchPriority: "high",
  });
  preload(props.src, { as: "image", imageSrcSet: props.srcSet, imageSizes: props.sizes, fetchPriority: "high" });
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={card.alt} data-hero-card="" />;
}

/**
 * The hero: the headline and the Glass Slab. Drawn on the server; the tilt
 * and the pause control are the only client code. The load sequence is CSS
 * keyframes in app/landing.css: the bead of glass grows into the slab, the
 * card lands crooked, the crop corners find it and it straightens, one light
 * sweep crosses it and a ring pulses once.
 *
 * `card` is a real card photo or null (an empty slab). `prices` are real
 * recent sold prices, oldest first; `serial` is the hero card's real serial.
 * Each shard shows only when its fact exists.
 */
export function GlassHero({
  card,
  prices = null,
  serial = "",
}: {
  card: HeroCard | null;
  prices?: readonly number[] | null;
  serial?: string;
}) {
  const spark = prices && prices.length >= 3 ? prices : null;
  return (
    <section className="lg-hero" data-glass-hero={card ? "card" : "empty"}>
      <div className="lg-hero-copy">
        <h1 className="lg-h1">
          <Words words={LINE_ONE} from={0} />
          <br />
          <span className="lg-h1-accent">
            <Words words={LINE_TWO} from={LINE_ONE.length} />
          </span>
        </h1>
        <p className="lg-sub">
          Slabhold crops and straightens your card, reads it down to the edge serial, then you pick the exact version
          and see what it sold for.
        </p>
        <div className="lg-ctas">
          <AppStoreBadge variant="primary" />
          <LandingOpen />
        </div>
      </div>

      <div className="lg-stage">
        <div className="lg-slab-wrap lg-scroll-tilt">
          <SlabTilt>
            <div aria-hidden className="lg-glow" />
            <div className="lg-slab lg-glass" data-glass-slab="">
              <div aria-hidden className="lg-rim" />
              <div aria-hidden className="lg-spec" />
              <div aria-hidden className="lg-sheen" />
              <div className="lg-window">
                <div className="lg-card">
                  {card ? <CardPhoto card={card} /> : null}
                  <span aria-hidden className="lg-sweep" />
                </div>
                <span aria-hidden className="lg-corner" />
                <span aria-hidden className="lg-corner" />
                <span aria-hidden className="lg-corner" />
                <span aria-hidden className="lg-corner" />
              </div>
              <div aria-hidden className="lg-ring" />
            </div>
            {serial ? (
              <div className="lg-shard lg-shard-serial lg-glass" data-shard="serial">
                {serial}
              </div>
            ) : null}
            {spark ? (
              <div className="lg-shard lg-shard-spark lg-glass" data-shard="sold">
                <Sparkline prices={spark} />
              </div>
            ) : null}
          </SlabTilt>
        </div>
        <MotionPause />
        {/* The rim's refraction (desktop only, see .lg-rim). */}
        <svg aria-hidden width="0" height="0" style={{ position: "absolute" }}>
          <filter id="lg-refract" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="8" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
      </div>
    </section>
  );
}

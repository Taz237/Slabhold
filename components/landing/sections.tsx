import Link from "next/link";
import { getImageProps } from "next/image";
import type { ReactNode } from "react";
import { AppStoreBadge } from "@/components/landing/app-store-badge";
import { FeatureClip } from "@/components/landing/feature-clip";
import { LandingOpen } from "@/components/landing/landing-links";
import { NoHeadPreload } from "@/components/landing/no-head-preload";
import { Logo } from "@/components/logo";
import type { FounderCard } from "@/lib/landing/founder";
import type { MediaSlot } from "@/lib/landing/media";
import type { LandingPull } from "@/lib/landing/pulls";

/*
 * The sections under the hero, in page order. Each is one heading and at
 * most one line; the layout does the rest. A section's media is a real file
 * from public/landing/media (lib/landing/media.ts) or nothing: with no file
 * the heading sits in one quiet glass pane, or the section is not drawn.
 */

function Copy({ title, line }: { title: string; line: string }) {
  return (
    <div className="lg-copy">
      <h2 className="lg-h2">{title}</h2>
      <p className="lg-lead">{line}</p>
    </div>
  );
}

/** A lazy still at its real size, so nothing shifts when it loads. */
function Still({ slot, alt, sizes, className }: { slot: MediaSlot; alt: string; sizes: string; className: string }) {
  const { props } = getImageProps({ src: slot.src, alt, width: slot.width, height: slot.height, sizes, quality: 75 });
  return (
    <div className={`lg-still lg-glass ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img {...props} alt={alt} />
    </div>
  );
}

/**
 * One feature: copy beside its media, or the copy alone in a glass pane when
 * there is no media to show.
 */
function Feature({
  id,
  title,
  line,
  flip = false,
  children = null,
}: {
  id: string;
  title: string;
  line: string;
  flip?: boolean;
  /** The media. Null draws the text-only pane. */
  children?: ReactNode;
}) {
  if (!children) {
    return (
      <section className="lg-section lg-rise" data-section={id} data-media="none">
        <div className="lg-panel lg-glass">
          <span aria-hidden className="lg-panel-corner" />
          <span aria-hidden className="lg-panel-corner" />
          <span aria-hidden className="lg-panel-corner" />
          <span aria-hidden className="lg-panel-corner" />
          <Copy title={title} line={line} />
        </div>
      </section>
    );
  }
  return (
    <section className="lg-section" data-section={id} data-media="real">
      <div className="lg-grid lg-rise" data-flip={flip ? "" : undefined}>
        <Copy title={title} line={line} />
        {children}
      </div>
    </section>
  );
}

export function ScanSection({ clip }: { clip: MediaSlot | null }) {
  return (
    <Feature id="scan" title="Straightened on the spot." line="Crop, straighten and one light sweep the moment you tap.">
      {clip ? (
        <div className="lg-media">
          <FeatureClip slot={clip} label="A card being scanned in the Slabhold app" />
        </div>
      ) : null}
    </Feature>
  );
}

/** Hidden until there is a real recording or a real macro photo. */
export function EdgeSerialSection({ clip, macro }: { clip: MediaSlot | null; macro: MediaSlot | null }) {
  if (!clip && !macro) return null;
  return (
    <Feature id="serial" title="Reads the edge." line="The serial along the border, read for you." flip>
      <div className={`lg-media ${clip && macro ? "lg-media-pair" : ""}`}>
        {macro ? (
          <Still slot={macro} alt="The serial on a card's foil edge, up close" sizes="220px" className="lg-still-macro" />
        ) : null}
        {clip ? <FeatureClip slot={clip} label="The Slabhold app reading a card's edge serial" /> : null}
        {clip && macro ? <span aria-hidden className="lg-loupe" /> : null}
      </div>
    </Feature>
  );
}

export function ParallelsSection({ clip }: { clip: MediaSlot | null }) {
  return (
    <Feature
      id="parallels"
      title="Every parallel. You pick."
      line="Can't read the serial? Choose from every version and see its comps."
    >
      {clip ? (
        <div className="lg-media">
          <FeatureClip slot={clip} label="Picking a card's version in the Slabhold app" />
        </div>
      ) : null}
    </Feature>
  );
}

function cardAlt(card: FounderCard): string {
  return [card.playerName, [card.yearLabel, card.setBrand].filter(Boolean).join(" "), card.grade].filter(Boolean).join(", ");
}

/** Real card photos only: no values, no prices, no chart. */
function CardGrid({ cards }: { cards: readonly FounderCard[] }) {
  return (
    <ul className="lg-cards" data-card-grid="">
      {cards.map((card) => {
        const { props } = getImageProps({
          src: card.photoUrl,
          alt: cardAlt(card),
          width: 250,
          height: 350,
          sizes: "(min-width: 1024px) 150px, 28vw",
          quality: 75,
        });
        return (
          <li key={card.id} className="lg-glass">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img {...props} alt={cardAlt(card)} />
          </li>
        );
      })}
    </ul>
  );
}

/** The recording when there is one; until then, real cards from a Slabhold collection. */
export function CollectionSection({ clip, cards }: { clip: MediaSlot | null; cards: readonly FounderCard[] }) {
  return (
    <Feature id="collection" title="Cards first." line="Scrub your value. Swipe your movers." flip>
      {clip ? (
        <div className="lg-media">
          <FeatureClip slot={clip} label="A collection in the Slabhold app" />
        </div>
      ) : cards.length ? (
        <div className="lg-media">
          <CardGrid cards={cards} />
        </div>
      ) : null}
    </Feature>
  );
}

export function ArenaSection({ clip, shareRank }: { clip: MediaSlot | null; shareRank: MediaSlot | null }) {
  return (
    <Feature id="arena" title="The weekly arena." line="Climb the boards every week.">
      {clip ? (
        <div className="lg-media">
          <FeatureClip slot={clip} label="The weekly leaderboards in the Slabhold app" />
          {shareRank ? (
            <Still slot={shareRank} alt="A rank card shared from Slabhold" sizes="200px" className="lg-still-rank" />
          ) : null}
        </div>
      ) : null}
    </Feature>
  );
}

function PullList({ pulls, hidden = false }: { pulls: readonly LandingPull[]; hidden?: boolean }) {
  return (
    <ul aria-hidden={hidden || undefined}>
      {pulls.map((pull) => {
        const alt = hidden ? "" : `${pull.label}, pulled by @${pull.handle}`;
        const { props } = getImageProps({ src: pull.photoUrl, alt, width: 250, height: 350, sizes: "184px", quality: 75 });
        return (
          <li key={pull.cardId} className="lg-glass">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img {...props} alt={alt} />
            <span className="lg-wall-handle">@{pull.handle}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** A slow row of approved public pulls. Not drawn without pulls.json. */
export function PullsWall({ pulls }: { pulls: readonly LandingPull[] | null }) {
  if (!pulls?.length) return null;
  return (
    <section className="lg-wall" data-section="pulls" aria-label="Pulls from collectors">
      <div className="lg-wall-track">
        <PullList pulls={pulls} />
        <PullList pulls={pulls} hidden />
      </div>
    </section>
  );
}

/** Off unless NEXT_PUBLIC_LANDING_HIT_REVEALS is exactly "1". */
export function hitRevealsEnabled(
  env: { NEXT_PUBLIC_LANDING_HIT_REVEALS?: string } = {
    NEXT_PUBLIC_LANDING_HIT_REVEALS: process.env.NEXT_PUBLIC_LANDING_HIT_REVEALS,
  },
): boolean {
  return env.NEXT_PUBLIC_LANDING_HIT_REVEALS === "1";
}

/** One quiet card. No footage, no art. */
export function HitRevealsSection() {
  if (!hitRevealsEnabled()) return null;
  return (
    <section className="lg-section lg-rise" data-section="hit-reveals" data-media="none">
      <div className="lg-soon lg-glass">
        <p className="lg-tag">Coming soon</p>
        <p>Crystal Shatter · Storm Strike · Pixel Rebuild</p>
      </div>
    </section>
  );
}

/** The last word: the glass slab again, with both ways in. */
export function JoinSection() {
  return (
    <section className="lg-section" data-section="join">
      <div className="lg-join lg-glass lg-rise">
        <NoHeadPreload>
          <Logo className="h-12 w-12" />
        </NoHeadPreload>
        <h2 className="lg-h2">Join Slabhold</h2>
        <div className="lg-ctas">
          <AppStoreBadge variant="primary" />
          <LandingOpen />
        </div>
      </div>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="lg-footer">
      <Link href="/privacy" prefetch={false} className="hit-44 inline-flex items-center">
        Privacy
      </Link>
      <Link href="/terms" prefetch={false} className="hit-44 inline-flex items-center">
        Terms
      </Link>
      <Link href="/support" prefetch={false} className="hit-44 inline-flex items-center">
        Support
      </Link>
      <p className="lg-tagline">Built by collectors, for collectors.</p>
    </footer>
  );
}

import Link from "next/link";
import { getImageProps } from "next/image";
import { AppStoreBadge } from "@/components/landing/app-store-badge";
import { LandingOpen } from "@/components/landing/landing-links";
import { LandingTimeline } from "@/components/landing/landing-timeline";
import { ScreenClip } from "@/components/landing/screen-clip";
import { NoHeadPreload } from "@/components/landing/no-head-preload";
import { Logo } from "@/components/logo";
import type { LandingMedia, MediaSlot } from "@/lib/landing/media";
import type { LandingPost } from "@/lib/landing/timeline";

/*
 * The landing page in order: hero, the timeline, five features, the close.
 * Each feature is one heading and one line, plus its real iPhone screens
 * when the files exist (lib/landing/media.ts): a still, or a short recording
 * that plays in view. A missing file draws nothing: no stand-in, no broken box.
 */

export const HERO_TITLE = "Talk cards here.";
export const HERO_SUB =
  "A timeline that's only cards. Post pickups and pulls, follow collectors who chase what you chase, and see what cards really sold for.";
export const HERO_CARD_ALT = "A Jaxson Dart rookie card, orange and numbered 091/199, in a one-touch case";

type Shot = { slot: MediaSlot | null; alt: string };

/**
 * Real screens of the app in a plain frame: rounded corners and a thin
 * border. Each is a lazy still at its real size, so nothing shifts when it
 * loads; one with a recording plays it once it is on screen (screen-clip.tsx).
 */
function Screens({ shots, big = false }: { shots: readonly Shot[]; big?: boolean }) {
  const present = shots.filter((shot): shot is { slot: MediaSlot; alt: string } => shot.slot !== null);
  if (!present.length) return null;
  return (
    <div className="lp-screens" data-screens={present.length} data-big={big ? "" : undefined}>
      {present.map(({ slot, alt }) => {
        const { props } = getImageProps({
          src: slot.src,
          alt,
          width: slot.width,
          height: slot.height,
          sizes: big ? "(min-width: 1024px) 340px, 78vw" : "(min-width: 1024px) 260px, 44vw",
          quality: 75,
        });
        const still = { src: props.src, srcSet: props.srcSet, sizes: props.sizes, width: slot.width, height: slot.height, alt };
        if (slot.video) return <ScreenClip key={slot.src} still={still} video={slot.video} />;
        return (
          <div key={slot.src} className="lp-screen" data-landing-screen="still">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img {...still} alt={alt} loading="lazy" decoding="async" />
          </div>
        );
      })}
    </div>
  );
}

/** The mark of a numbered card: which section this is, out of five. */
function Count({ at }: { at: number }) {
  return (
    <span aria-hidden className="lp-count">
      {`0${at}/06`}
    </span>
  );
}

export function Hero({ card }: { card: MediaSlot | null }) {
  const photo = card
    ? getImageProps({
        src: card.src,
        alt: HERO_CARD_ALT,
        width: card.width,
        height: card.height,
        sizes: "(min-width: 1024px) 360px, 208px",
        quality: 75,
        loading: "eager",
        fetchPriority: "high",
      }).props
    : null;
  return (
    <section className="lp-hero" data-section="hero" data-hero-card={photo ? "real" : "none"}>
      <div className="lp-hero-copy">
        <h1 className="lp-h1">{HERO_TITLE}</h1>
        <p className="lp-sub">{HERO_SUB}</p>
        <div className="lp-ctas">
          <AppStoreBadge variant="primary" />
          <LandingOpen />
        </div>
      </div>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img {...photo} alt={HERO_CARD_ALT} className="lp-hero-card" />
      ) : null}
    </section>
  );
}

export function TimelineSection({ posts, media }: { posts: readonly LandingPost[]; media: LandingMedia }) {
  const shots: Shot[] = [
    { slot: media.screens.homeForYou, alt: "Home in the Slabhold app, on the For you timeline" },
    { slot: media.screens.homePost, alt: "A post opened in the Slabhold app, with its card photo" },
  ];
  return (
    <section className="lp-section" data-section="timeline" data-media={posts.length || shots.some((shot) => shot.slot) ? "real" : "none"}>
      <div className="lp-copy">
        <Count at={1} />
        <h2 className="lp-h2">A timeline that&apos;s only cards.</h2>
      </div>
      <div className="lp-timeline-body">
        <LandingTimeline posts={posts} />
        <Screens shots={shots} />
      </div>
    </section>
  );
}

function Feature({
  id,
  at,
  title,
  line,
  shots,
  big = false,
}: {
  id: string;
  at: number;
  title: string;
  line: string;
  shots: readonly Shot[];
  big?: boolean;
}) {
  return (
    <section className="lp-section" data-section={id} data-media={shots.some((shot) => shot.slot) ? "real" : "none"}>
      <div className="lp-copy">
        <Count at={at} />
        <h2 className="lp-h2">{title}</h2>
        <p className="lp-line">{line}</p>
      </div>
      <Screens shots={shots} big={big} />
    </section>
  );
}

/** The row of cards a profile opens on. It gets the big spot, right under the timeline. */
export function ProfileCardsSection({ media }: { media: LandingMedia }) {
  return (
    <Feature
      id="profile-cards"
      at={2}
      title="Your cards, front and center"
      line="Your profile opens on your cards, in a row you can scroll."
      shots={[{ slot: media.screens.profileCards, alt: "A profile in the Slabhold app, with its row of cards scrolling sideways" }]}
      big
    />
  );
}

/** Reveal and sales first when only two of the three scan screens are there. */
export function scanShots(media: LandingMedia): Shot[] {
  const camera: Shot = { slot: media.screens.scanCamera, alt: "The Scan tab in the Slabhold app, with the box guides on a card" };
  const reveal: Shot = { slot: media.screens.scanReveal, alt: "The scan reveal of a card in the Slabhold app" };
  const sales: Shot = { slot: media.screens.cardSales ?? media.screens.scanSales, alt: "The sold prices for a scanned card in the Slabhold app" };
  return reveal.slot && sales.slot && !camera.slot ? [reveal, sales] : [camera, reveal, sales];
}

export function ScanSection({ media }: { media: LandingMedia }) {
  return (
    <Feature
      id="scan"
      at={3}
      title="Scan a card. See what it sold for."
      line="Crop and straighten, a typed reveal, then the sold prices for that exact card."
      shots={scanShots(media)}
    />
  );
}

export function CollectionSection({ media }: { media: LandingMedia }) {
  return (
    <Feature
      id="collection"
      at={4}
      title="Your cards, and what they're worth."
      line="A cards-first grid, a value you can scrub, and the movers underneath."
      shots={[
        { slot: media.screens.collectionGrid, alt: "A collection in the Slabhold app, as a grid of cards" },
        { slot: media.screens.collectionValue, alt: "The collection value chart in the Slabhold app" },
      ]}
    />
  );
}

export function CatalogSection({ media }: { media: LandingMedia }) {
  return (
    <Feature
      id="catalog"
      at={5}
      title="Swipe the catalog."
      line="A feed of cards you can swipe through."
      shots={[{ slot: media.screens.catalogFeed, alt: "The catalog swipe feed in the Slabhold app" }]}
    />
  );
}

export function BoardSection({ media }: { media: LandingMedia }) {
  return (
    <Feature
      id="board"
      at={6}
      title="The weekly board."
      line="Climb it each week, and bring a buddy with you."
      shots={[
        { slot: media.screens.leaderboard, alt: "This week's leaderboard in the Slabhold app" },
        { slot: media.screens.invite, alt: "An invite in the Slabhold app" },
      ]}
    />
  );
}

/** The last word: the small logo and both ways in. */
export function JoinSection() {
  return (
    <section className="lp-join" data-section="join">
      <NoHeadPreload>
        <Logo className="h-10 w-10" />
      </NoHeadPreload>
      <h2 className="lp-h2">Join Slabhold</h2>
      <div className="lp-ctas">
        <AppStoreBadge variant="primary" />
        <LandingOpen />
      </div>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="lp-footer">
      <Link href="/privacy" prefetch={false} className="hit-44 inline-flex items-center">
        Privacy
      </Link>
      <Link href="/terms" prefetch={false} className="hit-44 inline-flex items-center">
        Terms
      </Link>
      <Link href="/support" prefetch={false} className="hit-44 inline-flex items-center">
        Support
      </Link>
      <p className="lp-tagline">Built by collectors, for collectors.</p>
    </footer>
  );
}

import { AppStoreBadge } from "@/components/landing/app-store-badge";
import { GlassHero, type HeroCard } from "@/components/landing/glass-hero";
import { LandingGalaxy } from "@/components/landing/landing-galaxy";
import { LandingLogin } from "@/components/landing/landing-links";
import { NoHeadPreload } from "@/components/landing/no-head-preload";
import { QuickCompSection } from "@/components/landing/quick-comp-section";
import {
  ArenaSection,
  CollectionSection,
  EdgeSerialSection,
  HitRevealsSection,
  JoinSection,
  LandingFooter,
  ParallelsSection,
  PullsWall,
  ScanSection,
} from "@/components/landing/sections";
import type { CompDemo } from "@/components/landing/showcase/sample-data";
import { Logo } from "@/components/logo";
import { APP_STORE_URL } from "@/lib/landing/app-store";
import type { FounderCard, FounderShowcase } from "@/lib/landing/founder";
import { readFounderShowcase } from "@/lib/landing/founder-showcase";
import { landingMedia, type LandingMedia } from "@/lib/landing/media";
import type { LandingPull } from "@/lib/landing/pulls";
import { SITE_URL } from "@/lib/site-url";

/** schema.org facts about the iOS app. No ratings: we have none to state. */
export const APP_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "MobileApplication",
  name: "Slabhold",
  operatingSystem: "iOS",
  applicationCategory: "LifestyleApplication",
  url: SITE_URL,
  installUrl: APP_STORE_URL,
} as const;

function cardAlt(card: FounderCard): string {
  return [card.playerName, [card.yearLabel, card.setBrand].filter(Boolean).join(" "), card.grade].filter(Boolean).join(", ");
}

/** The slab's card: the supplied hero photo, else the first real card of the showcase, else none. */
function heroCard(media: LandingMedia, cards: readonly FounderCard[]): HeroCard | null {
  if (media.heroCard) return { src: media.heroCard.src, alt: media.heroCardFacts.alt || "A numbered sports card" };
  const first = cards[0];
  return first ? { src: first.photoUrl, alt: cardAlt(first) } : null;
}

/**
 * Signed-out Home, drawn on the server: the hero paints from the HTML and
 * never redraws. Real things only. `founder` is the hour-cached showcase of
 * real public card photos, `comp` one real card's stored sold prices, `pulls`
 * the approved pulls, and `media` the real files in public/landing/media.
 * Whatever is missing is simply not drawn. The client code is the links that
 * read ?next=, the App Store button, the slab's tilt, the pause controls and
 * the Quick Comp panel.
 */
export function LandingPage({
  founder = null,
  comp = null,
  pulls = null,
  media = landingMedia(),
}: {
  founder?: FounderShowcase | null;
  comp?: CompDemo | null;
  pulls?: readonly LandingPull[] | null;
  media?: LandingMedia;
}) {
  const cards = founder ? readFounderShowcase(founder).cards : [];
  // Oldest first, so the line reads left to right.
  const prices = comp?.real ? comp.sales.map((sale) => sale.price).reverse() : null;
  return (
    <div data-always-dark="" data-art="" className="lg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(APP_JSON_LD) }} />
      <LandingGalaxy />
      <header className="lg-nav lg-glass">
        <div className="lg-nav-row">
          <span className="lg-brand">
            <NoHeadPreload>
              <Logo />
            </NoHeadPreload>
            Slabhold
          </span>
          <div className="lg-nav-actions">
            <LandingLogin />
            <AppStoreBadge variant="nav" />
          </div>
        </div>
      </header>

      <main className="relative">
        <GlassHero card={heroCard(media, cards)} prices={prices} serial={media.heroCard ? media.heroCardFacts.serial : ""} />
        <ScanSection clip={media.scan} />
        <EdgeSerialSection clip={media.serial} macro={media.serialMacro} />
        <ParallelsSection clip={media.parallels} />
        <CollectionSection clip={media.collection} cards={cards} />
        <ArenaSection clip={media.arena} shareRank={media.shareRank} />
        <PullsWall pulls={pulls} />
        <HitRevealsSection />
        <QuickCompSection />
        <JoinSection />
      </main>
      <LandingFooter />
    </div>
  );
}

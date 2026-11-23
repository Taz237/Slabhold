import { AppStoreBadge } from "@/components/landing/app-store-badge";
import { LandingLogin } from "@/components/landing/landing-links";
import { NoHeadPreload } from "@/components/landing/no-head-preload";
import {
  BoardSection,
  CatalogSection,
  CollectionSection,
  Hero,
  JoinSection,
  LandingFooter,
  ProfileCardsSection,
  ScanSection,
  TimelineSection,
} from "@/components/landing/sections";
import { Logo } from "@/components/logo";
import { APP_STORE_URL } from "@/lib/landing/app-store";
import { landingMedia, type LandingMedia } from "@/lib/landing/media";
import type { LandingPost } from "@/lib/landing/timeline";
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

/**
 * Signed-out Home, drawn on the server: it paints from the HTML and never
 * redraws. Real things only. `posts` are a few recent public posts, read on
 * the server and cached; `media` is the hero card photo and whichever real
 * iPhone screens exist in public/landing/screens. Whatever is missing is
 * simply not drawn. The only client code is the links that read ?next=, the
 * App Store badge, and the bit that plays a recording once it is on screen.
 */
export function LandingPage({
  posts = [],
  media = landingMedia(),
}: {
  posts?: readonly LandingPost[];
  media?: LandingMedia;
}) {
  return (
    <div data-always-dark="" data-art="" className="lp">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(APP_JSON_LD) }} />
      <header className="lp-nav">
        <div className="lp-nav-row">
          <span className="lp-brand">
            <NoHeadPreload>
              <Logo className="h-7 w-7" />
            </NoHeadPreload>
            Slabhold
          </span>
          <div className="lp-nav-actions">
            <LandingLogin />
            <AppStoreBadge variant="nav" />
          </div>
        </div>
      </header>

      <main>
        <Hero card={media.heroCard} />
        <TimelineSection posts={posts} media={media} />
        <ProfileCardsSection media={media} />
        <ScanSection media={media} />
        <CollectionSection media={media} />
        <CatalogSection media={media} />
        <BoardSection media={media} />
        <JoinSection />
      </main>
      <LandingFooter />
    </div>
  );
}

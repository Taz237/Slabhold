"use client";

import { HomeFeedLazy } from "@/components/home-feed-lazy";
import { LandingPage } from "@/components/landing-page";
import { StandaloneLoginGate } from "@/components/onboarding/standalone-login";
import { useSocial } from "@/components/social-provider";
import { sessionHinted } from "@/lib/auth/session-hint";
import type { FounderShowcase } from "@/lib/landing/founder";
import type { MovingTodayPayload } from "@/lib/moving-today/types";

// A session cookie says someone is signed in: fetch the timeline now, while
// the page hydrates and the snapshot loads, so it is in hand when they land.
if (sessionHinted()) void HomeFeedLazy.preload().catch(() => {});

/**
 * Home: the landing page for signed-out visitors, the timeline for everyone
 * else. The installed app goes to log in instead of the landing page.
 */
export function HomeGate({
  founder,
  movers,
}: {
  founder: FounderShowcase | null;
  movers: MovingTodayPayload | null;
}) {
  const { ready, user } = useSocial();
  if (!user) {
    // Drawn from the server HTML on the first paint. While the snapshot loads,
    // CSS hides it when a session cookie says someone is signed in.
    return (
      <div data-guest-pending={ready ? undefined : ""} className="contents">
        <StandaloneLoginGate>
          <LandingPage founder={founder} />
        </StandaloneLoginGate>
      </div>
    );
  }
  return <HomeFeedLazy movers={movers} />;
}

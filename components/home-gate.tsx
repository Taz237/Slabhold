"use client";

import type { ReactNode } from "react";
import { HomeFeedLazy, preloadHomeFeed } from "@/components/home-feed-lazy";
import { StandaloneLoginGate } from "@/components/onboarding/standalone-login";
import { useSocial } from "@/components/social-provider";
import { sessionHinted } from "@/lib/auth/session-hint";
import type { HomeSeed } from "@/lib/social/home-seed";
import { useClientHomeSeed } from "@/lib/social/use-client-home-seed";
import type { MovingTodayPayload } from "@/lib/moving-today/types";

// A session cookie says someone is signed in: fetch the timeline now, while
// the page hydrates and the snapshot loads, so it is in hand when they land.
if (sessionHinted()) preloadHomeFeed();

/**
 * Home: the landing page for signed-out visitors, the timeline for everyone
 * else. The installed app goes to log in instead of the landing page.
 * `landing` is drawn on the server, so the session snapshot never redraws it.
 * `seed` is the timeline's first screen, read on the server for a signed-in
 * page load. Without one (a visit from inside the app), the browser reads
 * the same first screen itself while the snapshot loads. Either way the
 * timeline draws before the snapshot is in, and it is the same tree, so it
 * never remounts.
 */
export function HomeGate({
  landing,
  movers,
  seed: serverSeed = null,
}: {
  landing: ReactNode;
  movers: MovingTodayPayload | null;
  seed?: HomeSeed | null;
}) {
  const { ready, user } = useSocial();
  const seed = useClientHomeSeed({ serverSeed, ready, viewerId: user?.id ?? null });
  if (!user && (ready || !seed)) {
    // Drawn from the server HTML on the first paint. While the snapshot loads,
    // CSS hides it when a session cookie says someone is signed in.
    return (
      <div data-guest-pending={ready ? undefined : ""} className="contents">
        <StandaloneLoginGate>
          {landing}
        </StandaloneLoginGate>
      </div>
    );
  }
  return <HomeFeedLazy movers={movers} seed={seed} />;
}

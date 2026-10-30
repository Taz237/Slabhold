"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { HomeFeedLazy } from "@/components/home-feed-lazy";
import { StandaloneLoginGate } from "@/components/onboarding/standalone-login";
import { SeededSocial } from "@/components/social-seed";
import { useSocial } from "@/components/social-provider";
import { sessionHinted } from "@/lib/auth/session-hint";
import type { HomeSeed } from "@/lib/social/home-seed";
import type { MovingTodayPayload } from "@/lib/moving-today/types";

// A session cookie says someone is signed in: fetch the timeline now, while
// the page hydrates and the snapshot loads, so it is in hand when they land.
// (A server-drawn Home loads the same chunk to hydrate its first screen.)
if (sessionHinted()) void HomeFeedLazy.preload().catch(() => {});

/**
 * The same timeline chunk, drawn on the server when the request came with a
 * first page. Hydration waits for the chunk; the server HTML shows meanwhile.
 */
const HomeFeedSeeded = dynamic(() => import("@/components/home-feed").then((mod) => mod.HomeFeed));

/**
 * Home: the landing page for signed-out visitors, the timeline for everyone
 * else. The installed app goes to log in instead of the landing page.
 * `landing` is drawn on the server, so the session snapshot never redraws it.
 * `seed` is the timeline's first screen, read on the server for a signed-in
 * request. With it the timeline draws before the snapshot is in.
 */
export function HomeGate({
  landing,
  movers,
  seed = null,
}: {
  landing: ReactNode;
  movers: MovingTodayPayload | null;
  seed?: HomeSeed | null;
}) {
  const { ready, user } = useSocial();
  if (seed && (user || !ready)) {
    return (
      <SeededSocial seed={seed}>
        <HomeFeedSeeded movers={movers} seed={seed} />
      </SeededSocial>
    );
  }
  if (!user) {
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
  return <HomeFeedLazy movers={movers} />;
}

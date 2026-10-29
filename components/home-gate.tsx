"use client";

import type { ReactNode } from "react";
import { LandingPage } from "@/components/landing-page";
import { StandaloneLoginGate } from "@/components/onboarding/standalone-login";
import { useSocial } from "@/components/social-provider";
import type { FounderShowcase } from "@/lib/landing/founder";

/**
 * Home: the landing page for signed-out visitors, the timeline for everyone
 * else. The installed app goes to log in instead of the landing page.
 */
export function HomeGate({ founder, children }: { founder: FounderShowcase | null; children: ReactNode }) {
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
  return <>{children}</>;
}

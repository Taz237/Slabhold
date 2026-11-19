import type { Metadata } from "next";
import { Suspense } from "react";
import { HomeGate } from "@/components/home-gate";
import { LandingPage } from "@/components/landing-page";
import { LandingCompProvider } from "@/components/landing/landing-links";
import { landingCompDemo } from "@/lib/landing/founder-comp-load";
import { founderShowcase } from "@/lib/landing/founder-page";
import { landingPullsWall } from "@/lib/landing/pulls-load";
import { LANDING_DESCRIPTION, LANDING_OPEN_GRAPH, LANDING_TITLE, LANDING_TWITTER } from "@/lib/landing/seo";
import { requestHomeSeed } from "@/lib/social/request-home-seed";
import { isRouterRequest } from "@/lib/supabase/router-request";

/** The same words as /welcome, which a signed-out visitor is served at this address. */
export const metadata: Metadata = {
  title: LANDING_TITLE,
  description: LANDING_DESCRIPTION,
  openGraph: { ...LANDING_OPEN_GRAPH, images: [...LANDING_OPEN_GRAPH.images] },
  twitter: { ...LANDING_TWITTER, images: [...LANDING_TWITTER.images] },
};

/**
 * The landing page is a server component: its HTML ships, its code doesn't.
 *
 * Home renders per request: a signed-in load streams the timeline's first
 * screen (see requestHomeSeed). Only the landing data is cached. Nothing per
 * viewer is.
 */
export default async function Home() {
  // The cached reads run at once.
  const compRead = landingCompDemo();
  const pullsRead = landingPullsWall();
  const founder = await founderShowcase();
  const comp = await compRead;
  const pulls = await pullsRead;
  // The landing's Quick Comp reads the real card from LandingCompProvider.
  // A visit from inside the app already has the timeline in memory.
  const landing = <LandingPage founder={founder} comp={comp} pulls={pulls} />;
  if (await isRouterRequest()) {
    return (
      <LandingCompProvider comp={comp}>
        <HomeGate landing={landing} />
      </LandingCompProvider>
    );
  }
  return (
    <LandingCompProvider comp={comp}>
      <Suspense fallback={<HomeGate landing={null} />}>
        <SeededHome landing={landing} />
      </Suspense>
    </LandingCompProvider>
  );
}

async function SeededHome({ landing }: { landing: React.ReactNode }) {
  const seed = await requestHomeSeed();
  return <HomeGate landing={landing} seed={seed} />;
}

import { Suspense } from "react";
import { HomeGate } from "@/components/home-gate";
import { LandingPage } from "@/components/landing-page";
import { founderShowcase } from "@/lib/landing/founder-page";
import { requestHomeSeed } from "@/lib/social/request-home-seed";
import { isRouterRequest } from "@/lib/supabase/router-request";

/**
 * The landing page is a server component: its HTML ships, its code doesn't.
 *
 * Home renders per request: a signed-in load streams the timeline's first
 * screen (see requestHomeSeed). Only the landing data is cached. Nothing per
 * viewer is.
 */
export default async function Home() {
  const founder = await founderShowcase();
  // A visit from inside the app already has the timeline in memory.
  if (await isRouterRequest()) {
    return <HomeGate landing={<LandingPage founder={founder} />} />;
  }
  return (
    <Suspense fallback={<HomeGate landing={null} />}>
      <SeededHome landing={<LandingPage founder={founder} />} />
    </Suspense>
  );
}

async function SeededHome({ landing }: { landing: React.ReactNode }) {
  const seed = await requestHomeSeed();
  return <HomeGate landing={landing} seed={seed} />;
}

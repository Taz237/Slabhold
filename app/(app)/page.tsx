import { Suspense } from "react";
import { HomeGate } from "@/components/home-gate";
import { LandingPage } from "@/components/landing-page";
import { LandingCompProvider } from "@/components/landing/landing-links";
import { landingCompDemo } from "@/lib/landing/founder-comp-load";
import { landingFounderPickup } from "@/lib/landing/founder-pickup-load";
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
  // The cached reads run at once.
  const compRead = landingCompDemo();
  const pickupRead = landingFounderPickup();
  const founder = await founderShowcase();
  const comp = await compRead;
  const pickup = await pickupRead;
  // The landing's Quick Comp and timeline read the real cards from LandingCompProvider.
  // A visit from inside the app already has the timeline in memory.
  if (await isRouterRequest()) {
    return (
      <LandingCompProvider comp={comp} pickup={pickup}>
        <HomeGate landing={<LandingPage founder={founder} />} />
      </LandingCompProvider>
    );
  }
  return (
    <LandingCompProvider comp={comp} pickup={pickup}>
      <Suspense fallback={<HomeGate landing={null} />}>
        <SeededHome landing={<LandingPage founder={founder} />} />
      </Suspense>
    </LandingCompProvider>
  );
}

async function SeededHome({ landing }: { landing: React.ReactNode }) {
  const seed = await requestHomeSeed();
  return <HomeGate landing={landing} seed={seed} />;
}

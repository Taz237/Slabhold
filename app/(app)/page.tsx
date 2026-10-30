import { Suspense } from "react";
import { HomeGate } from "@/components/home-gate";
import { LandingPage } from "@/components/landing-page";
import { founderShowcase } from "@/lib/landing/founder-page";
import { getMovingToday } from "@/lib/moving-today/load";
import type { MovingTodayPayload } from "@/lib/moving-today/types";
import { requestHomeSeed } from "@/lib/social/request-home-seed";
import { isRouterRequest } from "@/lib/supabase/router-request";

/** Cached sales for the timeline's movers row. Null falls back to the client read. */
async function movers(): Promise<MovingTodayPayload | null> {
  try {
    return await getMovingToday();
  } catch {
    return null;
  }
}

/**
 * The movers row goes down as data, not as rendered client components, so
 * signed-out Home doesn't load the timeline's chunks just to skip them. The
 * landing page is a server component: its HTML ships, its code doesn't.
 *
 * Home renders per request: a signed-in load streams the timeline's first
 * screen (see requestHomeSeed). Only the shared movers row and landing data
 * are cached. Nothing per viewer is.
 */
export default async function Home() {
  const [founder, payload] = await Promise.all([founderShowcase(), movers()]);
  // A visit from inside the app already has the timeline in memory.
  if (await isRouterRequest()) {
    return <HomeGate landing={<LandingPage founder={founder} />} movers={payload} />;
  }
  return (
    <Suspense fallback={<HomeGate landing={null} movers={payload} />}>
      <SeededHome landing={<LandingPage founder={founder} />} movers={payload} />
    </Suspense>
  );
}

async function SeededHome({ landing, movers }: { landing: React.ReactNode; movers: MovingTodayPayload | null }) {
  const seed = await requestHomeSeed();
  return <HomeGate landing={landing} movers={movers} seed={seed} />;
}

import { HomeGate } from "@/components/home-gate";
import { LandingPage } from "@/components/landing-page";
import { founderShowcase } from "@/lib/landing/founder-page";
import { getMovingToday } from "@/lib/moving-today/load";
import type { MovingTodayPayload } from "@/lib/moving-today/types";

export const revalidate = 1800;

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
 */
export default async function Home() {
  const [founder, payload] = await Promise.all([founderShowcase(), movers()]);
  return <HomeGate landing={<LandingPage founder={founder} />} movers={payload} />;
}

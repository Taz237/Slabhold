import { HomeGate } from "@/components/home-gate";
import { EMPTY_FOUNDER_SHOWCASE, type FounderShowcase } from "@/lib/landing/founder";
import { cachedFounderShowcase } from "@/lib/landing/founder-load";
import { getMovingToday } from "@/lib/moving-today/load";
import type { MovingTodayPayload } from "@/lib/moving-today/types";

export const revalidate = 1800;

/** Read with the page, so the landing hero has its slabs on the first paint. */
async function founderShowcase(): Promise<FounderShowcase> {
  try {
    return await cachedFounderShowcase();
  } catch (error) {
    console.warn("[landing-founder]", error instanceof Error ? error.message : "read failed");
    return EMPTY_FOUNDER_SHOWCASE;
  }
}

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
 * signed-out Home doesn't load the timeline's chunks just to skip them.
 */
export default async function Home() {
  const [founder, payload] = await Promise.all([founderShowcase(), movers()]);
  return <HomeGate founder={founder} movers={payload} />;
}

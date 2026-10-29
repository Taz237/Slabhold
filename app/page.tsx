import { FeedView } from "@/components/feed-view";
import { HomeGate } from "@/components/home-gate";
import { MovingTodaySlot } from "@/components/moving-today-slot";
import { EMPTY_FOUNDER_SHOWCASE, type FounderShowcase } from "@/lib/landing/founder";
import { cachedFounderShowcase } from "@/lib/landing/founder-load";

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

export default async function Home() {
  const founder = await founderShowcase();
  return (
    <HomeGate founder={founder}>
      <FeedView movingToday={<MovingTodaySlot />} />
    </HomeGate>
  );
}

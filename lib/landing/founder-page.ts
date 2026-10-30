import { EMPTY_FOUNDER_SHOWCASE, type FounderShowcase } from "@/lib/landing/founder";
import { cachedFounderShowcase } from "@/lib/landing/founder-load";

/** Read with the page, so the landing hero has its slabs on the first paint. */
export async function founderShowcase(): Promise<FounderShowcase> {
  try {
    return await cachedFounderShowcase();
  } catch (error) {
    console.warn("[landing-founder]", error instanceof Error ? error.message : "read failed");
    return EMPTY_FOUNDER_SHOWCASE;
  }
}

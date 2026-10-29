import { EMPTY_FOUNDER_SHOWCASE, type FounderShowcase } from "./founder";

export const FOUNDER_CACHE_CONTROL = "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400";

/** A failed read is retried within a minute, never held for an hour. */
export const FOUNDER_FAILED_CACHE_CONTROL = "public, max-age=0, s-maxage=60";

/** The landing route's response: the showcase for an hour, or empty for a minute when the read fails. */
export async function founderResponse(load: () => Promise<FounderShowcase>): Promise<Response> {
  try {
    return Response.json(await load(), {
      headers: { "Cache-Control": FOUNDER_CACHE_CONTROL },
    });
  } catch (error) {
    console.warn("[landing-founder]", error instanceof Error ? error.message : "read failed");
    return Response.json(EMPTY_FOUNDER_SHOWCASE, {
      headers: { "Cache-Control": FOUNDER_FAILED_CACHE_CONTROL },
    });
  }
}

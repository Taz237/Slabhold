import { loadFounderShowcase } from "@/lib/landing/founder-load";
import { EMPTY_FOUNDER_SHOWCASE } from "@/lib/landing/founder";

export const runtime = "nodejs";

/** About an hour. The landing page falls back to sample slabs while this loads or fails. */
export const revalidate = 3600;

const CACHE_CONTROL = "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400";

/** The founder's public profile and top 3 public card photos for the signed-out landing page. */
export async function GET() {
  try {
    return Response.json(await loadFounderShowcase(), {
      headers: { "Cache-Control": CACHE_CONTROL },
    });
  } catch (error) {
    console.warn("[landing-founder]", error instanceof Error ? error.message : "read failed");
    return Response.json(EMPTY_FOUNDER_SHOWCASE, {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=60" },
    });
  }
}

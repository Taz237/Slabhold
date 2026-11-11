import { cachedFounderShowcase } from "@/lib/landing/founder-load";
import { founderResponse } from "@/lib/landing/founder-response";

export const runtime = "nodejs";

/** About an hour (s-maxage=3600). The landing page falls back to sample slabs while this loads or fails. */
export const revalidate = 3600;

/** Top 3 public card photos for the signed-out landing page. No name, handle or avatar. */
export async function GET() {
  return founderResponse(cachedFounderShowcase);
}

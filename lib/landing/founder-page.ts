import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { EMPTY_FOUNDER_SHOWCASE, type FounderShowcase } from "@/lib/landing/founder";
import { cachedFounderShowcase } from "@/lib/landing/founder-load";

function warnFounder(error: unknown) {
  console.warn("[landing-founder]", error instanceof Error ? error.message : "read failed");
}

/** Read with the page, so the landing hero has its slabs on the first paint. */
export async function founderShowcase(): Promise<FounderShowcase> {
  try {
    return await cachedFounderShowcase();
  } catch (error) {
    warnFounder(error);
    return EMPTY_FOUNDER_SHOWCASE;
  }
}

/**
 * What a failed read becomes on /welcome. During `next build` it is the
 * sample slabs, so a build without Supabase still passes. Outside production
 * (`next dev`, tests) it is the sample slabs too, so a missing or flaky local
 * Supabase never breaks the page. In production at runtime it throws, so ISR
 * keeps serving the last good page and the next request tries again, instead
 * of caching sample slabs for the whole revalidate.
 */
export function founderFailure(
  error: unknown,
  phase: string | undefined,
  nodeEnv: string | undefined,
): FounderShowcase {
  if (phase === PHASE_PRODUCTION_BUILD || nodeEnv !== "production") return EMPTY_FOUNDER_SHOWCASE;
  throw error;
}

/** /welcome's read. Home keeps founderShowcase, which never throws. */
export async function welcomeFounderShowcase(
  read: () => Promise<FounderShowcase> = cachedFounderShowcase,
  phase: string | undefined = process.env.NEXT_PHASE,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): Promise<FounderShowcase> {
  try {
    return await read();
  } catch (error) {
    warnFounder(error);
    return founderFailure(error, phase, nodeEnv);
  }
}

import { schemaMissing, type InterestLoad } from "@/lib/social/collect-interests";

/** One more try after this long: a blip on a new account's first screen shouldn't skip setup. */
export const INTEREST_READ_RETRY_MS = 1500;

/** A missing table means this build has no interests. Anything else is a failed read. */
export function interestLoadFromError(error: { code?: string; message?: string } | null | undefined): InterestLoad {
  return schemaMissing(error) ? { status: "missing" } : { status: "error" };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Read, and once more on a failed read. A throw counts as a failed read. */
export async function readInterestsWithRetry(
  read: () => Promise<InterestLoad>,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<InterestLoad> {
  const once = () => read().catch((): InterestLoad => ({ status: "error" }));
  const first = await once();
  if (first.status !== "error") return first;
  await wait(INTEREST_READ_RETRY_MS);
  return once();
}

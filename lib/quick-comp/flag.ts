/**
 * Quick Comp: comp a card from Home without adding it. Off unless this is
 * exactly "1". NEXT_PUBLIC_ so the Home entry in the client feed can read it;
 * Next inlines it at build, so off is dead code and a toggle needs a redeploy.
 */
export function quickCompEnabled(
  env: { NEXT_PUBLIC_QUICK_COMP?: string } = {
    NEXT_PUBLIC_QUICK_COMP: process.env.NEXT_PUBLIC_QUICK_COMP,
  },
): boolean {
  return env.NEXT_PUBLIC_QUICK_COMP === "1";
}

export const QUICK_COMP_PATH = "/comp";

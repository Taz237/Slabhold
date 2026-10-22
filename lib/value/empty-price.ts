/**
 * Estimated value, sold comps, and recent sales are all empty.
 * Callers keep the separate blocks while a request is still loading or blocked.
 */
export function shouldCollapseEmptyPrices(input: {
  loading: boolean;
  blocked: boolean;
  settled: boolean;
  hasEstimate: boolean;
  hasSales: boolean;
}): boolean {
  if (input.loading || input.blocked || !input.settled) return false;
  return !input.hasEstimate && !input.hasSales;
}

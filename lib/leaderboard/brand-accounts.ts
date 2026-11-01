/**
 * Slabhold's own brand accounts. They stay off every weekly board.
 * @slabhold, matched by profile id, never by handle.
 */
export const BRAND_ACCOUNT_IDS = ["744fedf0-f012-4c9d-841f-18531fdde340"] as const;

function norm(id: string): string {
  return id.trim().toLowerCase();
}

const BRAND_IDS = new Set<string>(BRAND_ACCOUNT_IDS.map(norm));

/** True only for a brand account's profile id. A matching handle is not enough. */
export function isBrandAccount(id: string | null | undefined): boolean {
  if (!id) return false;
  const value = norm(id);
  return value !== "" && BRAND_IDS.has(value);
}

export type BandValueRow = {
  cardId: string;
  /** True when this card is in public_cards. */
  inPublicCards: boolean;
  median: number | null;
  low: number | null;
  nSales: number | null;
  matchedAt: string | null;
};

/**
 * Newest stored median among public copies and the poster's own card.
 * Another user's private card never contributes, even if its value is newer.
 * Null matched_at sorts first, matching card_values `order by matched_at desc`.
 */
export function identityBandValue(
  rows: BandValueRow[],
  posterCardId: string,
): { median: number; low: number | null } | null {
  const allowed = rows.filter(
    (row) => row.inPublicCards || row.cardId === posterCardId,
  );
  const ranked = [...allowed].sort((a, b) => compareMatchedAt(a.matchedAt, b.matchedAt));
  const row = ranked.find(
    (value) => value.median != null && Number(value.nSales) > 0,
  );
  if (!row || row.median == null) return null;
  return {
    median: Number(row.median),
    low: row.low == null ? null : Number(row.low),
  };
}

/** Negative when `a` should come first: nulls, then newest timestamp. */
function compareMatchedAt(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  return a < b ? 1 : -1;
}

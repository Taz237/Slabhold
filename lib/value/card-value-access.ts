/** Max card ids accepted by GET /api/card-values. */
export const MAX_CARD_VALUE_IDS = 100;

/** Postgres uuid text. Invalid ids are skipped, not queried. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export type ParsedCardValueIds =
  | { ok: true; ids: string[] }
  | { ok: false; error: "empty" | "too_many" };

/** Dedupe trimmed ids. More than 100 is rejected, not silently trimmed. */
export function parseCardValueIds(parts: string[]): ParsedCardValueIds {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const id = part.trim();
    if (!id || !isUuid(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length > MAX_CARD_VALUE_IDS) return { ok: false, error: "too_many" };
  }
  if (!ids.length) return { ok: false, error: "empty" };
  return { ok: true, ids };
}

/**
 * Ids a caller may read.
 * Logged out: ownedIds is empty, so only public_cards ids remain.
 * Signed in: public ids plus that user's own cards (including private).
 * Anything else is dropped.
 */
export function visibleCardIds(
  requested: readonly string[],
  publicIds: ReadonlySet<string>,
  ownedIds: ReadonlySet<string>,
): string[] {
  return requested.filter((id) => publicIds.has(id) || ownedIds.has(id));
}

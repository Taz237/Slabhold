import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";
import { normalizeSearchText } from "@/lib/card-search-query";

/** Fields compared to decide the save still matches the catalog row the user picked. */
export type CatalogPickSnapshot = {
  playerName: string;
  yearLabel: string;
  setBrand: string;
  cardNumber: string;
  parallel: string;
};

/**
 * Submit a staging row when the set or parallel was typed, or the card was not
 * chosen from the catalog. A catalog pick that is still unchanged and not custom
 * stays out of the queue.
 */
export function shouldSubmitCatalogCard(input: {
  setIsCustom: boolean;
  parallelIsCustom: boolean;
  pickedFromCatalog: boolean;
}): boolean {
  return input.setIsCustom || input.parallelIsCustom || !input.pickedFromCatalog;
}

export function catalogPickStillMatches(
  pick: CatalogPickSnapshot | null | undefined,
  current: CatalogPickSnapshot,
): boolean {
  if (!pick) return false;
  const same = (left: string, right: string) =>
    left.trim().toLowerCase() === right.trim().toLowerCase();
  return (
    same(pick.playerName, current.playerName) &&
    same(pick.yearLabel, current.yearLabel) &&
    same(pick.setBrand, current.setBrand) &&
    same(pick.cardNumber, current.cardNumber) &&
    same(pick.parallel || "Base", current.parallel || "Base")
  );
}

/** Same normalized identity approve_catalog_consensus groups on. */
export function catalogSubmissionIdentity(input: {
  player: string;
  yearLabel?: string | null;
  product?: string | null;
  cardNumber?: string | null;
  parallel?: string | null;
}): string {
  return [
    normalizeSearchText(input.player),
    normalizeSearchText(input.yearLabel ?? ""),
    normalizeSearchText(input.product ?? ""),
    normalizeSearchText(input.cardNumber ?? ""),
    normalizeSearchText(input.parallel || "Base"),
  ].join("|");
}

/** Identities submitted by at least `minimumUsers` different users. Empty players never qualify. */
export function identitiesWithUserConsensus(
  rows: readonly { userId: string; identity: string }[],
  minimumUsers = 2,
): string[] {
  const users = new Map<string, Set<string>>();
  for (const row of rows) {
    const player = row.identity.split("|")[0] ?? "";
    if (!row.userId || !player) continue;
    const seen = users.get(row.identity) ?? new Set<string>();
    seen.add(row.userId);
    users.set(row.identity, seen);
  }
  return [...users.entries()]
    .filter(([, seen]) => seen.size >= minimumUsers)
    .map(([identity]) => identity)
    .sort();
}

/** Log a catalog search that returned no rows. Short queries stay out of the table. */
export function shouldLogCatalogSearchMiss(query: string, remoteCount: number | null): boolean {
  if (remoteCount !== 0) return false;
  const q = query.trim();
  return q.length >= 3 && q.length <= 100;
}

export type CatalogQueueRpc = (
  fn: "submit_catalog_card" | "log_catalog_search_miss",
  args: Record<string, unknown>,
) => Promise<{ error: { code?: string; message?: string } | null }>;

async function browserRpc(
  fn: "submit_catalog_card" | "log_catalog_search_miss",
  args: Record<string, unknown>,
): Promise<{ error: { code?: string; message?: string } | null }> {
  const supabase = await loadSupabaseBrowser();
  if (!supabase) return { error: null };
  const { error } = await supabase.rpc(fn, args);
  return { error: error ? { code: error.code, message: error.message } : null };
}

/**
 * Best-effort copy into catalog_staging. Missing RPC (migration not applied yet),
 * network errors, and permission errors are ignored so a card save never fails.
 */
export async function submitCatalogCardQuietly(
  cardId: string,
  rpc: CatalogQueueRpc = browserRpc,
): Promise<void> {
  if (!cardId) return;
  try {
    await rpc("submit_catalog_card", { card_id: cardId });
  } catch {
    // The card is already saved. Staging can wait for the next save.
  }
}

/** Best-effort miss log. Never throws, including when the RPC does not exist yet. */
export async function logCatalogSearchMissQuietly(
  query: string,
  rpc: CatalogQueueRpc = browserRpc,
): Promise<void> {
  const q = query.trim();
  if (q.length < 3 || q.length > 100) return;
  try {
    await rpc("log_catalog_search_miss", { q });
  } catch {
    // Search already finished. The miss log is optional.
  }
}

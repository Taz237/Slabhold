import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeIlike } from "@/lib/db/escape-ilike";
import { mapPublicCard } from "./cards";
import type { PublicCardRow } from "./remote";
import type { OwnedCard } from "./types";

/**
 * The reads behind the public card cache (lib/social/public-card-cache.ts).
 * Its own module so the provider can load it on first use, keeping it out of
 * every screen's first-load JS.
 */

/** Ids per query, so the URL stays well under PostgREST's limit. */
const ID_CHUNK = 100;
/** One owner's shelf. Same rows the full table gave for that owner. */
const OWNER_LIMIT = 1000;
/** Player names per read: one `or` of whole-name matches. */
const PLAYER_CHUNK = 8;
/** Copies of those players across every public collection (PostgREST's default max rows). */
const PLAYER_LIMIT = 1000;

function rowsOf(result: { data: unknown; error: { message: string } | null }): PublicCardRow[] {
  if (result.error) throw new Error(result.error.message);
  return Array.isArray(result.data) ? (result.data as PublicCardRow[]) : [];
}

/**
 * The `.or()` filter for whole-name, case-insensitive matches on `player`.
 * Each name is LIKE-escaped, then double-quoted with `"` and `\` backslash-escaped,
 * because `.` and `,` (as in "C.J. Stroud") are reserved in `or` filters.
 */
export function playerIlikeOr(names: readonly string[]): string {
  return names
    .map((name) => `player.ilike."${escapeIlike(name).replace(/["\\]/g, (char) => `\\${char}`)}"`)
    .join(",");
}

/** One read per id chunk, per owner, and per chunk of players. Never the whole table. */
export async function loadPublicCardsForKeys(
  supabase: SupabaseClient,
  keys: readonly string[],
): Promise<OwnedCard[]> {
  const ids: string[] = [];
  const owners: string[] = [];
  const players: string[] = [];
  for (const key of keys) {
    const at = key.indexOf(":");
    const kind = key.slice(0, at);
    const value = key.slice(at + 1);
    if (!value) continue;
    if (kind === "id") ids.push(value);
    else if (kind === "owner") owners.push(value);
    else if (kind === "player") players.push(value);
  }
  const reads: PromiseLike<PublicCardRow[]>[] = [];
  for (let start = 0; start < ids.length; start += ID_CHUNK) {
    const chunk = ids.slice(start, start + ID_CHUNK);
    reads.push(
      supabase.from("public_cards").select("*").in("id", chunk).limit(chunk.length).then(rowsOf),
    );
  }
  for (const owner of owners) {
    reads.push(
      supabase
        .from("public_cards")
        .select("*")
        .eq("user_id", owner)
        .order("created_at", { ascending: false })
        .limit(OWNER_LIMIT)
        .then(rowsOf),
    );
  }
  for (let start = 0; start < players.length; start += PLAYER_CHUNK) {
    const chunk = players.slice(start, start + PLAYER_CHUNK);
    reads.push(
      supabase.from("public_cards").select("*").or(playerIlikeOr(chunk)).limit(PLAYER_LIMIT).then(rowsOf),
    );
  }
  const batches = await Promise.all(reads);
  return batches.flat().map((row) => mapPublicCard(row));
}


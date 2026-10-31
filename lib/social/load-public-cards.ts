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
/** Copies of one player across every public collection. */
const PLAYER_LIMIT = 500;

function rowsOf(result: { data: unknown; error: { message: string } | null }): PublicCardRow[] {
  if (result.error) throw new Error(result.error.message);
  return Array.isArray(result.data) ? (result.data as PublicCardRow[]) : [];
}

/** One read per id chunk, per owner, and per player. Never the whole table. */
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
  for (const player of players) {
    reads.push(
      supabase
        .from("public_cards")
        .select("*")
        .ilike("player", escapeIlike(player))
        .limit(PLAYER_LIMIT)
        .then(rowsOf),
    );
  }
  const batches = await Promise.all(reads);
  return batches.flat().map((row) => mapPublicCard(row));
}


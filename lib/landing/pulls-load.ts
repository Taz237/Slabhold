import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { landingMedia, type PullRef } from "@/lib/landing/media";
import { anonClient } from "./founder-load";
import { PULL_CARD_SELECT, landingPulls, type LandingPull, type PullCardRow, type PullProfileRow } from "./pulls";

/**
 * The listed pulls, read as a logged-out visitor so RLS and the public_cards
 * view decide what is visible. Throws on a read error, so the cache keeps
 * nothing.
 */
export async function readLandingPulls(supabase: SupabaseClient, refs: readonly PullRef[]): Promise<LandingPull[]> {
  if (!refs.length) return [];
  const handles = [...new Set(refs.map((ref) => ref.handle))];
  const ids = [...new Set(refs.map((ref) => ref.cardId))];
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, username")
    .in("username", handles)
    .limit(handles.length)
    .returns<PullProfileRow[]>();
  if (profileError) throw new Error(`pulls profiles read failed: ${profileError.message}`);
  const { data: cards, error: cardError } = await supabase
    .from("public_cards")
    .select(PULL_CARD_SELECT)
    .in("id", ids)
    .limit(ids.length)
    .returns<PullCardRow[]>();
  if (cardError) throw new Error(`pulls cards read failed: ${cardError.message}`);
  return landingPulls(refs, profiles ?? [], cards ?? []);
}

async function loadLandingPulls(): Promise<LandingPull[]> {
  const refs = landingMedia().pulls;
  if (!refs) return [];
  const supabase = anonClient();
  if (!supabase) return [];
  return readLandingPulls(supabase, refs);
}

/** Cached for about an hour, like the showcase: one read an hour, none per visitor. */
const cachedLandingPulls = unstable_cache(loadLandingPulls, ["landing-pulls"], { revalidate: 3600 });

/**
 * The page's read. No pulls.json means no read at all and no wall; any
 * failure also means no wall.
 */
export async function landingPullsWall(
  listed: () => boolean = () => landingMedia().pulls !== null,
  read: () => Promise<LandingPull[]> = cachedLandingPulls,
): Promise<LandingPull[] | null> {
  if (!listed()) return null;
  try {
    const pulls = await read();
    return pulls.length ? pulls : null;
  } catch (error) {
    console.warn("[landing-pulls]", error instanceof Error ? error.message : "read failed");
    return null;
  }
}

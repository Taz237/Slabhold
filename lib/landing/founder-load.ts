import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { getSupabaseConfig } from "@/lib/supabase/client";
import {
  EMPTY_FOUNDER_SHOWCASE,
  FOUNDER_CARD_SCAN,
  FOUNDER_CARD_SELECT,
  FOUNDER_USERNAME,
  founderShowcase,
  type FounderCardRow,
  type FounderProfileRow,
  type FounderShowcase,
} from "./founder";

/**
 * The founder's public profile and top public cards, read as a logged-out
 * visitor so RLS and the public_cards view decide what is visible.
 * Not configured is a real "nothing to show"; a failed read is not.
 */
export async function loadFounderShowcase(): Promise<FounderShowcase> {
  const { url, anonKey, configured } = getSupabaseConfig();
  if (!configured) return EMPTY_FOUNDER_SHOWCASE;
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return readFounderShowcase(supabase);
}

/**
 * Throws on a read error so unstable_cache does not keep a blip for an hour.
 * Returns the empty showcase only when the founder genuinely isn't there.
 */
export async function readFounderShowcase(supabase: SupabaseClient): Promise<FounderShowcase> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .eq("username", FOUNDER_USERNAME)
    .maybeSingle<FounderProfileRow>();
  if (error) throw new Error(`founder profile read failed: ${error.message}`);
  if (!profile) return EMPTY_FOUNDER_SHOWCASE;

  const { data: rows, error: cardError } = await supabase
    .from("public_cards")
    .select(FOUNDER_CARD_SELECT)
    .eq("user_id", profile.id)
    .not("image_url", "is", null)
    .order("estimated_value", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(FOUNDER_CARD_SCAN)
    .returns<FounderCardRow[]>();
  if (cardError) throw new Error(`founder cards read failed: ${cardError.message}`);
  return founderShowcase(profile, rows ?? []);
}

/**
 * The showcase, cached for about an hour. Home and the landing route share it,
 * so the hero renders with the first paint and Supabase is read once an hour.
 * A failed read throws, so it is not cached: Home falls back to sample slabs
 * and the route serves the empty showcase for 60 seconds only.
 */
export const cachedFounderShowcase = unstable_cache(
  loadFounderShowcase,
  ["landing-founder"],
  { revalidate: 3600 },
);

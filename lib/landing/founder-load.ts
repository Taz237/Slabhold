import "server-only";

import { createClient } from "@supabase/supabase-js";
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
 */
export async function loadFounderShowcase(): Promise<FounderShowcase> {
  const { url, anonKey, configured } = getSupabaseConfig();
  if (!configured) return EMPTY_FOUNDER_SHOWCASE;
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .eq("username", FOUNDER_USERNAME)
    .maybeSingle<FounderProfileRow>();
  if (error || !profile) return EMPTY_FOUNDER_SHOWCASE;

  const { data: rows, error: cardError } = await supabase
    .from("public_cards")
    .select(FOUNDER_CARD_SELECT)
    .eq("user_id", profile.id)
    .not("image_url", "is", null)
    .order("estimated_value", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(FOUNDER_CARD_SCAN)
    .returns<FounderCardRow[]>();
  return founderShowcase(profile, cardError ? [] : (rows ?? []));
}

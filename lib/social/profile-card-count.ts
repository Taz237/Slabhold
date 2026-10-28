import "server-only";

import { createSupabaseServer } from "@/lib/supabase/server";
import { normalizeUsername } from "./local-db";

export type ServerCardCount = { username: string; count: number };

/**
 * The profile header's Cards number, read on the server as the viewer so it
 * never shows 0 while the page loads. The owner gets every card they hold,
 * public and private (RLS limits cards to the owner). Everyone else gets the
 * public count. Null when it can't be read.
 */
export async function loadProfileCardCount(
  target: { username: string } | { own: true },
  viewerId: string | null,
): Promise<ServerCardCount | null> {
  const supabase = await createSupabaseServer();
  if (!supabase) return null;
  try {
    let query = supabase.from("profiles").select("id, username");
    if ("own" in target) {
      if (!viewerId) return null;
      query = query.eq("id", viewerId);
    } else {
      const normalized = normalizeUsername(target.username);
      if (!normalized) return null;
      query = query.eq("username", normalized);
    }
    const { data: profile, error } = await query.maybeSingle();
    if (error || !profile?.id) return null;
    const own = viewerId === profile.id;
    const { count, error: countError } = await supabase
      .from(own ? "cards" : "public_cards")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id);
    if (countError || count == null) return null;
    return { username: String(profile.username ?? ""), count };
  } catch {
    return null;
  }
}

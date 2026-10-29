import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * How many collectors this user has invited, from their own invites rows (RLS
 * shows a user only rows they're part of). Null when it can't be read, for
 * example before the invites migration runs. For a later "You've invited N
 * collectors" line; nothing shows counts yet.
 */
export async function inviteCount(supabase: SupabaseClient | null, userId: string): Promise<number | null> {
  if (!supabase || !userId) return null;
  try {
    const { count, error } = await supabase
      .from("invites")
      .select("id", { count: "exact", head: true })
      .eq("inviter_id", userId);
    if (error || count == null) return null;
    return count;
  } catch {
    return null;
  }
}

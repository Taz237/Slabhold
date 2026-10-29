import type { SupabaseClient } from "@supabase/supabase-js";
import { mapPublicCard, PUBLIC_CARD_SELECT } from "@/lib/social/cards";
import type { PublicCard } from "@/lib/social/types";
import { inviteHandle } from "./attribution";

/** Everything the invite and collection pages, OG images and Story may show. Public data only. */
export type PublicCollector = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  /** Null when the count can't be read: the page leaves it out. */
  followerCount: number | null;
  /** Every public card. Null when the count can't be read. */
  publicCardCount: number | null;
  /** Public cards, most valuable first. Hidden cards are never in public_cards. */
  cards: PublicCard[];
};

/** Invite page and OG images: the top 3 (invite) or 6 (collection) with photos. */
export const INVITE_CARD_LIMIT = 3;
export const COLLECTION_IMAGE_CARD_LIMIT = 6;
/** The public collection page shows this many, most valuable first. */
export const COLLECTION_PAGE_CARD_LIMIT = 60;

type ProfileRow = { id: string; username: string; display_name: string | null; avatar_url: string | null };

/**
 * Reads a collector as a logged-out visitor (pass the anon client), so RLS and
 * the public_cards view decide what shows. Null for an unknown, reserved or
 * unreadable handle, or any read error: callers draw the generic page or
 * image, and never say why.
 */
export async function readPublicCollector(
  supabase: SupabaseClient | null,
  username: string,
  { cardLimit, withPhotos }: { cardLimit: number; withPhotos: boolean },
): Promise<PublicCollector | null> {
  const handle = inviteHandle(username);
  if (!supabase || !handle) return null;
  try {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .eq("username", handle)
      .maybeSingle<ProfileRow>();
    if (error || !profile) return null;

    const followers = supabase
      .from("follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("following_id", profile.id);
    const count = supabase.from("public_cards").select("id", { count: "exact", head: true }).eq("user_id", profile.id);
    let cardQuery = supabase.from("public_cards").select(PUBLIC_CARD_SELECT).eq("user_id", profile.id);
    if (withPhotos) cardQuery = cardQuery.not("image_url", "is", null);
    const [followerRows, countRows, cards] = await Promise.all([
      followers,
      count,
      cardQuery
        .order("estimated_value", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(cardLimit),
    ]);
    if (cards.error) return null;

    const rows = (cards.data ?? []) as unknown as Parameters<typeof mapPublicCard>[0][];
    return {
      id: profile.id,
      username: profile.username,
      displayName: profile.display_name?.trim() || profile.username,
      avatarUrl: profile.avatar_url ?? null,
      followerCount: followerRows.error ? null : (followerRows.count ?? null),
      publicCardCount: countRows.error ? null : (countRows.count ?? null),
      // public_cards only ever holds public cards. Keep only this collector's, in case.
      cards: rows.filter((row) => row.user_id === profile.id).map((row) => mapPublicCard(row)),
    };
  } catch {
    return null;
  }
}

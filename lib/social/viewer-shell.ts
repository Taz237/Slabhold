import type { SupabaseClient } from "@supabase/supabase-js";
import { loadHiddenAuthorIds } from "@/lib/safety/filters";
import { loadSocialProfiles } from "./remote";
import type { FollowEdge, Profile } from "./types";

/**
 * Who is reading, and the few lists every screen filters by. One parallel
 * batch, all scoped to the viewer: their profile, their follows, their
 * blocks and mutes, both hidden-author lists, and how many cards they own.
 * Nothing site-wide. The server reads it for a first screen, and the browser
 * reads the same thing when it has no server copy.
 */
export type ViewerShell = {
  viewer: Profile;
  /** The viewer's own follow edges (people they follow). */
  follows: FollowEdge[];
  blockedIds: string[];
  mutedIds: string[];
  /** hidden_author_ids with and without mutes, for page and engagement reads. */
  hidden: { muted: string[]; blocked: string[] };
  cardCount: number;
};

type FollowRow = { follower_id: string; following_id: string; created_at: string };

function idColumn(rows: unknown, column: string): string[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => (row as Record<string, unknown>)[column])
    .filter((id): id is string => typeof id === "string");
}

export function missingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "PGRST205" || error.code === "42P01" || /schema cache/i.test(error.message ?? "");
}

export async function loadViewerFollows(supabase: SupabaseClient, viewerId: string): Promise<FollowEdge[]> {
  const { data, error } = await supabase.from("follows").select("*").eq("follower_id", viewerId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as FollowRow[]).map((row) => ({
    followerId: row.follower_id,
    followingId: row.following_id,
    createdAt: row.created_at,
  }));
}

/**
 * Null when a read fails or the viewer has no profile: callers then fall
 * back to what they did before. Pass `follows` when the caller already
 * started that read (Home picks its tab from it), so it isn't read twice.
 */
export async function loadViewerShell(
  supabase: SupabaseClient,
  viewer: { id: string; email: string },
  options: { follows?: Promise<FollowEdge[]> } = {},
): Promise<ViewerShell | null> {
  const [people, follows, blocksRes, mutesRes, cardsRes, mutedHidden, blockedHidden] = await Promise.all([
    loadSocialProfiles(supabase, [viewer.id], viewer),
    options.follows ?? loadViewerFollows(supabase, viewer.id),
    supabase.from("blocks").select("blocked_id"),
    supabase.from("mutes").select("muted_id"),
    supabase.from("cards").select("id", { count: "exact", head: true }).eq("user_id", viewer.id),
    loadHiddenAuthorIds(supabase, true),
    loadHiddenAuthorIds(supabase, false),
  ]);
  const user = people.find((profile) => profile.id === viewer.id);
  if (!user || cardsRes.error) return null;
  if (blocksRes.error && !missingTable(blocksRes.error)) return null;
  if (mutesRes.error && !missingTable(mutesRes.error)) return null;
  return {
    viewer: user,
    follows,
    blockedIds: idColumn(blocksRes.data, "blocked_id"),
    mutedIds: idColumn(mutesRes.data, "muted_id"),
    hidden: { muted: [...mutedHidden], blocked: [...blockedHidden] },
    cardCount: cardsRes.count ?? 0,
  };
}

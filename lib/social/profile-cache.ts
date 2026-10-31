import type { SupabaseClient } from "@supabase/supabase-js";
import { loadHiddenAuthorIds } from "@/lib/safety/filters";
import type { Profile } from "./types";

/**
 * People are read for what a screen shows, never as the whole profiles table:
 * the snapshot brings everyone its rows name, a screen asks for anyone else
 * by id or handle, and follow counts and lists are read per person.
 */
export type ProfileRequest = {
  ids?: readonly (string | null | undefined)[];
  usernames?: readonly (string | null | undefined)[];
};

export function profileKeys(request: ProfileRequest): string[] {
  const ids = [...new Set((request.ids ?? []).filter((id): id is string => Boolean(id)))].sort();
  const names = [
    ...new Set(
      (request.usernames ?? [])
        .filter((name): name is string => typeof name === "string")
        .map((name) => name.trim().replace(/^@+/, "").toLowerCase())
        .filter(Boolean),
    ),
  ].sort();
  return [...ids.map((id) => `id:${id}`), ...names.map((name) => `user:${name}`)];
}

/** Reads the keys' people with the block filter (see loadVisibleProfiles). */
export async function loadProfilesForKeys(
  supabase: SupabaseClient,
  keys: readonly string[],
  viewer: { id: string; email: string } | null,
): Promise<Profile[]> {
  const ids: string[] = [];
  const usernames: string[] = [];
  for (const key of keys) {
    if (key.startsWith("id:")) ids.push(key.slice(3));
    else if (key.startsWith("user:")) usernames.push(key.slice(5));
  }
  if (ids.length === 0 && usernames.length === 0) return [];
  const hidden = viewer ? await loadHiddenAuthorIds(supabase, false) : [];
  const { loadVisibleProfiles } = await import("./remote");
  return loadVisibleProfiles(supabase, { ids, usernames }, viewer, hidden);
}

/** A full reload keeps the people a screen already read, for the same viewer. */
export function keepLoadedProfiles<S extends { user: { id: string } | null; profiles: Profile[] }>(
  existing: Pick<S, "user" | "profiles">,
  next: S,
): S {
  if (!next.user || existing.user?.id !== next.user.id) return next;
  const byId = new Map(existing.profiles.map((profile) => [profile.id, profile]));
  for (const profile of next.profiles) byId.set(profile.id, profile);
  return { ...next, profiles: [...byId.values()] };
}

export async function loadFollowCounts(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ followers: number; following: number }> {
  const [followers, following] = await Promise.all([
    supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", userId),
    supabase.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", userId),
  ]);
  if (followers.error) throw new Error(followers.error.message);
  if (following.error) throw new Error(following.error.message);
  return { followers: followers.count ?? 0, following: following.count ?? 0 };
}

/**
 * A count read from the server, moved by the viewer's own follow or unfollow
 * since then, so the header changes the moment they tap.
 */
export function followCountWithViewer(
  count: number,
  viewer: { followedAtRead: boolean; followsNow: boolean },
): number {
  const delta = (viewer.followsNow ? 1 : 0) - (viewer.followedAtRead ? 1 : 0);
  return Math.max(0, count + delta);
}

export const FOLLOW_PAGE_SIZE = 50;

export type FollowCursor = { createdAt: string; id: string };

/** One person's followers or follows, newest first, with their profiles. */
export async function loadFollowPage(
  supabase: SupabaseClient,
  input: {
    userId: string;
    kind: "followers" | "following";
    cursor: FollowCursor | null;
    viewer: { id: string; email: string } | null;
  },
): Promise<{ profiles: Profile[]; next: FollowCursor | null }> {
  const own = input.kind === "followers" ? "following_id" : "follower_id";
  const other = input.kind === "followers" ? "follower_id" : "following_id";
  let query = supabase
    .from("follows")
    .select("follower_id, following_id, created_at")
    .eq(own, input.userId)
    .order("created_at", { ascending: false })
    .order(other, { ascending: false })
    .limit(FOLLOW_PAGE_SIZE + 1);
  if (input.cursor) {
    const ts = `"${input.cursor.createdAt}"`;
    query = query.or(`created_at.lt.${ts},and(created_at.eq.${ts},${other}.lt."${input.cursor.id}")`);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (Array.isArray(data) ? data : []) as Record<string, string>[];
  const shown = rows.slice(0, FOLLOW_PAGE_SIZE);
  const last = shown[shown.length - 1];
  const next = rows.length > FOLLOW_PAGE_SIZE && last ? { createdAt: last.created_at, id: last[other] } : null;
  const ids = shown.map((row) => row[other]);
  if (ids.length === 0) return { profiles: [], next };
  const hidden = input.viewer ? await loadHiddenAuthorIds(supabase, false) : [];
  const { loadVisibleProfiles } = await import("./remote");
  const people = await loadVisibleProfiles(supabase, { ids }, input.viewer, hidden);
  const byId = new Map(people.map((profile) => [profile.id, profile]));
  // Newest follow first; anyone hidden from the viewer is left out.
  return { profiles: ids.flatMap((id) => byId.get(id) ?? []), next };
}

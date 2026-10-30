import type { SupabaseClient } from "@supabase/supabase-js";
import { loadHiddenAuthorIds } from "@/lib/safety/filters";
import { FEED_PAGE_SIZE, followingAuthorIds } from "./feed-page";
import { defaultHomeTab } from "./get-started";
import { randomUUID } from "node:crypto";
import { isNewUser } from "./get-started";
import { seededChecklist, type HomeSeed } from "./home-seed";
import { loadFeedPage, loadPostEngagement } from "./load-feed-page";
import { loadServerSuggestions } from "./load-suggestions";
import { loadSocialProfiles } from "./remote";
import { mergeRankedSuggestions } from "./suggestion-order";
import type { FollowEdge, Profile } from "./types";

type FollowRow = { follower_id: string; following_id: string; created_at: string };

function idColumn(rows: unknown, column: string): string[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => (row as Record<string, unknown>)[column])
    .filter((id): id is string => typeof id === "string");
}

function missingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "PGRST205" || error.code === "42P01" || /schema cache/i.test(error.message ?? "");
}

async function loadFollows(supabase: SupabaseClient, viewerId: string): Promise<FollowEdge[]> {
  const { data, error } = await supabase.from("follows").select("*").eq("follower_id", viewerId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as FollowRow[]).map((row) => ({
    followerId: row.follower_id,
    followingId: row.following_id,
    createdAt: row.created_at,
  }));
}

/**
 * Signed-in Home's first screen for one verified viewer, with their own
 * cookie client, so RLS and the block and mute filters apply exactly as in
 * the browser. Null when any read fails: the browser then loads everything
 * as before.
 *
 * The reads overlap: the page request starts as soon as the follows are in
 * (they pick the tab), alongside the rest of the first batch.
 */
export async function loadHomeSeed(
  supabase: SupabaseClient,
  viewer: { id: string; email: string },
): Promise<HomeSeed | null> {
  try {
    const followsTask = loadFollows(supabase, viewer.id);
    const pageTask = followsTask.then((follows) => {
      const lane = defaultHomeTab({ followingCount: follows.length, cardCount: 0 });
      // The same page request the timeline makes in the browser for this tab.
      return loadFeedPage(supabase, {
        scope: lane === "following" ? "following" : "public",
        viewerId: viewer.id,
        authorIds: lane === "following" ? followingAuthorIds(follows, viewer.id) : undefined,
        cursor: null,
        limit: FEED_PAGE_SIZE,
      }).then((page) => ({ lane, page }));
    });
    // Don't leave a rejection unhandled if an earlier read fails first.
    pageTask.catch(() => {});
    const [people, follows, blocksRes, mutesRes, cardsRes, ranked, mutedHidden, blockedHidden] =
      await Promise.all([
        loadSocialProfiles(supabase, [viewer.id], viewer),
        followsTask,
        supabase.from("blocks").select("blocked_id"),
        supabase.from("mutes").select("muted_id"),
        supabase.from("cards").select("id", { count: "exact", head: true }).eq("user_id", viewer.id),
        loadServerSuggestions(supabase),
        loadHiddenAuthorIds(supabase, true),
        loadHiddenAuthorIds(supabase, false),
      ]);
    const user = people.find((profile) => profile.id === viewer.id);
    if (!user || cardsRes.error) return null;
    if (blocksRes.error && !missingTable(blocksRes.error)) return null;
    if (mutesRes.error && !missingTable(mutesRes.error)) return null;
    const cardCount = cardsRes.count ?? 0;

    const blockedIds = idColumn(blocksRes.data, "blocked_id");
    const mutedIds = idColumn(mutesRes.data, "muted_id");
    const { lane, page } = await pageTask;
    const postIds = [...page.posts, ...page.relatedPosts].map((post) => post.id);
    const { comments, reposts } = await loadPostEngagement(supabase, postIds, viewer.id, {
      muted: mutedHidden,
      blocked: blockedHidden,
    });
    const known = new Set([viewer.id, ...page.profiles.map((profile) => profile.id)]);
    const repliers = await loadSocialProfiles(
      supabase,
      comments.map((comment) => comment.authorId).filter((id) => !known.has(id)),
    );
    const profiles: Profile[] = [user, ...page.profiles.filter((profile) => profile.id !== user.id), ...repliers];
    const suggestions = ranked
      ? mergeRankedSuggestions({
          fallback: [],
          server: ranked,
          viewerId: viewer.id,
          followingIds: follows.map((edge) => edge.followingId),
          blockedIds,
          mutedIds,
        })
      : null;

    return {
      viewer: user,
      lane,
      follows,
      blockedIds,
      mutedIds,
      page: {
        items: page.items,
        posts: page.posts,
        relatedPosts: page.relatedPosts,
        profiles: page.profiles,
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
        likes: page.likes,
        token: randomUUID(),
      },
      profiles,
      comments,
      reposts,
      suggestions,
      cardCount,
      getStarted: seededChecklist({ viewer: user, followingCount: follows.length, cardCount }),
      newNow: isNewUser({ followingCount: follows.length, cardCount }),
    };
  } catch (error) {
    console.warn("[home] first screen read failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

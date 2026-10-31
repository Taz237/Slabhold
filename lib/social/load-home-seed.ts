import type { SupabaseClient } from "@supabase/supabase-js";
import { FEED_PAGE_SIZE, followingAuthorIds } from "./feed-page";
import { defaultHomeTab } from "./get-started";
import { isNewUser } from "./get-started";
import { seededChecklist, type HomeSeed } from "./home-seed";
import { loadFeedPage, loadPostEngagement } from "./load-feed-page";
import { loadServerSuggestions } from "./load-suggestions";
import { loadSocialProfiles } from "./remote";
import { mergeRankedSuggestions } from "./suggestion-order";
import type { Profile } from "./types";
import { loadViewerFollows, loadViewerShell } from "./viewer-shell";

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
  /** "client" when the browser reads it (no server copy for this visit). */
  source: "server" | "client" = "server",
): Promise<HomeSeed | null> {
  try {
    const followsTask = loadViewerFollows(supabase, viewer.id);
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
    const [shell, ranked] = await Promise.all([
      loadViewerShell(supabase, viewer, { follows: followsTask }),
      loadServerSuggestions(supabase),
    ]);
    if (!shell) return null;
    const { viewer: user, follows, blockedIds, mutedIds, cardCount } = shell;

    const { lane, page } = await pageTask;
    const postIds = [...page.posts, ...page.relatedPosts].map((post) => post.id);
    const { comments, reposts } = await loadPostEngagement(supabase, postIds, viewer.id, shell.hidden);
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
        token: crypto.randomUUID(),
      },
      profiles,
      comments,
      reposts,
      suggestions,
      cardCount,
      getStarted: seededChecklist({ viewer: user, followingCount: follows.length, cardCount }),
      newNow: isNewUser({ followingCount: follows.length, cardCount }),
      ...(source === "client" ? { source } : {}),
    };
  } catch (error) {
    console.warn("[home] first screen read failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

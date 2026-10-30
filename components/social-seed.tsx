"use client";

import { useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { SocialContext, type SocialContextValue } from "@/components/social-provider";
import type { HomeSeed } from "@/lib/social/home-seed";
import type { Post } from "@/lib/social/types";
import { ActionQueue, forwardActions, LatestValue } from "@/lib/ui/forward-actions";

/**
 * Signed-in Home's server-read first screen as social state: the same reads
 * the provider answers from its snapshot, limited to what that screen shows.
 * Actions stay the provider's own (see SeededSocial for how early taps wait).
 */
export function seededSocialValue(outer: SocialContextValue, seed: HomeSeed): SocialContextValue {
  const viewerId = seed.viewer.id;
  const posts: Post[] = [];
  const seen = new Set<string>();
  for (const post of [...seed.page.posts, ...seed.page.relatedPosts]) {
    if (seen.has(post.id)) continue;
    seen.add(post.id);
    posts.push(post);
  }
  const postsById = new Map(posts.map((post) => [post.id, post]));
  const blocked = new Set(seed.blockedIds);
  const likes = seed.page.likes ?? [];
  const known = (postId: string) => {
    if (outer.removedPostIds.has(postId)) return undefined;
    const post = postsById.get(postId);
    if (!post || blocked.has(post.authorId)) return undefined;
    return post;
  };
  const followingIds = new Set(
    seed.follows.filter((edge) => edge.followerId === viewerId).map((edge) => edge.followingId),
  );
  return {
    ...outer,
    ready: true,
    hasFullSnapshot: false,
    mode: "supabase",
    user: seed.viewer,
    profiles: seed.profiles,
    posts,
    follows: seed.follows,
    reposts: seed.reposts,
    homePosts: [],
    homeReposts: [],
    feed: [],
    blockedIds: seed.blockedIds,
    mutedIds: seed.mutedIds,
    suggestions: seed.suggestions ?? [],
    suggestionsReady: seed.suggestions !== null,
    findPost: known,
    commentsFor: (postId) =>
      seed.comments
        .filter((comment) => comment.postId === postId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    isLiked: (postId) => {
      const post = known(postId);
      if (post?.viewerLiked === true) return true;
      if (post?.viewerLiked === false) return false;
      return likes.some((like) => like.postId === postId && like.userId === viewerId);
    },
    likeCount: (postId) => {
      const post = known(postId);
      if (typeof post?.likeCount === "number") return post.likeCount;
      return likes.filter((like) => like.postId === postId).length;
    },
    isReposted: (postId) =>
      seed.reposts.some((repost) => repost.postId === postId && repost.userId === viewerId),
    repostCount: (postId) => seed.reposts.filter((repost) => repost.postId === postId).length,
    isFollowing: (userId) => followingIds.has(userId),
    followingCount: (userId) => (userId === viewerId ? followingIds.size : 0),
  };
}

/** Provider functions that change data. Tapped before the snapshot, they wait for it. */
const SOCIAL_ACTIONS: ReadonlySet<string> = new Set([
  "refresh",
  "signUp",
  "signIn",
  "signOut",
  "updateProfile",
  "toggleFollow",
  "followMany",
  "createPost",
  "updatePost",
  "deletePost",
  "pinPost",
  "unpinPost",
  "deleteComment",
  "toggleLike",
  "toggleRepost",
  "addComment",
  "markNotificationsRead",
  "sendMessage",
  "markThreadRead",
  "applySafetyChange",
  "refreshSuggestions",
]);

/**
 * Until the provider has its snapshot, the subtree reads the seed instead.
 * It stays fully usable: links are plain links, and a tap on an action (a
 * like, a follow, a post) is held and replayed once the provider is ready.
 * Once ready the seed is done for good. The provider element and the
 * wrapper stay put either way, so the hand-over re-renders the same tree
 * and nothing remounts. Without a seed it passes the provider through.
 */
export function SeededSocial({ seed, children }: { seed: HomeSeed | null; children?: ReactNode }) {
  const outer = useContext(SocialContext);
  if (!outer) throw new Error("SeededSocial must be used inside SocialProvider");
  // Read by the forwarded actions when they run, never during render.
  const [live] = useState(() => new LatestValue(outer));
  const [queue] = useState(() => new ActionQueue());
  useLayoutEffect(() => live.set(outer), [live, outer]);
  const [handedOver, setHandedOver] = useState(false);
  if (outer.ready && !handedOver) setHandedOver(true);
  // After live.set above, so replayed taps reach the ready provider.
  // A layout effect, so a replayed change lands before the handed-over frame paints.
  useLayoutEffect(() => {
    if (handedOver) queue.flush();
  }, [handedOver, queue]);
  const seeded = Boolean(seed) && !outer.ready && !handedOver;
  const [first] = useState(outer);
  const seededValue = useMemo(
    () => (seed ? seededSocialValue(forwardActions(first, () => live.get(), queue, SOCIAL_ACTIONS), seed) : null),
    [first, live, queue, seed],
  );
  const value = seeded && seededValue ? seededValue : outer;
  return (
    <SocialContext.Provider value={value}>
      <div data-seeded-viewer={seeded ? "" : undefined} className="contents">
        {children}
      </div>
    </SocialContext.Provider>
  );
}

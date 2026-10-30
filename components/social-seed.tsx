"use client";

import { useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { SocialContext, type SocialContextValue } from "@/components/social-provider";
import type { HomeSeed } from "@/lib/social/home-seed";
import type { Post } from "@/lib/social/types";
import { forwardActions, LatestValue } from "@/lib/ui/forward-actions";

/**
 * Signed-in Home's server-read first screen as social state: the same reads
 * the provider answers from its snapshot, limited to what that screen shows.
 * Actions stay the provider's own. Home keeps the seeded screen inert until
 * the provider is ready, so none of them can run against a missing snapshot.
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

/**
 * Until the provider has its snapshot, the subtree reads the seed instead,
 * and stays inert so nothing can act on it. Once the provider is ready the
 * seed is done for good. The provider element and the wrapper stay put
 * either way, so the hand-over re-renders the same tree and nothing remounts.
 */
export function SeededSocial({ seed, children }: { seed: HomeSeed | null; children?: ReactNode }) {
  const outer = useContext(SocialContext);
  if (!outer) throw new Error("SeededSocial must be used inside SocialProvider");
  // Read by the forwarded actions when they run, never during render.
  const [live] = useState(() => new LatestValue(outer));
  useEffect(() => live.set(outer), [live, outer]);
  const [handedOver, setHandedOver] = useState(false);
  if (outer.ready && !handedOver) setHandedOver(true);
  const seeded = Boolean(seed) && !outer.ready && !handedOver;
  const [first] = useState(outer);
  const seededValue = useMemo(
    () => (seed ? seededSocialValue(forwardActions(first, () => live.get()), seed) : null),
    [first, live, seed],
  );
  const value = seeded && seededValue ? seededValue : outer;
  return (
    <SocialContext.Provider value={value}>
      <div
        inert={seeded}
        aria-busy={seeded || undefined}
        data-seeded-viewer={seeded ? "" : undefined}
        className="contents"
      >
        {children}
      </div>
    </SocialContext.Provider>
  );
}

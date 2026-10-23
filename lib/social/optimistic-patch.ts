import type { DirectMessage, FollowEdge, Post, PostComment, PostRepost } from "./types";

export type FollowCounts = {
  followers: number;
  following: number;
};

export type FollowCountMap = Record<string, FollowCounts>;

function bump(value: number | undefined, delta: number) {
  return Math.max(0, (value ?? 0) + delta);
}

/**
 * Flip one follow edge and the two counts the headers show.
 * Calling it again with the returned counts restores the previous counts.
 */
export function toggleFollowLocal(input: {
  follows: readonly FollowEdge[];
  counts: FollowCountMap;
  viewerId: string;
  targetId: string;
  now: string;
  viewerFollowingCount: number;
  targetFollowerCount: number;
}): { follows: FollowEdge[]; counts: FollowCountMap; following: boolean } {
  const already = input.follows.some(
    (edge) => edge.followerId === input.viewerId && edge.followingId === input.targetId,
  );
  const follows = already
    ? input.follows.filter(
        (edge) => !(edge.followerId === input.viewerId && edge.followingId === input.targetId),
      )
    : [
        ...input.follows,
        { followerId: input.viewerId, followingId: input.targetId, createdAt: input.now },
      ];
  const delta = already ? -1 : 1;
  const viewer = input.counts[input.viewerId];
  const target = input.counts[input.targetId];
  const counts: FollowCountMap = {
    ...input.counts,
    [input.viewerId]: {
      followers: viewer?.followers ?? 0,
      following: bump(viewer?.following ?? input.viewerFollowingCount, delta),
    },
    [input.targetId]: {
      followers: bump(target?.followers ?? input.targetFollowerCount, delta),
      following: target?.following ?? 0,
    },
  };
  return { follows, counts, following: !already };
}

/** Add follows that are not already there. Counts move by the number added. */
export function followManyLocal(input: {
  follows: readonly FollowEdge[];
  counts: FollowCountMap;
  viewerId: string;
  targetIds: readonly string[];
  now: string;
  viewerFollowingCount: number;
}): { follows: FollowEdge[]; counts: FollowCountMap } {
  let follows = [...input.follows];
  let counts = input.counts;
  let viewerFollowing = input.viewerFollowingCount;
  for (const targetId of input.targetIds) {
    if (targetId === input.viewerId) continue;
    const next = toggleFollowLocal({
      follows,
      counts,
      viewerId: input.viewerId,
      targetId,
      now: input.now,
      viewerFollowingCount: viewerFollowing,
      targetFollowerCount: counts[targetId]?.followers ?? 0,
    });
    if (!next.following) continue;
    follows = next.follows;
    counts = next.counts;
    viewerFollowing = next.counts[input.viewerId]?.following ?? viewerFollowing;
  }
  return { follows, counts };
}

export function countsFromEdges(follows: readonly FollowEdge[], userId: string): FollowCounts {
  let followers = 0;
  let following = 0;
  for (const edge of follows) {
    if (edge.followingId === userId) followers += 1;
    if (edge.followerId === userId) following += 1;
  }
  return { followers, following };
}

export function insertFirst<T extends { id: string }>(rows: readonly T[], row: T): T[] {
  return [row, ...rows.filter((item) => item.id !== row.id)];
}

export function dropById<T extends { id: string }>(rows: readonly T[], id: string): T[] {
  return rows.filter((item) => item.id !== id);
}

export function replaceId<T extends { id: string }>(rows: readonly T[], from: string, to: string): T[] {
  return rows.map((item) => (item.id === from ? { ...item, id: to, pending: false } : item));
}

export function toggleRepostLocal(
  reposts: readonly PostRepost[],
  postId: string,
  userId: string,
  now: string,
): PostRepost[] {
  const already = reposts.some((repost) => repost.postId === postId && repost.userId === userId);
  if (already) {
    return reposts.filter((repost) => !(repost.postId === postId && repost.userId === userId));
  }
  return [...reposts, { postId, userId, createdAt: now }];
}

export function pendingPost(input: {
  id: string;
  authorId: string;
  body: string;
  imageDataUrl: string | null;
  images?: string[];
  card: Post["card"];
  quotedPostId: string | null;
  createdAt: string;
}): Post {
  return {
    id: input.id,
    authorId: input.authorId,
    body: input.body,
    imageDataUrl: input.imageDataUrl,
    images: input.images,
    card: input.card,
    quotedPostId: input.quotedPostId,
    createdAt: input.createdAt,
    postType: "post",
    pending: true,
  };
}

export function pendingComment(input: {
  id: string;
  postId: string;
  authorId: string;
  body: string;
  createdAt: string;
}): PostComment {
  return { ...input, pending: true };
}

export function pendingMessage(input: {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: string;
  cardPreview?: DirectMessage["cardPreview"];
}): DirectMessage {
  return {
    id: input.id,
    senderId: input.senderId,
    receiverId: input.receiverId,
    content: input.content,
    createdAt: input.createdAt,
    read: true,
    kind: input.cardPreview ? "card_preview" : "text",
    cardPreview: input.cardPreview ?? null,
    pending: true,
  };
}

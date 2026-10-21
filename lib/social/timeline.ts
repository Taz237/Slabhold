import type { FollowEdge, Post, PostRepost, Profile } from "./types";

export type TimelineItem = {
  key: string;
  post: Post;
  at: string;
  repostedBy: Profile | null;
};

/** Tie-break key for the recent sort. Smaller keys come first when timestamps match. */
export function timelineSortKey(postId: string, repostedById?: string | null): string {
  return repostedById ? `repost:${repostedById}:${postId}` : `post:${postId}`;
}

/** Newest parsed time first, then timelineSortKey ascending. */
export function compareByRecent(a: { at: string; key: string }, b: { at: string; key: string }): number {
  const aTime = Date.parse(a.at);
  const bTime = Date.parse(b.at);
  if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) {
    if (aTime !== bTime) return bTime - aTime;
    return a.key.localeCompare(b.key);
  }
  return b.at.localeCompare(a.at) || a.key.localeCompare(b.key);
}

function byRecent(a: TimelineItem, b: TimelineItem) {
  return compareByRecent(a, b);
}

/**
 * If both the original post and a repost of it appear, keep only the newest
 * repost so the same post is not shown twice.
 */
function preferRepostOnce(items: TimelineItem[]): TimelineItem[] {
  const byPostId = new Map<string, TimelineItem[]>();
  for (const item of items) {
    const group = byPostId.get(item.post.id);
    if (group) group.push(item);
    else byPostId.set(item.post.id, [item]);
  }
  const picked: TimelineItem[] = [];
  for (const group of byPostId.values()) {
    const reposts = group.filter((item) => item.repostedBy);
    if (reposts.length > 0) {
      picked.push([...reposts].sort(byRecent)[0]!);
    } else {
      picked.push(group[0]!);
    }
  }
  return picked.sort(byRecent);
}

function postItem(post: Post): TimelineItem {
  return { key: timelineSortKey(post.id), post, at: post.createdAt, repostedBy: null };
}

function repostItems(
  reposts: PostRepost[],
  postsById: Map<string, Post>,
  profilesById: Map<string, Profile>,
  include: (repost: PostRepost) => boolean,
): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const repost of reposts) {
    if (!include(repost)) continue;
    const post = postsById.get(repost.postId);
    const repostedBy = profilesById.get(repost.userId);
    const author = post ? profilesById.get(post.authorId) : undefined;
    if (!post || !repostedBy || !author) continue;
    items.push({
      key: timelineSortKey(repost.postId, repost.userId),
      post,
      at: repost.createdAt,
      repostedBy,
    });
  }
  return items;
}

function indexes(posts: Post[], profiles: Profile[]) {
  return {
    postsById: new Map(posts.map((post) => [post.id, post])),
    profilesById: new Map(profiles.map((profile) => [profile.id, profile])),
  };
}

export function profileTimeline(
  posts: Post[],
  reposts: PostRepost[],
  profiles: Profile[],
  userId: string,
): TimelineItem[] {
  const { postsById, profilesById } = indexes(posts, profiles);
  const items = posts.filter((post) => post.authorId === userId).map(postItem);
  items.push(
    ...repostItems(reposts, postsById, profilesById, (repost) => repost.userId === userId),
  );
  return preferRepostOnce(items);
}

/** Accounts this viewer follows. Their own id is not included. */
export function followedAccountIds(follows: FollowEdge[], userId: string): Set<string> {
  const ids = new Set<string>();
  for (const edge of follows) {
    if (edge.followerId === userId && edge.followingId && edge.followingId !== userId) {
      ids.add(edge.followingId);
    }
  }
  return ids;
}

/** Posts and reposts from the viewer and accounts they follow. Nobody followed -> empty. */
export function followingTimeline(
  posts: Post[],
  reposts: PostRepost[],
  profiles: Profile[],
  follows: FollowEdge[],
  userId: string,
): TimelineItem[] {
  const ids = followedAccountIds(follows, userId);
  if (ids.size === 0) return [];
  const authorIds = new Set(ids);
  authorIds.add(userId);
  const { postsById, profilesById } = indexes(posts, profiles);
  const items = posts.filter((post) => authorIds.has(post.authorId)).map(postItem);
  items.push(
    ...repostItems(reposts, postsById, profilesById, (repost) => authorIds.has(repost.userId)),
  );
  return preferRepostOnce(items);
}

export function publicTimeline(posts: Post[], reposts: PostRepost[], profiles: Profile[]): TimelineItem[] {
  const { postsById, profilesById } = indexes(posts, profiles);
  const items = posts.map(postItem);
  items.push(...repostItems(reposts, postsById, profilesById, () => true));
  return preferRepostOnce(items);
}

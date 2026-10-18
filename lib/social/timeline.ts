import type { FollowEdge, Post, PostRepost, Profile } from "./types";
import { collapseWantListPosts } from "./want-posts";

export type TimelineItem = {
  key: string;
  post: Post;
  at: string;
  repostedBy: Profile | null;
};

function byRecent(a: TimelineItem, b: TimelineItem) {
  return b.at.localeCompare(a.at) || a.key.localeCompare(b.key);
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
  return { key: `post:${post.id}`, post, at: post.createdAt, repostedBy: null };
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
      key: `repost:${repost.userId}:${repost.postId}`,
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
  const visiblePosts = collapseWantListPosts(posts);
  const { postsById, profilesById } = indexes(visiblePosts, profiles);
  const items = visiblePosts.filter((post) => post.authorId === userId).map(postItem);
  items.push(
    ...repostItems(reposts, postsById, profilesById, (repost) => repost.userId === userId),
  );
  return preferRepostOnce(items);
}

export function followingTimeline(
  posts: Post[],
  reposts: PostRepost[],
  profiles: Profile[],
  follows: FollowEdge[],
  userId: string,
): TimelineItem[] {
  const ids = new Set<string>([userId]);
  for (const edge of follows) {
    if (edge.followerId === userId) ids.add(edge.followingId);
  }
  const visiblePosts = collapseWantListPosts(posts);
  const { postsById, profilesById } = indexes(visiblePosts, profiles);
  const items = visiblePosts.filter((post) => ids.has(post.authorId)).map(postItem);
  items.push(...repostItems(reposts, postsById, profilesById, (repost) => ids.has(repost.userId)));
  return preferRepostOnce(items);
}

export function publicTimeline(posts: Post[], reposts: PostRepost[], profiles: Profile[]): TimelineItem[] {
  const visiblePosts = collapseWantListPosts(posts);
  const { postsById, profilesById } = indexes(visiblePosts, profiles);
  const items = visiblePosts.map(postItem);
  items.push(...repostItems(reposts, postsById, profilesById, () => true));
  return preferRepostOnce(items);
}

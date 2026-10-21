import type { TimelineItem } from "./timeline";
import type { Post, PostRepost, Profile } from "./types";

/** Drop deleted, blocked, and (on home feeds) muted authors and reposters. */
export function keepPagedItem(
  item: Pick<TimelineItem, "post" | "repostedBy">,
  options: {
    removedPostIds?: ReadonlySet<string>;
    blockedIds: ReadonlySet<string>;
    mutedIds?: ReadonlySet<string>;
  },
): boolean {
  if (options.removedPostIds?.has(item.post.id)) return false;
  if (options.blockedIds.has(item.post.authorId)) return false;
  if (item.repostedBy && options.blockedIds.has(item.repostedBy.id)) return false;
  const muted = options.mutedIds;
  if (muted) {
    if (muted.has(item.post.authorId)) return false;
    if (item.repostedBy && muted.has(item.repostedBy.id)) return false;
  }
  return true;
}

/**
 * Use the snapshot's post when we have one, so an edit shows immediately.
 * The viewer's own un-repost drops the repost row.
 */
export function withFreshPost(
  item: TimelineItem,
  postsById: ReadonlyMap<string, Post>,
  reposts: readonly PostRepost[],
  viewerId: string | null,
): TimelineItem | null {
  if (item.repostedBy && viewerId && item.repostedBy.id === viewerId) {
    const live = reposts.some(
      (repost) => repost.postId === item.post.id && repost.userId === viewerId,
    );
    if (!live) return null;
  }
  const fresh = postsById.get(item.post.id);
  if (!fresh || fresh === item.post) return item;
  return { ...item, post: fresh };
}

export function presentPagedItems(
  items: TimelineItem[],
  options: {
    removedPostIds?: ReadonlySet<string>;
    blockedIds: ReadonlySet<string>;
    mutedIds?: ReadonlySet<string>;
    postsById: ReadonlyMap<string, Post>;
    reposts: readonly PostRepost[];
    viewerId: string | null;
  },
): TimelineItem[] {
  const shown: TimelineItem[] = [];
  for (const item of items) {
    if (!keepPagedItem(item, options)) continue;
    const fresh = withFreshPost(item, options.postsById, options.reposts, options.viewerId);
    if (fresh) shown.push(fresh);
  }
  return shown;
}

export function addUnblockedProfiles(
  authors: Map<string, Profile>,
  extra: readonly Profile[],
  blockedIds: ReadonlySet<string>,
) {
  for (const person of extra) {
    if (blockedIds.has(person.id)) continue;
    authors.set(person.id, person);
  }
}

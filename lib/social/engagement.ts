import type { PostComment, PostRepost } from "./types";

/**
 * Replies and reposts are read for the posts on screen, not as whole tables.
 * The snapshot reads them for its own posts; anything loaded later (another
 * feed page, a card's posts, a profile) asks for its posts' with these keys.
 */
export function engagementKeys(postIds: readonly string[]): string[] {
  return [...new Set(postIds.filter(Boolean))].sort().map((id) => `post:${id}`);
}

export function postIdsFromKeys(keys: readonly string[]): string[] {
  return keys.filter((key) => key.startsWith("post:")).map((key) => key.slice(5));
}

/**
 * A fresh read for `postIds` replaces what was known for those posts. Rows for
 * other posts stay. `keepLocal` keeps a reply still being sent (its id isn't
 * the server's yet).
 */
export function mergeEngagement<S extends { comments: PostComment[]; reposts: PostRepost[] }>(
  existing: S,
  postIds: readonly string[],
  fresh: { comments: readonly PostComment[]; reposts: readonly PostRepost[] },
  keepLocal: (commentId: string) => boolean = () => false,
): S {
  const covered = new Set(postIds);
  const comments = [
    ...existing.comments.filter((item) => !covered.has(item.postId) || keepLocal(item.id)),
    ...fresh.comments.filter((item) => !existing.comments.some((known) => known.id === item.id && keepLocal(known.id))),
  ];
  const reposts = [...existing.reposts.filter((item) => !covered.has(item.postId)), ...fresh.reposts];
  return { ...existing, comments, reposts };
}

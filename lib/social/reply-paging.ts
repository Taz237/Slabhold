import type { PostComment } from "./types";

/** Replies shown per page on a post screen. Scrolling to the end shows the next page. */
export const REPLY_PAGE_SIZE = 20;

/** The first `pages` pages of replies, and whether more are waiting. */
export function visibleReplies<T>(replies: readonly T[], pages: number): { shown: T[]; more: boolean } {
  const count = Math.max(1, pages) * REPLY_PAGE_SIZE;
  return { shown: replies.slice(0, count), more: replies.length > count };
}

/** When the newest loaded reply on this post was written. A live update reads only what came after. */
export function newestReplyAt(
  comments: readonly PostComment[],
  postId: string,
  pending: (comment: PostComment) => boolean,
): string | null {
  let newest: string | null = null;
  for (const comment of comments) {
    if (comment.postId !== postId || pending(comment)) continue;
    if (newest === null || comment.createdAt > newest) newest = comment.createdAt;
  }
  return newest;
}

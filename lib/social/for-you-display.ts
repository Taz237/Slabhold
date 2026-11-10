import { isOfficialUpdatesAccount } from "./official-updates";

/**
 * Home timeline display only. Posts stay in the database and on profiles.
 * The input list is not mutated.
 */

export function postTextKey(body: string): string {
  return body.trim();
}

/** Changelog posts from the updates account. Photo posts, cards, quotes, and reposts stay in the feed. */
export function isReleaseNotePost(input: {
  authorId?: string | null;
  body: string;
  imageUrl?: string | null;
  hasCard?: boolean;
  postType?: string | null;
  quotedPostId?: string | null;
  reposted?: boolean;
}): boolean {
  if (input.reposted) return false;
  if (input.quotedPostId) return false;
  if (!isOfficialUpdatesAccount(input.authorId)) return false;
  if (input.postType === "mail_day") return false;
  if (input.imageUrl) return false;
  if (input.hasCard) return false;
  return postTextKey(input.body).length > 0;
}

export type ForYouSource = {
  key: string;
  post: {
    id: string;
    authorId: string;
    body: string;
    imageDataUrl?: string | null;
    card?: unknown;
    postType?: string | null;
    quotedPostId?: string | null;
    createdAt: string;
  };
  repostedBy?: { id: string } | null;
};

export type ForYouFeedEntry<T> = { kind: "post"; item: T };

function isReleaseNoteItem(item: ForYouSource): boolean {
  return isReleaseNotePost({
    authorId: item.post.authorId,
    body: item.post.body,
    imageUrl: item.post.imageDataUrl,
    hasCard: Boolean(item.post.card),
    postType: item.post.postType,
    quotedPostId: item.post.quotedPostId,
    reposted: Boolean(item.repostedBy),
  });
}

/** Drops updates-account release notes. Everything else keeps its order. */
export function withoutReleaseNotes<T extends ForYouSource>(items: readonly T[]): T[] {
  return items.filter((item) => !isReleaseNoteItem(item));
}

/**
 * Newest-first For You rows. Release notes from the updates account are hidden.
 * Collector posts, reposts, photos, cards, and quotes keep their order.
 * Pagination stays on the raw list.
 */
export function presentForYouFeed<T extends ForYouSource>(
  items: readonly T[],
): ForYouFeedEntry<T>[] {
  return withoutReleaseNotes(items).map((item) => ({ kind: "post" as const, item }));
}

/** Following rows. Same release-note filter as For You. */
export function presentFollowingFeed<T extends ForYouSource>(
  items: readonly T[],
): ForYouFeedEntry<T>[] {
  return withoutReleaseNotes(items).map((item) => ({ kind: "post" as const, item }));
}

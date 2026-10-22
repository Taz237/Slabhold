/**
 * For You display only. Posts stay in the database and on profiles.
 * The input list is not mutated.
 */

/** Current updates handle. Older rows may still say grokbotreview. */
export const RELEASE_NOTE_HANDLES = ["slabholdupdates", "grokbotreview"] as const;

export const RELEASE_NOTE_HANDLE = "slabholdupdates";

export function postTextKey(body: string): string {
  return body.trim();
}

/** Changelog posts from the updates account. Photo posts, cards, quotes, and reposts stay in the feed. */
export function isReleaseNotePost(input: {
  username?: string | null;
  body: string;
  imageUrl?: string | null;
  hasCard?: boolean;
  postType?: string | null;
  quotedPostId?: string | null;
  reposted?: boolean;
}): boolean {
  if (input.reposted) return false;
  if (input.quotedPostId) return false;
  const handle = (input.username ?? "").replace(/^@/, "").trim().toLowerCase();
  if (!(RELEASE_NOTE_HANDLES as readonly string[]).includes(handle)) return false;
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

export type ForYouFeedEntry<T> =
  | { kind: "post"; item: T }
  | { kind: "whats-new"; key: string; items: T[] };

/**
 * Newest-first For You rows.
 * Duplicate text is dropped only inside updates-account release notes.
 * Collector posts, reposts, Mail Days, photos, cards, and quotes stay put.
 * Release notes collapse into one What's new card placed after the newest collector post.
 * Pagination stays on the raw list.
 */
export function presentForYouFeed<T extends ForYouSource>(
  items: readonly T[],
  usernameFor: (authorId: string) => string | null | undefined,
): ForYouFeedEntry<T>[] {
  const notes: T[] = [];
  const collectors: T[] = [];
  for (const item of items) {
    if (
      isReleaseNotePost({
        username: usernameFor(item.post.authorId),
        body: item.post.body,
        imageUrl: item.post.imageDataUrl,
        hasCard: Boolean(item.post.card),
        postType: item.post.postType,
        quotedPostId: item.post.quotedPostId,
        reposted: Boolean(item.repostedBy),
      })
    ) {
      notes.push(item);
    } else {
      collectors.push(item);
    }
  }

  const seenNoteText = new Set<string>();
  const uniqueNotes: T[] = [];
  for (const item of notes) {
    const text = postTextKey(item.post.body);
    const stamp = `${item.post.authorId}\n${text}`;
    if (text && seenNoteText.has(stamp)) continue;
    if (text) seenNoteText.add(stamp);
    uniqueNotes.push(item);
  }

  const posts = collectors.map((item) => ({ kind: "post" as const, item }));
  if (uniqueNotes.length === 0) return posts;
  const card: ForYouFeedEntry<T> = { kind: "whats-new", key: "whats-new", items: uniqueNotes };
  if (posts.length === 0) return [card];
  return [posts[0]!, card, ...posts.slice(1)];
}

export function whatsNewLabel(count: number): string {
  const total = Math.max(0, Math.floor(count));
  return `What's new (${total})`;
}

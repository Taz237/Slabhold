import type { Post } from "./types";

const WANT_POST = /^Added .+ to my want list$/;

export function wantListPostBody(label: string): string {
  const suffix = " to my want list";
  const prefix = "Added ";
  const name = label.replace(/\s+/g, " ").trim() || "a card";
  const full = `${prefix}${name}${suffix}`;
  if (full.length <= 280) return full;
  const room = 280 - prefix.length - suffix.length - 1;
  return `${prefix}${name.slice(0, Math.max(1, room)).trimEnd()}…${suffix}`;
}

export function isWantListPost(post: { body: string }): boolean {
  return WANT_POST.test(post.body.trim());
}

/** One feed row per author and card. Text-only announcements collapse on the body. */
export function wantListCollapseKey(
  post: Pick<Post, "authorId" | "body" | "card">,
): string | null {
  if (!isWantListPost(post)) return null;
  const cardId = post.card?.id?.trim();
  if (cardId) return `${post.authorId}\n${cardId}`;
  return `${post.authorId}\n${post.body.trim()}`;
}

export function hasWantListPost(
  posts: Array<Pick<Post, "authorId" | "body" | "card">>,
  authorId: string,
  cardId: string,
): boolean {
  return posts.some(
    (post) =>
      post.authorId === authorId &&
      post.card?.id === cardId &&
      isWantListPost(post),
  );
}

/** Public cards can be announced. Private cards stay off the feed. */
export function shouldPublishWantPost(input: {
  isPublic: boolean;
  alreadyPosted: boolean;
}): boolean {
  return input.isPublic && !input.alreadyPosted;
}

/** Keep the newest want-list post for each card. Other posts are unchanged. */
export function collapseWantListPosts<T extends Post>(posts: T[]): T[] {
  const kept = new Map<string, T>();
  const rest: T[] = [];
  for (const post of posts) {
    const key = wantListCollapseKey(post);
    if (!key) {
      rest.push(post);
      continue;
    }
    const prev = kept.get(key);
    if (
      !prev ||
      post.createdAt > prev.createdAt ||
      (post.createdAt === prev.createdAt && post.id > prev.id)
    ) {
      kept.set(key, post);
    }
  }
  return [...rest, ...kept.values()];
}

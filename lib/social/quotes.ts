import type { Post, Profile, PublicCard } from "./types";

export const QUOTE_EMPTY_ERROR = "Add a comment to your quote";

/** Quote text is required unless a card or image is attached. */
export function validateQuoteContent(input: {
  body: string;
  imageDataUrl?: string | null;
  card?: PublicCard | null;
}): string | null {
  const body = input.body.trim();
  if (body || input.imageDataUrl || input.card) return null;
  return QUOTE_EMPTY_ERROR;
}

export type QuoteEmbedState =
  | { kind: "unavailable" }
  | {
      kind: "ok";
      post: Post;
      author: Profile;
      /** When the quoted post is itself a quote, show this instead of nesting. */
      nestedLink: { handle: string; href: string } | null;
    };

/**
 * Resolve how to render a quoted post embed.
 * Missing / deleted / RLS-hidden → unavailable.
 * If the quoted post quotes another, expose a single "Quoting @handle" link line.
 */
export function resolveQuoteEmbedState(
  quotedPostId: string | null | undefined,
  postsById: Map<string, Post>,
  profilesById: Map<string, Profile>,
): QuoteEmbedState {
  if (!quotedPostId) return { kind: "unavailable" };
  const post = postsById.get(quotedPostId);
  if (!post) return { kind: "unavailable" };
  const author = profilesById.get(post.authorId);
  if (!author) return { kind: "unavailable" };

  let nestedLink: { handle: string; href: string } | null = null;
  if (post.quotedPostId) {
    const inner = postsById.get(post.quotedPostId);
    const innerAuthor = inner ? profilesById.get(inner.authorId) : undefined;
    nestedLink = {
      handle: innerAuthor?.username ?? "user",
      href: `/posts/${post.quotedPostId}`,
    };
  }

  return { kind: "ok", post, author, nestedLink };
}

/** Skip quote notification when quoting yourself. */
export function shouldNotifyQuoteAuthor(
  actorId: string,
  originalAuthorId: string | null | undefined,
): boolean {
  return Boolean(originalAuthorId && originalAuthorId !== actorId);
}

export function quotesOf(
  posts: Post[],
  originalPostId: string,
): Post[] {
  return posts
    .filter((post) => post.quotedPostId === originalPostId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function quoteCount(posts: Post[], originalPostId: string): number {
  return posts.reduce(
    (sum, post) => (post.quotedPostId === originalPostId ? sum + 1 : sum),
    0,
  );
}

import type { Post } from "./types";
import { userHref } from "./user-href";

/*
 * The small parts of sending a post in a DM that a post row needs. The rest
 * (the sheet's people list, the message text) is in send-post.ts.
 */

export function postLink(postId: string): string {
  return `https://slabhold.app/posts/${postId}`;
}

export const ASK_PRICE_TEXT = "How much?";

/** The draft an Ask price tap opens with. Never sent until the person taps Send. */
export function askPriceDraft(postId: string): string {
  return `${ASK_PRICE_TEXT}\n${postLink(postId)}`;
}

/** Where Ask price goes: the author's thread, with the post named. */
export function askPriceHref(username: string, postId: string): string {
  return `${userHref(username, "messages")}?post=${encodeURIComponent(postId)}`;
}

/** Ask price shows on someone else's post that has a card. */
export function canAskPrice(post: Pick<Post, "authorId" | "card" | "hiddenAt">, viewerId: string | null): boolean {
  return Boolean(viewerId && post.card && !post.hiddenAt && post.authorId !== viewerId);
}

/** Send shows to anyone logged in, on posts that aren't hidden. */
export function canSendPost(post: Pick<Post, "hiddenAt">, viewerId: string | null): boolean {
  return Boolean(viewerId && !post.hiddenAt);
}

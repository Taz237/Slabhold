import type { PublicCard } from "./types";
import { POST_LIMIT } from "./types";

export const SHARE_PRIVATE_REASON =
  "Private cards stay off the feed. Show this card on your profile to share it.";

export const SHARE_CONFIRM_TEXT = "Shared to your feed.";

const SHARE_KEY = "slabhold.shared-post";

export type ShareStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

/** Off by default. A private card cannot turn it on. */
export function shareToFeedControl(input: { isPublic: boolean; share: boolean }): {
  checked: boolean;
  disabled: boolean;
  explanation: string | null;
} {
  if (!input.isPublic) {
    return { checked: false, disabled: true, explanation: SHARE_PRIVATE_REASON };
  }
  return { checked: input.share, disabled: false, explanation: null };
}

export function sharePostPath(postId: string): string {
  return `/posts/${postId}`;
}

/**
 * The post saved with a new public card. Null when sharing is off or the card is private.
 * The card attachment already shows its photo, so the post does not copy that photo again.
 */
export function sharePostFromCard(input: {
  isPublic: boolean;
  share: boolean;
  caption: string;
  card: PublicCard;
}): {
  body: string;
  imageDataUrl: null;
  images: [];
  card: PublicCard;
  shareOfNewCard: true;
} | null {
  const control = shareToFeedControl({ isPublic: input.isPublic, share: input.share });
  if (!control.checked) return null;
  const caption = input.caption.trim().slice(0, POST_LIMIT);
  return {
    body: caption,
    imageDataUrl: null,
    images: [],
    card: input.card,
    shareOfNewCard: true,
  };
}

export function writeSharedPost(store: ShareStore, cardId: string, postId: string) {
  if (!cardId || !postId) return;
  store.setItem(SHARE_KEY, JSON.stringify({ cardId, postId }));
}

/** Read the confirmation once. A different card, or a bad value, leaves nothing to show. */
export function takeSharedPost(store: ShareStore, cardId: string): string | null {
  const raw = store.getItem(SHARE_KEY);
  if (!raw) return null;
  store.removeItem(SHARE_KEY);
  try {
    const parsed = JSON.parse(raw) as { cardId?: unknown; postId?: unknown };
    if (parsed.cardId !== cardId || typeof parsed.postId !== "string" || !parsed.postId) {
      return null;
    }
    return parsed.postId;
  } catch {
    return null;
  }
}

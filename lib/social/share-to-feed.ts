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

/** The browser store, or null when storage is missing or blocked. */
export function shareSessionStore(): ShareStore | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

export function writeSharedPost(store: ShareStore, cardId: string, postId: string) {
  if (!cardId || !postId) return;
  try {
    store.setItem(SHARE_KEY, JSON.stringify({ cardId, postId }));
  } catch {
    // The post is already saved. Storage must not turn that into a failed share.
  }
}

/** Read the confirmation once. A different card, or a bad value, leaves nothing to show. */
export function takeSharedPost(store: ShareStore, cardId: string): string | null {
  try {
    const raw = store.getItem(SHARE_KEY);
    if (!raw) return null;
    try {
      store.removeItem(SHARE_KEY);
    } catch {
      // Showing the note once is enough. A blocked remove must not throw.
    }
    const parsed = JSON.parse(raw) as { cardId?: unknown; postId?: unknown };
    if (parsed.cardId !== cardId || typeof parsed.postId !== "string" || !parsed.postId) {
      return null;
    }
    return parsed.postId;
  } catch {
    return null;
  }
}

/** The Review label for the feed toggle on Add card. */
export const FEED_POST_LABEL = "Also post to my feed";

export const FEED_POST_HELD_REASON =
  "Brand, official and test accounts post from the composer, not from Add card.";

export const FEED_POST_FAILED_TEXT = "Saved the card, but couldn't post it to your feed.";

const NOT_SURE = "parallel (not sure)";

/**
 * "Just added my 2024 Donruss Optic Downtown Tyrese Maxey". Names only: no
 * price, no paid amount, no cert, no notes. Base and "not sure" are left out.
 */
export function justAddedCaption(input: {
  yearLabel?: string | null;
  setBrand?: string | null;
  parallel?: string | null;
  playerName?: string | null;
}): string {
  const clean = (value: string | null | undefined) => (value ?? "").trim().replace(/\s+/g, " ");
  const parallel = clean(input.parallel);
  const shownParallel =
    parallel && parallel.toLowerCase() !== "base" && parallel.toLowerCase() !== NOT_SURE ? parallel : "";
  const parts = [clean(input.yearLabel), clean(input.setBrand), shownParallel, clean(input.playerName)].filter(Boolean);
  if (parts.length === 0) return "";
  return Array.from(`Just added my ${parts.join(" ")}`).slice(0, POST_LIMIT).join("");
}

/** Brand, official and test accounts never post from Add card. */
export function addCardMayPost(input: {
  isBrand: boolean;
  isOfficial: boolean;
  isTest: boolean;
}): boolean {
  return !input.isBrand && !input.isOfficial && !input.isTest;
}

/**
 * "Also post to my feed" on Review. Off and locked while the card is private.
 * Once the card is public it starts on, unless the collector turned it off.
 * Brand, official and test accounts keep it off.
 */
export function feedPostControl(input: {
  isPublic: boolean;
  /** The collector's own choice. Null until they touch the toggle. */
  choice: boolean | null;
  mayPost: boolean;
}): { checked: boolean; disabled: boolean; explanation: string | null } {
  if (!input.mayPost) return { checked: false, disabled: true, explanation: FEED_POST_HELD_REASON };
  return shareToFeedControl({ isPublic: input.isPublic, share: input.choice ?? input.isPublic });
}

const POSTED_KEY = "slabhold.card-posts";
const FAILED_KEY = "slabhold.card-post-failed";
const COMPOSE_CAPTION_KEY = "slabhold.compose-caption";

function readMap(store: ShareStore, key: string): Record<string, string> {
  try {
    const raw = store.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string") out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(store: ShareStore, key: string, map: Record<string, string>) {
  try {
    if (Object.keys(map).length === 0) store.removeItem(key);
    else store.setItem(key, JSON.stringify(map));
  } catch {
    // Storage is a convenience here. The post or card is already saved.
  }
}

/** Remember the post one add created, so a retry or a second submit never posts again. */
export function recordCardPost(store: ShareStore, cardId: string, postId: string) {
  if (!cardId || !postId) return;
  const map = readMap(store, POSTED_KEY);
  map[cardId] = postId;
  writeMap(store, POSTED_KEY, map);
  clearCardPostFailed(store, cardId);
}

/** The post this card's add already created, or null. Does not clear it. */
export function cardPostId(store: ShareStore, cardId: string): string | null {
  return readMap(store, POSTED_KEY)[cardId] || null;
}

/** The card saved but its post failed: the reveal says so and offers Post it. */
export function writeCardPostFailed(store: ShareStore, cardId: string, caption: string) {
  if (!cardId) return;
  const map = readMap(store, FAILED_KEY);
  map[cardId] = caption.slice(0, POST_LIMIT);
  writeMap(store, FAILED_KEY, map);
}

/** The caption of a failed post for this card, or null when nothing failed. */
export function cardPostFailed(store: ShareStore, cardId: string): string | null {
  const map = readMap(store, FAILED_KEY);
  return cardId in map ? map[cardId] : null;
}

export function clearCardPostFailed(store: ShareStore, cardId: string) {
  const map = readMap(store, FAILED_KEY);
  if (!(cardId in map)) return;
  delete map[cardId];
  writeMap(store, FAILED_KEY, map);
}

/** A caption for the composer to start with, for this card only. */
export function writeComposeCaption(store: ShareStore, cardId: string, caption: string) {
  if (!cardId || !caption.trim()) return;
  try {
    store.setItem(COMPOSE_CAPTION_KEY, JSON.stringify({ cardId, caption: caption.slice(0, POST_LIMIT) }));
  } catch {
    // The composer just starts empty.
  }
}

/** Read once. Another card, or a bad value, gives nothing. */
export function takeComposeCaption(store: ShareStore, cardId: string | null): string | null {
  try {
    const raw = store.getItem(COMPOSE_CAPTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { cardId?: unknown; caption?: unknown };
    if (!cardId || parsed.cardId !== cardId || typeof parsed.caption !== "string") return null;
    try {
      store.removeItem(COMPOSE_CAPTION_KEY);
    } catch {
      // Showing it once is enough.
    }
    return parsed.caption.slice(0, POST_LIMIT) || null;
  } catch {
    return null;
  }
}

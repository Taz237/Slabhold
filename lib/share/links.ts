import { badgeName, type BadgeCategory, type BadgeTier } from "@/lib/badges/config";
import { INVITE_CODE_PARAM, inviteCode } from "@/lib/invites/code";
import { userHref } from "@/lib/social/user-href";

/** Marks a link as shared from the app, so landings can be told apart. */
export function withShareRef(url: string): string {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  params.delete("ref");
  const rest = params.toString();
  parsed.search = rest ? `?ref=share&${rest}` : "?ref=share";
  return parsed.toString();
}

/** X compose intent. Each value is encoded on its own so `&`, `#`, and emoji survive. */
export function xIntentUrl(input: { text: string; url: string }): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(input.text)}&url=${encodeURIComponent(input.url)}`;
}

function handle(username: string): string {
  return username.replace(/^@/, "").trim().toLowerCase();
}

export function badgeSharePath(username: string, category: BadgeCategory, tier: BadgeTier): string {
  return `${userHref(handle(username))}/badges/${category}/${tier}`;
}

/** 1080×1350 portrait for Instagram. */
export function badgeImagePath(username: string, category: BadgeCategory, tier: BadgeTier): string {
  return `/api/share-image/badge/${encodeURIComponent(handle(username))}/${category}/${tier}`;
}

export function badgeShareText(category: BadgeCategory, tier: BadgeTier): string {
  return `Just unlocked ${badgeName(category, tier)} on Slabhold`;
}

/** 1080×1350 portrait for Instagram. */
export function cardImagePath(cardId: string): string {
  return `/api/share-image/card/${encodeURIComponent(cardId)}`;
}

export const PRIVATE_CARD_SHARE = "Make this card public to share";

export type CardShareState =
  | { kind: "private"; message: string }
  | { kind: "unavailable" }
  | { kind: "share"; path: string; imagePath: string };

/** Private cards are never shared: no link, no image. */
export function cardShareState(input: {
  isPublic: boolean;
  username: string | null | undefined;
  cardId: string;
}): CardShareState {
  if (!input.isPublic) return { kind: "private", message: PRIVATE_CARD_SHARE };
  const name = handle(input.username ?? "");
  if (!name || !input.cardId) return { kind: "unavailable" };
  return {
    kind: "share",
    path: `${userHref(name)}/cards/${input.cardId}`,
    imagePath: cardImagePath(input.cardId),
  };
}

/** What an invite says, next to the link. */
export const INVITE_SHARE_TEXT = "Join me on Slabhold, the home for your card collection";

/**
 * Personal invite link: /i/<username>?c=<code>. Only a link with the
 * inviter's code gets a follow-back; without one, /i/<username> still works
 * and the new collector just follows the inviter.
 */
export function invitePath(username: string, code?: string | null): string {
  const path = `/i/${encodeURIComponent(handle(username))}`;
  const valid = inviteCode(code);
  return valid ? `${path}?${INVITE_CODE_PARAM}=${valid}` : path;
}

/** Public, read-only collection page. */
export function collectionSharePath(username: string): string {
  return `${userHref(handle(username))}/collection`;
}

/** 1080×1920 PNG for Instagram Stories. */
export function collectionStoryPath(username: string): string {
  return `/api/share-image/collection/${encodeURIComponent(handle(username))}`;
}

/** Saved file name for the Story image. */
export function collectionStoryFilename(username: string): string {
  return `slabhold-${handle(username)}-collection.png`;
}

export function collectionShareText(count: number | null): string {
  if (count == null || count <= 0) return "My collection on Slabhold";
  return `My collection on Slabhold: ${count} ${count === 1 ? "card" : "cards"}`;
}

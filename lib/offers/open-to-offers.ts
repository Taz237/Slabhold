import { signupPath } from "@/lib/auth/safe-next";
import { BLOCKED_INTERACTION } from "@/lib/safety/block";
import type { CardMessagePreview } from "@/lib/social/types";
import { NOT_ENOUGH_SALES_LABEL, VALUE_UNAVAILABLE_LABEL } from "@/lib/value/format";

export const OPEN_TO_OFFERS_LABEL = "Open to offers";
export const OWNER_OPEN_TO_OFFERS = "Owner is open to offers";
export const MESSAGE_OWNER_LABEL = "Message owner";
export const SENT_A_CARD = "Sent a card";

/** Case-sensitive uuid text, matching cards.id::text in the insert rule. */
const CARD_PREVIEW_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Null when the column is not on the row yet. False and true are real values. */
export function readOpenToOffers(row: object): boolean | null {
  if (!Object.prototype.hasOwnProperty.call(row, "open_to_offers")) return null;
  return (row as { open_to_offers?: unknown }).open_to_offers === true;
}

export function offersColumnMissing(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204";
}

/** Columns a DM inbox needs. Preview columns are omitted after one missing-column miss. */
export const MESSAGE_LIST_COLUMNS =
  "id, sender_id, receiver_id, content, created_at, read, kind, card_preview";
export const MESSAGE_LIST_COLUMNS_BASE =
  "id, sender_id, receiver_id, content, created_at, read";

/**
 * "retry" means this read should fall back to the base columns once.
 * A miss is not cached, so the next read re-checks kind and card_preview.
 */
export function noteMessageListResult(
  error: { code?: string; message?: string } | null | undefined,
): "ok" | "retry" | "error" {
  if (!error) return "ok";
  if (offersColumnMissing(error)) return "retry";
  return "error";
}

export function resetMessageListColumnProbe(): void {
  return;
}

type MessageListResponse<T> = {
  data: T;
  error: { code?: string; message?: string } | null;
};

/**
 * Read DM rows with kind and card_preview. If an earlier check decided those
 * columns were missing, this still probes them again so a session that loaded
 * before the column existed can render a card message without a full reload.
 */
export async function loadMessageRows<T>(
  run: (columns: string) => PromiseLike<MessageListResponse<T>>,
): Promise<MessageListResponse<T>> {
  const probe = await run(MESSAGE_LIST_COLUMNS);
  if (noteMessageListResult(probe.error) !== "retry") return probe;
  return run(MESSAGE_LIST_COLUMNS_BASE);
}

/** Inbox preview. A card with no text reads "Sent a card" instead of a blank line. */
export function inboxLastMessage(message: {
  content?: string | null;
  kind?: string | null;
  cardPreview?: { cardId: string } | null;
}): string {
  const text = (message.content ?? "").trim();
  if (text) return text;
  if (
    message.cardPreview ||
    message.kind === "card" ||
    message.kind === "card_preview"
  ) {
    return SENT_A_CARD;
  }
  return "";
}

/**
 * Edit form only. Hidden for a new card, a private card, someone else's card,
 * and while the column has not been added.
 */
export function showOpenToOffersToggle(input: {
  isEdit: boolean;
  isOwner: boolean;
  isPublic: boolean;
  columnKnown: boolean;
}): boolean {
  return input.isEdit && input.isOwner && input.isPublic && input.columnKnown;
}

export function showOpenToOffersBadge(openToOffers: boolean | null | undefined): boolean {
  return openToOffers === true;
}

export function openToOffersFilterAvailable<T extends { openToOffers?: boolean | null }>(
  cards: readonly T[],
): boolean {
  return cards.some((card) => card.openToOffers != null);
}

export function filterOpenToOffers<T extends { openToOffers?: boolean | null }>(
  cards: readonly T[],
  enabled: boolean,
): T[] {
  if (!enabled) return [...cards];
  return cards.filter((card) => card.openToOffers === true);
}

/** Keep the flag off when the card is private. Omit it when the column is unknown. */
export function publicTogglePatch(
  card: { openToOffers?: boolean | null },
  isPublic: boolean,
): { isPublic: boolean; openToOffers?: boolean } {
  if (card.openToOffers != null && !isPublic) {
    return { isPublic, openToOffers: false };
  }
  return { isPublic };
}

export function withOpenToOffersColumn<T extends Record<string, unknown>>(
  row: T,
  card: { isPublic?: boolean | null; openToOffers?: boolean | null },
): T & { open_to_offers?: boolean } {
  if (typeof card.openToOffers !== "boolean") return row;
  return {
    ...row,
    open_to_offers: Boolean(card.isPublic) && card.openToOffers,
  };
}

export function offerEstimateLabel(label: string | null | undefined): string {
  const text = (label ?? "").trim();
  if (!text) return NOT_ENOUGH_SALES_LABEL;
  if (
    text === NOT_ENOUGH_SALES_LABEL ||
    text === "Value updating" ||
    text === VALUE_UNAVAILABLE_LABEL
  ) {
    return text;
  }
  if (/^est\./i.test(text)) return text;
  return `Est. ${text}`;
}

export function messageOwnerThreadHref(username: string, cardId: string): string {
  const handle = username.replace(/^@/, "").trim();
  return `/messages/${encodeURIComponent(handle)}?card=${encodeURIComponent(cardId)}`;
}

/**
 * Signed-in collectors get the DM deep link. Signed-out visitors get signup
 * that returns to that thread. Hidden for self, blocks, mutes, and cards that
 * are not open to offers.
 */
export function messageOwnerHref(input: {
  viewerId: string | null;
  ownerId: string;
  ownerUsername: string;
  cardId: string;
  openToOffers: boolean | null | undefined;
  blocked: boolean;
  muted: boolean;
}): string | null {
  if (input.openToOffers !== true) return null;
  const ownerId = input.ownerId.trim();
  const cardId = input.cardId.trim();
  const username = input.ownerUsername.replace(/^@/, "").trim();
  if (!ownerId || !cardId || !username) return null;
  if (input.viewerId && input.viewerId === ownerId) return null;
  if (input.blocked || input.muted) return null;
  const thread = messageOwnerThreadHref(username, cardId);
  if (!input.viewerId) return signupPath(thread);
  return thread;
}

export function offerSendError(input: {
  senderId: string;
  receiverId: string;
  blocked: boolean;
  muted: boolean;
  preview: CardMessagePreview | null;
}): string | null {
  if (!input.senderId || !input.receiverId) return "Log in to send a message.";
  if (input.senderId === input.receiverId) return "You can't message yourself.";
  if (input.blocked) return BLOCKED_INTERACTION;
  if (input.preview && input.muted) return BLOCKED_INTERACTION;
  if (input.preview && !parseCardPreview(input.preview)) return "That card can't be attached.";
  return null;
}

/**
 * Accept a card id and drop every other stored field.
 * Uuid-shaped ids are lowercased before the shape check so an uppercase uuid
 * matches the insert rule, which compares cardId to cards.id::text.
 */
export function parseCardPreview(value: unknown): CardMessagePreview | null {
  if (!value || typeof value !== "object") return null;
  const cardId = (value as { cardId?: unknown }).cardId;
  if (typeof cardId !== "string") return null;
  const trimmed = cardId.trim();
  const id = trimmed.toLowerCase();
  if (!id) return null;
  if (trimmed.length === 36 && trimmed.includes("-") && !CARD_PREVIEW_UUID.test(id)) return null;
  return { cardId: id };
}

export type LiveCardPreview = {
  cardId: string;
  href: string;
  player: string;
  year: string;
  set: string;
  imageUrl: string | null;
  createdAt: string | null;
};

type LiveOfferCard = {
  id: string;
  ownerId: string;
  openToOffers?: boolean | null;
  playerName: string;
  year: number;
  yearLabel?: string | null;
  setBrand: string;
  photoDataUrl: string | null;
  createdAt?: string | null;
};

/**
 * Build the public card link and labels from the live card.
 * A card that is missing, private, or no longer open to offers returns null.
 */
export function resolveLiveCardPreview(
  cardId: string,
  cards: readonly LiveOfferCard[],
  profiles: readonly { id: string; username: string }[],
): LiveCardPreview | null {
  const id = cardId.trim();
  if (!id) return null;
  const card = cards.find((item) => item.id === id);
  if (!card || card.openToOffers !== true) return null;
  const username = profiles
    .find((profile) => profile.id === card.ownerId)
    ?.username.replace(/^@/, "")
    .trim();
  const player = card.playerName.trim();
  const year = (card.yearLabel || String(card.year)).trim();
  const set = card.setBrand.trim();
  if (!username || !player || !year || !set) return null;
  return {
    cardId: card.id,
    href: `/u/${encodeURIComponent(username)}/cards/${encodeURIComponent(card.id)}`,
    player,
    year,
    set,
    imageUrl: card.photoDataUrl,
    createdAt: card.createdAt ?? null,
  };
}

type OfferThreadCard = {
  id: string;
  ownerId: string;
  openToOffers?: boolean | null;
  playerName: string;
  year: number;
  yearLabel?: string | null;
  setBrand: string;
  photoDataUrl: string | null;
};

/** The card on a DM deep link, or null when it must not be attached. */
export function offerCardForThread(input: {
  cardId: string | null;
  partnerId: string | null;
  viewerId: string | null;
  blocked: boolean;
  muted: boolean;
  cards: readonly OfferThreadCard[];
}): OfferThreadCard | null {
  const cardId = input.cardId?.trim() ?? "";
  if (!cardId || !input.partnerId || !input.viewerId) return null;
  if (input.viewerId === input.partnerId || input.blocked || input.muted) return null;
  const card = input.cards.find((item) => item.id === cardId && item.ownerId === input.partnerId);
  if (!card || card.openToOffers !== true) return null;
  return card;
}

export function mapDirectMessage(row: {
  id: string;
  sender_id: string;
  receiver_id: string;
  content?: string | null;
  created_at: string;
  read?: boolean | null;
  kind?: string | null;
  card_preview?: unknown;
}): {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: string;
  read: boolean;
  kind: "text" | "card_preview";
  cardPreview: CardMessagePreview | null;
} {
  const preview = parseCardPreview(row.card_preview);
  const kindName = typeof row.kind === "string" ? row.kind : "";
  const cardMessage = Boolean(preview) || kindName === "card" || kindName === "card_preview";
  return {
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    content: row.content ?? "",
    createdAt: row.created_at,
    read: row.read === true,
    kind: cardMessage ? "card_preview" : "text",
    cardPreview: preview,
  };
}

export function openOfferAlert(event: {
  openToOffers?: boolean | null;
  actorId?: string | null;
  actorUsername?: string | null;
  cardId?: string | null;
}): { line: string; href: string } | null {
  if (event.openToOffers !== true) return null;
  const username = event.actorUsername?.replace(/^@/, "").trim() ?? "";
  const cardId = event.cardId?.trim() ?? "";
  if (!event.actorId || !username || !cardId) return null;
  return {
    line: OWNER_OPEN_TO_OFFERS,
    href: messageOwnerThreadHref(username, cardId),
  };
}

export function withOpenOfferPreview(
  preview: string,
  event: {
    openToOffers?: boolean | null;
    actorId?: string | null;
    actorUsername?: string | null;
    cardId?: string | null;
  },
): string {
  const offer = openOfferAlert(event);
  if (!offer) return preview;
  return `${preview}. ${offer.line}`;
}

/** Internal /messages link stored on a want alert. Anything else is ignored. */
export function messageOwnerLinkFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): { line: string; href: string } | null {
  if (!metadata || metadata.open_to_offers !== true) return null;
  const href = metadata.message_owner_href;
  if (typeof href !== "string" || !href.startsWith("/messages/") || href.startsWith("//")) return null;
  return { line: OWNER_OPEN_TO_OFFERS, href };
}

import { isSold } from "@/lib/format";
import { userHref } from "@/lib/social/user-href";
import type { SportsCard } from "@/lib/types";

export type DealKind = "sale" | "trade";
export type DealStatus = "pending" | "confirmed" | "declined" | "cancelled";

export type Deal = {
  id: string;
  cardId: string | null;
  sellerId: string;
  buyerId: string;
  kind: DealKind;
  priceCents: number | null;
  status: DealStatus;
  cardPlayer: string;
  cardYear: string;
  cardSet: string;
  cardNumber: string;
  cardParallel: string;
  createdAt: string;
  confirmedAt: string | null;
};

/** $1,000,000. Matches deals_price_cents. */
export const MAX_DEAL_PRICE_CENTS = 100_000_000;

/** At most this many deals from one seller to one buyer in an hour. */
export const DEAL_PAIR_HOURLY_LIMIT = 5;

export type DealActions = {
  confirm: boolean;
  decline: boolean;
  cancel: boolean;
  addToCollection: boolean;
};

export const MARK_SOLD_LABEL = "Mark as sold/traded";
export const CONFIRM_DEAL_LABEL = "Confirm";
export const DECLINE_DEAL_LABEL = "Decline";
export const CANCEL_DEAL_LABEL = "Cancel";
export const ADD_TO_COLLECTION_LABEL = "Add to my collection";

export function confirmDealPreview(cardName: string): string {
  const name = cardName.trim() || "this card";
  return `Confirm deal for ${name}?`;
}

/** What the signed-in person can do with a deal. Other people can do nothing. */
export function dealActions(deal: Deal, userId: string | null): DealActions {
  const buyer = Boolean(userId) && userId === deal.buyerId;
  const seller = Boolean(userId) && userId === deal.sellerId;
  const pending = deal.status === "pending";
  return {
    confirm: buyer && pending,
    decline: buyer && pending,
    cancel: seller && pending,
    addToCollection: buyer && deal.status === "confirmed",
  };
}

export function dmPartnerIds(
  messages: readonly { senderId: string; receiverId: string }[],
  userId: string,
): string[] {
  const ids = new Set<string>();
  for (const message of messages) {
    if (message.senderId === userId && message.receiverId !== userId) {
      ids.add(message.receiverId);
    } else if (message.receiverId === userId && message.senderId !== userId) {
      ids.add(message.senderId);
    }
  }
  return [...ids];
}

/** Empty input is no price. Anything else must be a non-negative dollar amount. */
export function priceDollarsToCents(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return "invalid";
  const cents = Math.round(Number(trimmed) * 100);
  if (!Number.isInteger(cents) || cents < 0 || cents > MAX_DEAL_PRICE_CENTS) return "invalid";
  return cents;
}

export function formatPriceCents(cents: number | null): string | null {
  if (cents == null) return null;
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export type AddCardPrefill = {
  player?: string;
  year?: string;
  set?: string;
  num?: string;
  parallel?: string;
  sport?: string;
  rookie?: boolean;
};

export function addCardHref(card: AddCardPrefill): string {
  const params = new URLSearchParams();
  params.set("pick", "1");
  params.set("player", (card.player ?? "").trim());
  if (card.year?.trim()) params.set("year", card.year.trim());
  if (card.set?.trim()) params.set("set", card.set.trim());
  if (card.num?.trim()) params.set("num", card.num.trim());
  if (card.parallel?.trim()) params.set("parallel", card.parallel.trim());
  if (card.sport?.trim()) params.set("sport", card.sport.trim());
  if (card.rookie) params.set("rookie", "1");
  return `/cards/new?${params.toString()}`;
}

export function prefillFromMetadata(metadata: unknown): AddCardPrefill | null {
  if (!metadata || typeof metadata !== "object") return null;
  const record = metadata as Record<string, unknown>;
  const player = typeof record.player === "string" ? record.player : "";
  if (!player.trim()) return null;
  return {
    player,
    year: typeof record.year === "string" ? record.year : "",
    set: typeof record.set === "string" ? record.set : "",
    num: typeof record.num === "string" ? record.num : "",
    parallel: typeof record.parallel === "string" ? record.parallel : "",
    sport: typeof record.sport === "string" ? record.sport : "",
    rookie: record.rookie === true,
  };
}

export function dealIdFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const id = (metadata as { deal_id?: unknown }).deal_id;
  return typeof id === "string" && id ? id : null;
}

export function heldCards(cards: readonly SportsCard[]): SportsCard[] {
  return cards.filter((card) => !isSold(card));
}

/** Name stored on the deal, including after the card row is gone. */
export function dealCardLabel(deal: Pick<Deal, "cardPlayer" | "cardYear" | "cardSet" | "cardNumber">): string {
  const parts = [deal.cardPlayer, deal.cardYear, deal.cardSet, deal.cardNumber]
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.join(" · ") || "This card";
}

/**
 * Prefer the actor's current username. The href saved at send time is only a fallback
 * so a rename does not leave a dead link.
 */
export function dealNotificationHref(
  actorId: string | null | undefined,
  username: string | null | undefined,
  storedHref: string | null | undefined,
): string {
  const handle = username?.replace(/^@/, "").trim();
  if (actorId && handle) return userHref(handle, "messages");
  if (storedHref && storedHref.startsWith("/messages/") && !storedHref.startsWith("//")) {
    return storedHref;
  }
  return "/notifications";
}

export function dealForNotification(metadata: unknown, deals: readonly Deal[]): Deal | null {
  const id = dealIdFromMetadata(metadata);
  if (!id) return null;
  return deals.find((deal) => deal.id === id) ?? null;
}

/** What a card delete does to that card's deals. Confirmed rows keep the snapshot. */
export function dealsAfterCardRemoved(deals: readonly Deal[], cardId: string): Deal[] {
  return deals.map((deal) => {
    if (deal.cardId !== cardId) return deal;
    if (deal.status === "pending") return { ...deal, cardId: null, status: "cancelled" };
    return { ...deal, cardId: null };
  });
}

export function dealRateAllows(createdInLastHour: number): boolean {
  return createdInLastHour < DEAL_PAIR_HOURLY_LIMIT;
}

/** Decline stays available. Confirm does not, once either person has blocked the other. */
export function confirmAllowed(blocked: boolean): boolean {
  return !blocked;
}

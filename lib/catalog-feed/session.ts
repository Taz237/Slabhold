import type { FeedCard, FeedFilters } from "./feed";
import { feedKey } from "./feed";

/**
 * What the feed remembers. The spot (cards, where you were, the next read)
 * lives for the tab session, so Back from a card page lands on the same
 * card. Hearts on never-posted cards and what you hearted (for For You) stay
 * on the device. Every read and write survives blocked storage.
 */

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const SPOT_PREFIX = "slabhold:catalog-feed:v1:";
const SEEN_KEY = "slabhold:catalog-feed:seen:v1";
const TASTE_KEY = "slabhold:catalog-feed:taste:v1";
const HEARTS_KEY = "slabhold:catalog-feed:hearts:v1";
/** A saved spot older than this starts fresh. */
export const SPOT_MAX_AGE_MS = 30 * 60 * 1000;
const SEEN_MAX = 2000;
const TASTE_MAX = 100;
const HEARTS_MAX = 500;
/** A saved spot keeps at most this many cards. */
const SPOT_MAX_CARDS = 120;

export type FeedSpot = {
  cards: FeedCard[];
  nextOffset: number | null;
  index: number;
  savedAt: number;
};

function read<T>(store: Store | null, key: string): T | null {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(store: Store | null, key: string, value: unknown): void {
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // Full or blocked: the feed still works for this visit.
  }
}

export function sessionStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function deviceStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Saves where the reader is. Keeps a window of cards around the one on screen. */
export function saveSpot(store: Store | null, filters: FeedFilters, spot: Omit<FeedSpot, "savedAt">, now = Date.now()): void {
  let { cards, index } = spot;
  if (cards.length > SPOT_MAX_CARDS) {
    const start = Math.max(0, Math.min(index - 20, cards.length - SPOT_MAX_CARDS));
    cards = cards.slice(start, start + SPOT_MAX_CARDS);
    index -= start;
  }
  write(store, SPOT_PREFIX + feedKey(filters), { cards, nextOffset: spot.nextOffset, index, savedAt: now });
}

/** The saved spot for this tab and sport, or null when there is none or it went stale. */
export function loadSpot(store: Store | null, filters: FeedFilters, now = Date.now()): FeedSpot | null {
  const spot = read<FeedSpot>(store, SPOT_PREFIX + feedKey(filters));
  if (!spot || !Array.isArray(spot.cards) || spot.cards.length === 0) return null;
  if (!(now - spot.savedAt < SPOT_MAX_AGE_MS)) return null;
  const index = Math.min(Math.max(0, Math.floor(Number(spot.index) || 0)), spot.cards.length - 1);
  return { ...spot, index };
}

export function loadSeen(store: Store | null): Set<string> {
  const ids = read<string[]>(store, SEEN_KEY);
  return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : []);
}

export function saveSeen(store: Store | null, seen: ReadonlySet<string>): void {
  write(store, SEEN_KEY, [...seen].slice(-SEEN_MAX));
}

export type TasteEntry = { sport: string; player: string };

export function loadTaste(store: Store | null): TasteEntry[] {
  const list = read<TasteEntry[]>(store, TASTE_KEY);
  return Array.isArray(list) ? list.filter((entry) => entry && typeof entry.player === "string") : [];
}

/** Remembers a hearted card's sport and player, newest last. */
export function addTaste(store: Store | null, card: Pick<FeedCard, "sport" | "player">): TasteEntry[] {
  const next = [...loadTaste(store), { sport: card.sport, player: card.player }].slice(-TASTE_MAX);
  write(store, TASTE_KEY, next);
  return next;
}

/** Hearts on cards that have no post yet. They stay on this device. */
export function loadDeviceHearts(store: Store | null): Set<string> {
  const ids = read<string[]>(store, HEARTS_KEY);
  return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : []);
}

export function saveDeviceHeart(store: Store | null, cardId: string, liked: boolean): Set<string> {
  const hearts = loadDeviceHearts(store);
  if (liked) hearts.add(cardId);
  else hearts.delete(cardId);
  write(store, HEARTS_KEY, [...hearts].slice(-HEARTS_MAX));
  return hearts;
}

import type { FeedCard, FeedFilters } from "./feed";
import { feedKey } from "./feed";

/**
 * What the feed remembers. The spot (which cards, where you were, the next
 * read) lives for the tab session, so Back from a card page lands on the
 * same card. The spot holds card ids only, so saving it as you swipe is a
 * tiny write; the cards themselves are saved once, when they load. What you
 * hearted (for For You) stays on the device. Every read and write survives
 * blocked storage.
 */

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const SPOT_PREFIX = "slabhold:catalog-feed:v2:";
const CARDS_KEY = "slabhold:catalog-feed:cards:v1";
const SEEN_KEY = "slabhold:catalog-feed:seen:v1";
const TASTE_KEY = "slabhold:catalog-feed:taste:v1";
/** A saved spot older than this starts fresh. */
export const SPOT_MAX_AGE_MS = 30 * 60 * 1000;
const SEEN_MAX = 2000;
const TASTE_MAX = 100;
/** A saved spot keeps at most this many cards. */
const SPOT_MAX_CARDS = 120;
/** Cards kept for every tab and sport together, newest last. */
const CARDS_MAX = 400;

export type FeedSpot = {
  cards: FeedCard[];
  nextOffset: number | null;
  index: number;
  savedAt: number;
};

type SavedSpot = { ids: string[]; nextOffset: number | null; index: number; savedAt: number };

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

function readCards(store: Store | null): Record<string, FeedCard> {
  const saved = read<Record<string, FeedCard>>(store, CARDS_KEY);
  return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
}

/** Saves cards once, by id, for every tab's spot. Call it when cards load, not on every swipe. */
export function saveCards(store: Store | null, cards: readonly FeedCard[]): void {
  if (!store || cards.length === 0) return;
  const pool = readCards(store);
  for (const card of cards) {
    delete pool[card.id];
    pool[card.id] = card;
  }
  const ids = Object.keys(pool);
  const keep = ids.length > CARDS_MAX ? Object.fromEntries(ids.slice(-CARDS_MAX).map((id) => [id, pool[id]])) : pool;
  write(store, CARDS_KEY, keep);
}

/** Saves where the reader is: card ids only. Keeps a window of ids around the one on screen. */
export function saveSpot(
  store: Store | null,
  filters: FeedFilters,
  spot: { ids: readonly string[]; nextOffset: number | null; index: number },
  now = Date.now(),
): void {
  let ids = [...spot.ids];
  let index = spot.index;
  if (ids.length > SPOT_MAX_CARDS) {
    const start = Math.max(0, Math.min(index - 20, ids.length - SPOT_MAX_CARDS));
    ids = ids.slice(start, start + SPOT_MAX_CARDS);
    index -= start;
  }
  const saved: SavedSpot = { ids, nextOffset: spot.nextOffset, index, savedAt: now };
  write(store, SPOT_PREFIX + feedKey(filters), saved);
}

/** The saved spot for this tab and sport, or null when there is none, it went stale or its cards are gone. */
export function loadSpot(store: Store | null, filters: FeedFilters, now = Date.now()): FeedSpot | null {
  const spot = read<SavedSpot>(store, SPOT_PREFIX + feedKey(filters));
  if (!spot || !Array.isArray(spot.ids) || spot.ids.length === 0) return null;
  if (!(now - spot.savedAt < SPOT_MAX_AGE_MS)) return null;
  const pool = readCards(store);
  const at = Math.min(Math.max(0, Math.floor(Number(spot.index) || 0)), spot.ids.length - 1);
  const cards: FeedCard[] = [];
  let index = 0;
  spot.ids.forEach((id, position) => {
    const card = pool[id];
    if (!card) return;
    // The card that was on screen, or the nearest kept one before it.
    if (position <= at) index = cards.length;
    cards.push(card);
  });
  if (cards.length === 0) return null;
  return { cards, nextOffset: spot.nextOffset ?? null, index, savedAt: spot.savedAt };
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

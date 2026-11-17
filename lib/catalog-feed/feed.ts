import { canonicalParallelName } from "@/lib/cards/parallels";
import { userHref } from "@/lib/social/user-href";
import {
  catalogPriceLabel,
  catalogTileFromRow,
  parseCatalogSport,
  type CatalogSport,
} from "@/lib/public-catalog/query";

/**
 * The Slabhold Catalog feed: one public card per screen, TikTok style.
 * Pure helpers only, shared by the server read, the API and the screen.
 */

export const FEED_API = "/api/catalog/feed";
/** Cards per read. Small, so the first screen is fast and swipes stay ahead. */
export const FEED_PAGE_SIZE = 12;
/** Start the next read when this many cards are left. */
export const FEED_LOAD_AHEAD = 4;
/** Photos warmed ahead of the card on screen. */
export const FEED_PREFETCH = 3;
/** Slides that draw their photo around the one on screen; the rest hold their height. */
export const FEED_RENDER_BEHIND = 2;
export const FEED_RENDER_AHEAD = 3;
/** Two taps this close are a double tap (heart). One tap waits this long before opening. */
export const DOUBLE_TAP_MS = 280;

export const FEED_TABS = [
  { id: "for-you", label: "For You" },
  { id: "following", label: "Following" },
] as const;
export type FeedTab = (typeof FEED_TABS)[number]["id"];

/** One public card on its own screen. Public fields only, never price paid. */
export type FeedCard = {
  id: string;
  href: string;
  player: string;
  yearLabel: string;
  setName: string;
  cardNumber: string;
  parallel: string;
  serialRun: number | null;
  isRookie: boolean;
  isAuto: boolean;
  isRelic: boolean;
  conditionType: "raw" | "graded" | null;
  /** "PSA 10" on a slab, "" on a raw card. */
  grade: string;
  grader: string;
  /** The grade as stored ("10"), for matching a want. */
  gradeValue: string;
  imageUrl: string | null;
  accent: string;
  sport: string;
  /** "" when we have no value. The chip then doesn't show. */
  priceLabel: string;
  createdAt: string;
  owner: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  /** Hearts on this card (card_likes). */
  likeCount: number;
  /** Comments on this card (card_comments). */
  commentCount: number;
  /** Why it is in the mix. Never shown, it only spreads the order. */
  source: "fresh" | "popular" | "following";
};

export type FeedPage = {
  cards: FeedCard[];
  /** Offset for the next read, or null at the end. */
  nextOffset: number | null;
};

type SearchValue = string | string[] | undefined | null;

function first(value: SearchValue): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function parseFeedTab(value: SearchValue): FeedTab {
  return first(value).trim().toLowerCase() === "following" ? "following" : "for-you";
}

export type FeedFilters = { tab: FeedTab; sport: CatalogSport | null };

export function parseFeedFilters(params: { tab?: SearchValue; sport?: SearchValue }): FeedFilters {
  return { tab: parseFeedTab(params.tab), sport: parseCatalogSport(params.sport) };
}

/** "?tab=following&sport=football", leaving out defaults. */
export function feedSearch(filters: FeedFilters, offset = 0): string {
  const params = new URLSearchParams();
  if (filters.tab !== "for-you") params.set("tab", filters.tab);
  if (filters.sport) params.set("sport", filters.sport);
  if (offset > 0) params.set("offset", String(offset));
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** One key per tab and sport, for the saved spot. */
export function feedKey(filters: FeedFilters): string {
  return `${filters.tab}:${filters.sport ?? "all"}`;
}

type Row = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function count(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** A positive print run, or null. */
export function serialRunOf(value: unknown): number | null {
  const n = count(value);
  return n > 0 && n < 100000 ? n : null;
}

/** A public_cards row and its owner as a feed card. Null when it can't link. */
export function feedCardFromRow(
  row: Row,
  owner: FeedCard["owner"] | null | undefined,
  extra: { likeCount?: number; commentCount?: number; source?: FeedCard["source"] } = {},
): FeedCard | null {
  if (!owner?.username || !owner.id) return null;
  const tile = catalogTileFromRow(row, owner.username);
  if (!tile) return null;
  const setName = tile.setName;
  return {
    id: tile.id,
    href: `${userHref(owner.username)}/cards/${encodeURIComponent(tile.id)}`,
    player: tile.player,
    yearLabel: tile.yearLabel,
    setName,
    cardNumber: row.no_number === true ? "" : text(row.card_number).replace(/^#/, ""),
    parallel: canonicalParallelName(setName, text(row.parallel)),
    serialRun: serialRunOf(row.serial_run),
    isRookie: tile.isRookie,
    isAuto: row.is_auto === true,
    isRelic: row.is_relic === true,
    conditionType: tile.conditionType,
    grade: tile.grade,
    grader: tile.grader,
    gradeValue: text(row.grade),
    imageUrl: tile.imageUrl,
    accent: tile.accent,
    sport: tile.sport,
    priceLabel: catalogPriceLabel(row.estimated_value),
    createdAt: text(row.created_at),
    owner,
    likeCount: count(extra.likeCount),
    commentCount: count(extra.commentCount),
    source: extra.source ?? "fresh",
  };
}

/** The fields that make a want for this card, the same key the card page saves. */
export function feedIdentity(card: FeedCard) {
  return {
    playerName: card.player,
    yearLabel: card.yearLabel,
    setBrand: card.setName,
    cardNumber: card.cardNumber,
    parallel: card.parallel,
    conditionType: card.conditionType,
    grade: card.gradeValue,
    grader: card.grader,
  };
}

/** "2023-24 Prizm #136". */
export function feedSetLine(card: Pick<FeedCard, "yearLabel" | "setName" | "cardNumber">): string {
  return [card.yearLabel, card.setName, card.cardNumber ? `#${card.cardNumber}` : ""].filter(Boolean).join(" ");
}

export type FeedPill = { label: string; tone: "brand" | "plain" };

/** Small tags under the name: RC, Auto, Relic, the grade, /25, the parallel. */
export function feedPills(card: FeedCard): FeedPill[] {
  const pills: FeedPill[] = [];
  if (card.isRookie) pills.push({ label: "RC", tone: "brand" });
  if (card.conditionType === "graded" && card.grade) pills.push({ label: card.grade, tone: "brand" });
  if (card.serialRun) pills.push({ label: `/${card.serialRun}`, tone: "plain" });
  if (card.isAuto) pills.push({ label: "Auto", tone: "plain" });
  if (card.isRelic) pills.push({ label: "Relic", tone: "plain" });
  if (card.parallel && !/^base$/i.test(card.parallel)) pills.push({ label: card.parallel, tone: "plain" });
  return pills;
}

/** What a screen reader hears for the card: "Victor Wembanyama, 2023-24 Prizm #136, RC, PSA 10, by @ada". */
export function feedCardLabel(card: FeedCard): string {
  return [card.player, feedSetLine(card), ...feedPills(card).map((pill) => pill.label), `by @${card.owner.username}`]
    .filter(Boolean)
    .join(", ");
}

/** "1.2K", "34", "" for zero. */
export function feedCount(n: number): string {
  if (!(n > 0)) return "";
  if (n < 1000) return String(Math.floor(n));
  if (n < 10000) return `${(Math.floor(n / 100) / 10).toString()}K`;
  if (n < 1000000) return `${Math.floor(n / 1000)}K`;
  return `${(Math.floor(n / 100000) / 10).toString()}M`;
}

/** What the viewer has shown they like: sports and players they own or hearted, and who they follow. */
export type FeedTaste = {
  sports: ReadonlyMap<string, number>;
  players: ReadonlySet<string>;
  following: ReadonlySet<string>;
  /** The viewer's own id: their own cards sit lower in For You. */
  viewerId: string | null;
};

export const EMPTY_TASTE: FeedTaste = {
  sports: new Map(),
  players: new Set(),
  following: new Set(),
  viewerId: null,
};

export function playerKey(name: string): string {
  return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Sports and players weighted from the cards the viewer owns and hearted. */
export function tasteFrom(input: {
  owned: readonly { sport?: string | null; playerName?: string | null }[];
  liked: readonly { sport?: string | null; player?: string | null }[];
  following: Iterable<string>;
  viewerId: string | null;
}): FeedTaste {
  const sports = new Map<string, number>();
  const players = new Set<string>();
  const add = (sport: string | null | undefined, player: string | null | undefined, weight: number) => {
    const key = (sport ?? "").trim().toLowerCase();
    if (key) sports.set(key, (sports.get(key) ?? 0) + weight);
    const name = playerKey(player ?? "");
    if (name) players.add(name);
  };
  for (const card of input.owned) add(card.sport, card.playerName, 1);
  for (const card of input.liked) add(card.sport, card.player, 2);
  return { sports, players, following: new Set(input.following), viewerId: input.viewerId };
}

/** How well a card fits the viewer. Higher first. Never random, so tests and Back are stable. */
export function tasteScore(card: FeedCard, taste: FeedTaste): number {
  let score = 0;
  if (taste.following.has(card.owner.id)) score += 3;
  if (taste.players.has(playerKey(card.player))) score += 3;
  const total = [...taste.sports.values()].reduce((sum, n) => sum + n, 0);
  if (total > 0) score += 2 * ((taste.sports.get(card.sport) ?? 0) / total);
  if (card.source === "popular") score += 1;
  if (card.likeCount > 0) score += Math.min(1, Math.log10(1 + card.likeCount) / 2);
  if (taste.viewerId && card.owner.id === taste.viewerId) score -= 4;
  return score;
}

/**
 * For You order for one page. Lanes take turns so the screen mixes fresh
 * posts, popular cards, followed accounts and the viewer's sports and
 * players. Inside a lane, the better fit goes first. A card already seen
 * this session never comes back, and one owner never fills two screens in a row
 * when another card can go between.
 */
export function mixFeed(cards: readonly FeedCard[], taste: FeedTaste, seen: ReadonlySet<string>): FeedCard[] {
  const unique = new Map<string, FeedCard>();
  for (const card of cards) {
    if (seen.has(card.id) || unique.has(card.id)) continue;
    unique.set(card.id, card);
  }
  const pool = [...unique.values()];
  const rank = (list: FeedCard[]) =>
    list
      .map((card, index) => ({ card, index, score: tasteScore(card, taste) }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((entry) => entry.card);
  const fits = (card: FeedCard) =>
    taste.players.has(playerKey(card.player)) || (taste.sports.get(card.sport) ?? 0) > 0;
  const lanes: FeedCard[][] = [
    rank(pool.filter((card) => taste.following.has(card.owner.id))),
    rank(pool.filter((card) => fits(card))),
    rank(pool.filter((card) => card.source === "popular")),
    // Fresh keeps newest first.
    pool.filter((card) => card.source === "fresh"),
  ];
  const ordered: FeedCard[] = [];
  const placed = new Set<string>();
  let progress = true;
  while (progress) {
    progress = false;
    for (const lane of lanes) {
      while (lane.length > 0 && placed.has(lane[0].id)) lane.shift();
      const next = lane.shift();
      if (!next) continue;
      placed.add(next.id);
      ordered.push(next);
      progress = true;
    }
  }
  for (const card of pool) if (!placed.has(card.id)) ordered.push(card);
  return spreadOwners(ordered);
}

/** Moves a card down one when its owner also has the screen before it, if something else can go between. */
export function spreadOwners(cards: readonly FeedCard[]): FeedCard[] {
  const out = [...cards];
  for (let index = 1; index < out.length; index += 1) {
    if (out[index].owner.id !== out[index - 1].owner.id) continue;
    const swap = out.findIndex((card, at) => at > index && card.owner.id !== out[index - 1].owner.id);
    if (swap < 0) break;
    const [moved] = out.splice(swap, 1);
    out.splice(index, 0, moved);
  }
  return out;
}

/** Adds cards to the feed, skipping any already in it or seen this session. */
export function appendFeed(current: readonly FeedCard[], next: readonly FeedCard[], seen: ReadonlySet<string> = new Set()): FeedCard[] {
  const have = new Set(current.map((card) => card.id));
  const out = [...current];
  for (const card of next) {
    if (have.has(card.id) || seen.has(card.id)) continue;
    have.add(card.id);
    out.push(card);
  }
  return out;
}

/** The heart: a tap toggles it, and the count moves by one, never below zero. */
export function heartTap(state: { liked: boolean; count: number }): { liked: boolean; count: number } {
  return state.liked
    ? { liked: false, count: Math.max(0, state.count - 1) }
    : { liked: true, count: state.count + 1 };
}

/** A double tap only ever likes. It never unlikes a card already hearted. */
export function doubleTapHeart(state: { liked: boolean; count: number }): { liked: boolean; count: number } {
  return state.liked ? state : heartTap(state);
}

/** The slides that draw their photo for the one on screen. */
export function feedWindow(index: number, length: number): { start: number; end: number } {
  return {
    start: Math.max(0, index - FEED_RENDER_BEHIND),
    end: Math.min(length - 1, index + FEED_RENDER_AHEAD),
  };
}

/** Photos to warm after the card on screen. */
export function prefetchUrls(cards: readonly FeedCard[], index: number): string[] {
  return cards
    .slice(index + 1, index + 1 + FEED_PREFETCH)
    .map((card) => card.imageUrl)
    .filter((url): url is string => Boolean(url));
}

/** The glow behind the photo: the card's own color, pulled toward brand purple. */
export function feedGlow(accent: string): string {
  const color = /^#[0-9a-f]{3,8}$/i.test(accent) ? accent : "#7C3AED";
  return `color-mix(in oklab, ${color} 45%, #7C3AED)`;
}

/** What the For You and Following empty screens say. */
export function feedEmptyText(filters: FeedFilters, signedIn: boolean): { title: string; body: string } {
  const sport = filters.sport ? `${filters.sport[0].toUpperCase()}${filters.sport.slice(1)}` : "";
  if (filters.tab === "following") {
    if (!signedIn) return { title: "See who you follow", body: "Log in and follow collectors to fill this tab with their cards." };
    return {
      title: sport ? `No ${sport.toLowerCase()} cards from people you follow` : "Nothing from people you follow yet",
      body: "Follow a few collectors from For You and their public cards land here.",
    };
  }
  return {
    title: sport ? `No public ${sport.toLowerCase()} cards yet` : "No public cards yet",
    body: "Make a card public from your collection and it shows here for everyone.",
  };
}

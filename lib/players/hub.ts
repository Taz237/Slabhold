import { money } from "@/lib/format";
import { isTestAccount } from "@/lib/test-accounts";
import { centsToDollars } from "@/lib/comps/stats";
import { userHref } from "@/lib/social/user-href";
import {
  playerNameKey,
  sportSlug,
  type PlayerRef,
} from "./slug";
import { normInterest } from "@/lib/social/follow-rank";

export const RECENT_SOLD_PRICES_LABEL = "Recent sold prices";
export const PLAYER_POSTS_HEADING = "Posts";
export const PLAYER_CARDS_HEADING = "Cards on Slabhold";
export const PLAYER_OFFERS_HEADING = "Open to offers";
export const PLAYER_POSTS_EMPTY = "No public posts about this player yet.";
export const PLAYER_CARDS_EMPTY = "No public cards of this player on Slabhold yet.";
export const PLAYER_SALES_EMPTY = "No recent sold prices yet.";
export const PLAYER_OFFERS_EMPTY = "No public cards are open to offers.";

export const PLAYER_CARD_LIMIT = 12;
export const PLAYER_POST_LIMIT = 8;
export const PLAYER_SALE_LIMIT = 8;
export const PLAYER_OWNER_LIMIT = 12;

export type HubProfileInput = {
  id: string;
  username: string;
  displayName: string;
  isTest?: boolean;
};

export type HubCardInput = {
  id: string;
  playerName: string;
  sport: string;
  yearLabel: string;
  setName: string;
  grade: string;
  parallel: string;
  imageUrl: string | null;
  accent: string;
  ownerId: string;
  createdAt: string;
  /** Null when the column is not on the row. */
  openToOffers: boolean | null;
  isPublic: boolean;
};

export type HubMentionCard = {
  playerName: string;
  sport: string;
};

export type HubPostInput = {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
  attached: HubMentionCard | null;
  metaCards: readonly HubMentionCard[];
};

export type HubSaleInput = {
  priceCents: number;
  soldAt: string;
  grade: string;
};

export type HubCard = {
  id: string;
  href: string;
  detail: string;
  imageUrl: string | null;
  accent: string;
  playerName: string;
  ownerName: string;
  ownerHref: string;
};

export type HubPost = {
  id: string;
  href: string;
  body: string;
  createdAt: string;
  authorName: string;
  authorHref: string;
};

export type HubOwner = {
  id: string;
  href: string;
  displayName: string;
  username: string;
};

export type HubSale = {
  key: string;
  priceLabel: string;
  grade: string;
  soldLabel: string;
  soldAt: string;
};

export function hiddenCollector(profile: { username: string; isTest?: boolean }): boolean {
  if (profile.isTest) return true;
  return isTestAccount(profile.username);
}

function profileMap(profiles: readonly HubProfileInput[]): Map<string, HubProfileInput> {
  return new Map(profiles.map((profile) => [profile.id, profile]));
}

function visibleProfile(
  profiles: Map<string, HubProfileInput>,
  userId: string,
): HubProfileInput | null {
  const profile = profiles.get(userId);
  if (!profile) return null;
  const username = profile.username.trim().replace(/^@/, "");
  if (!username || hiddenCollector({ username, isTest: profile.isTest })) return null;
  return { ...profile, username };
}

function sportMatches(cardSport: string, playerSport: string): boolean {
  if (!cardSport.trim()) return true;
  return sportSlug(cardSport) === sportSlug(playerSport);
}

function nameMatches(cardName: string, playerName: string): boolean {
  const key = playerNameKey(playerName);
  return Boolean(key) && playerNameKey(cardName) === key;
}

function containsSequence(haystack: readonly string[], needle: readonly string[]): boolean {
  if (!needle.length || haystack.length < needle.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    let found = true;
    for (let index = 0; index < needle.length; index += 1) {
      if (haystack[start + index] !== needle[index]) {
        found = false;
        break;
      }
    }
    if (found) return true;
  }
  return false;
}

/** Body text names this player, dotted or joined. A last name alone does not. */
export function textMentionsPlayer(text: string, name: string): boolean {
  const key = playerNameKey(name);
  if (!key || !text.trim()) return false;
  const words = normInterest(text).split(" ").filter(Boolean);
  const keyWords = key.split(" ");
  const rawWords = normInterest(name).split(" ").filter(Boolean);
  return containsSequence(words, keyWords) || containsSequence(words, rawWords);
}

function mentionMatches(card: HubMentionCard, player: PlayerRef): boolean {
  return nameMatches(card.playerName, player.name) && sportMatches(card.sport, player.sport);
}

export function postMentionsPlayer(post: HubPostInput, player: PlayerRef): boolean {
  if (textMentionsPlayer(post.body, player.name)) return true;
  if (post.attached && mentionMatches(post.attached, player)) return true;
  return post.metaCards.some((card) => mentionMatches(card, player));
}

function cardDetail(card: HubCardInput): string {
  const parallel = card.parallel.trim();
  const showParallel = parallel && parallel.toLowerCase() !== "base";
  return [card.yearLabel, card.setName, showParallel ? parallel : "", card.grade]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" · ");
}

/** Public cards of this player. Private rows and test accounts are dropped. */
export function selectPlayerCards(
  cards: readonly HubCardInput[],
  player: PlayerRef,
  profiles: readonly HubProfileInput[],
  limit = PLAYER_CARD_LIMIT,
): HubCard[] {
  const people = profileMap(profiles);
  const seen = new Set<string>();
  const ranked = cards
    .filter((card) => {
      if (!card.isPublic || !card.id || seen.has(card.id)) return false;
      seen.add(card.id);
      return nameMatches(card.playerName, player.name) && sportMatches(card.sport, player.sport);
    })
    .map((card) => ({ card, owner: visibleProfile(people, card.ownerId) }))
    .filter((row): row is { card: HubCardInput; owner: HubProfileInput } => row.owner != null)
    .sort((a, b) => {
      if (a.card.createdAt === b.card.createdAt) return a.card.id.localeCompare(b.card.id);
      return a.card.createdAt < b.card.createdAt ? 1 : -1;
    });
  return ranked.slice(0, Math.max(0, limit)).map(({ card, owner }) => ({
    id: card.id,
    href: `${userHref(owner.username)}/cards/${encodeURIComponent(card.id)}`,
    detail: cardDetail(card),
    imageUrl: card.imageUrl,
    accent: card.accent || "#7c5cff",
    playerName: card.playerName.trim() || player.name,
    ownerName: owner.displayName.trim() || owner.username,
    ownerHref: userHref(owner.username),
  }));
}

export function selectPlayerPosts(
  posts: readonly HubPostInput[],
  player: PlayerRef,
  profiles: readonly HubProfileInput[],
  limit = PLAYER_POST_LIMIT,
): HubPost[] {
  const people = profileMap(profiles);
  const seen = new Set<string>();
  const ranked = posts
    .filter((post) => {
      if (!post.id || seen.has(post.id)) return false;
      seen.add(post.id);
      return postMentionsPlayer(post, player);
    })
    .map((post) => ({ post, author: visibleProfile(people, post.authorId) }))
    .filter((row): row is { post: HubPostInput; author: HubProfileInput } => row.author != null)
    .sort((a, b) => {
      if (a.post.createdAt === b.post.createdAt) return a.post.id.localeCompare(b.post.id);
      return a.post.createdAt < b.post.createdAt ? 1 : -1;
    });
  return ranked.slice(0, Math.max(0, limit)).map(({ post, author }) => ({
    id: post.id,
    href: `/posts/${post.id}`,
    body: post.body.trim() || "Posted a card",
    createdAt: post.createdAt,
    authorName: author.displayName.trim() || author.username,
    authorHref: userHref(author.username),
  }));
}

/**
 * Owners of this player's public cards that are open to offers.
 * Null when no row carried the flag, so the section stays hidden.
 */
export function selectOfferOwners(
  cards: readonly HubCardInput[],
  player: PlayerRef,
  profiles: readonly HubProfileInput[],
  limit = PLAYER_OWNER_LIMIT,
): HubOwner[] | null {
  const matching = cards.filter(
    (card) => card.isPublic && nameMatches(card.playerName, player.name) && sportMatches(card.sport, player.sport),
  );
  if (!matching.some((card) => card.openToOffers !== null)) return null;
  const people = profileMap(profiles);
  const seen = new Set<string>();
  const owners: HubOwner[] = [];
  for (const card of matching) {
    if (card.openToOffers !== true || seen.has(card.ownerId)) continue;
    const owner = visibleProfile(people, card.ownerId);
    if (!owner) continue;
    seen.add(card.ownerId);
    owners.push({
      id: owner.id,
      href: userHref(owner.username),
      displayName: owner.displayName.trim() || owner.username,
      username: owner.username,
    });
  }
  owners.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.username.localeCompare(b.username));
  return owners.slice(0, Math.max(0, limit));
}

export function formatSoldOn(soldAt: string): string {
  const day = soldAt.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Newest stored sales. The same price, day, and grade is kept once. */
export function dedupeSoldPrices(
  sales: readonly HubSaleInput[],
  limit = PLAYER_SALE_LIMIT,
): HubSale[] {
  const seen = new Set<string>();
  const ranked = sales
    .filter((sale) => Number.isInteger(sale.priceCents) && sale.priceCents > 0)
    .map((sale) => ({
      ...sale,
      soldAt: sale.soldAt.slice(0, 10),
      grade: sale.grade.trim() || "Raw",
    }))
    .filter((sale) => /^\d{4}-\d{2}-\d{2}$/.test(sale.soldAt))
    .sort((a, b) => {
      if (a.soldAt === b.soldAt) return b.priceCents - a.priceCents;
      return a.soldAt < b.soldAt ? 1 : -1;
    });
  const unique: HubSale[] = [];
  for (const sale of ranked) {
    const key = `${sale.soldAt}|${sale.priceCents}|${sale.grade.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({
      key,
      priceLabel: money(centsToDollars(sale.priceCents)),
      grade: sale.grade,
      soldLabel: formatSoldOn(sale.soldAt),
      soldAt: sale.soldAt,
    });
    if (unique.length >= Math.max(0, limit)) break;
  }
  return unique;
}

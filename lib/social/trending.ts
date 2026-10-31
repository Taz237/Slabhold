import { isTestAccount } from "@/lib/test-accounts";

/** How far back a like, reply, quote, or repost still counts. */
export const TRENDING_WINDOW_MS = 24 * 60 * 60 * 1000;

/** A like from this long ago is worth half of one that just happened. */
export const TRENDING_HALF_LIFE_MS = 6 * 60 * 60 * 1000;

/**
 * Hide the strip unless at least this many posts each have
 * TRENDING_MIN_ENGAGEMENTS in the window. An empty rail looks broken.
 */
export const TRENDING_MIN_POSTS = 3;

/**
 * Distinct people in the window. The author's own events, test accounts,
 * and likes that do not notify the author do not count. Decay changes rank, not this bar.
 */
export const TRENDING_MIN_ENGAGEMENTS = 2;

/** Cards shown in the strip after the viewer filter. */
export const TRENDING_LIMIT = 8;

/**
 * Extra ranked posts kept so blocking one author does not
 * drop the strip under the minimum when others are close behind.
 */
export const TRENDING_POOL = 12;

/** Posts loaded after the capped engagement read. Keeps the follow-up query small. */
export const TRENDING_POST_LIMIT = 40;

/** Each engagement read stops here so a cached refresh cannot scan without a bound. */
export const TRENDING_ENGAGEMENT_LIMIT = 1000;

/** Shared ranking cache. About five minutes. */
export const TRENDING_CACHE_SECONDS = 5 * 60;

/** Client reuse of the last successful read. Same window as the shared cache. */
export const TRENDING_SESSION_MS = TRENDING_CACHE_SECONDS * 1000;

export const TRENDING_HEADING = "Trending now";

/**
 * Each event counts as one. Time decay, not a heavier reply, decides rank.
 * A fresh event scores 1. At one half-life it scores 1/2.
 */
export const TRENDING_WEIGHT = {
  like: 1,
  reply: 1,
  quote: 1,
  repost: 1,
} as const;

export type EngagementKind = keyof typeof TRENDING_WEIGHT;

export type TrendingEngagement = {
  postId: string;
  kind: EngagementKind;
  at: string;
  /** notifications.actor_id, comments.user_id, quoting posts.user_id, or reposts.user_id. */
  actorId: string;
  /** notifications.recipient_id. A like counts only when this is the post author. */
  recipientId?: string | null;
};

export type TrendingAuthor = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  accent: string;
  /** profiles.is_test. */
  isTest?: boolean;
};

export type TrendingPostSource = {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
  /** Row is gone, or the caller already knows it was removed. */
  deleted?: boolean;
  /** posts.hidden_at. Hidden posts are not public. */
  hiddenAt?: string | null;
  /** An attached card is not public. */
  privateContent?: boolean;
  /** Players on public cards only. Null when there is nothing public to name. */
  player?: string | null;
  /** posts.post_type. Mail Day is retired and stays off the rail. */
  postType?: "post" | "mail_day" | null;
};

export type TrendingItem = {
  id: string;
  href: string;
  authorId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  accent: string;
  excerpt: string;
  player: string | null;
  score: number;
  engagements: number;
};

export type TrendingCardRow = {
  id: string;
  isPublic: boolean;
  player: string;
};

const EXCERPT_LENGTH = 90;

export function trendingCacheControl(): string {
  return `public, max-age=0, s-maxage=${TRENDING_CACHE_SECONDS}, stale-while-revalidate=60`;
}

export function inTrendingWindow(at: string, now: number): boolean {
  const time = Date.parse(at);
  if (!Number.isFinite(time)) return false;
  return now - time <= TRENDING_WINDOW_MS;
}

/** Weight times exponential decay. Events outside the window score 0. */
export function engagementScore(kind: EngagementKind, at: string, now: number): number {
  if (!inTrendingWindow(at, now)) return 0;
  const weight = TRENDING_WEIGHT[kind];
  if (!weight) return 0;
  const age = Math.max(0, now - Date.parse(at));
  return weight * 2 ** (-age / TRENDING_HALF_LIFE_MS);
}

export function trendingExcerpt(body: string): string {
  const text = body.replace(/\s+/g, " ").trim();
  if (text.length <= EXCERPT_LENGTH) return text;
  return `${text.slice(0, EXCERPT_LENGTH - 1).trimEnd()}…`;
}

/** Test profiles and qa_ / test_ / vreset_ handles (plus the shared qa- rule). */
export function trendingAuthorHidden(author: { username: string; isTest?: boolean }): boolean {
  if (author.isTest) return true;
  return isTestAccount(author.username);
}

function cardId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" && id ? id : null;
}

/** Card ids already on the post row or post_cards. Order is first-seen. */
export function attachedCardIds(input: {
  card?: unknown;
  meta?: unknown;
  linked?: readonly string[];
}): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (id: string | null) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };
  for (const id of input.linked ?? []) add(id);
  add(cardId(input.card));
  const meta = input.meta;
  if (meta && typeof meta === "object") {
    const cards = (meta as { cards?: unknown }).cards;
    if (Array.isArray(cards)) {
      for (const card of cards) add(cardId(card));
    }
  }
  return ids;
}

/**
 * Players named only when every attached card that still exists is public.
 * A private card drops the whole post. A deleted card is omitted, not leaked.
 */
export function trendingPostPrivacy(
  attachedIds: readonly string[],
  cards: ReadonlyMap<string, TrendingCardRow>,
): { privateContent: boolean; player: string | null } {
  if (attachedIds.length === 0) return { privateContent: false, player: null };
  const names: string[] = [];
  for (const id of attachedIds) {
    const card = cards.get(id);
    if (!card) continue;
    if (!card.isPublic) return { privateContent: true, player: null };
    const name = card.player.trim();
    if (name && !names.includes(name)) names.push(name);
  }
  const shown = names.slice(0, 2);
  return { privateContent: false, player: shown.length > 0 ? shown.join(", ") : null };
}

export function shouldShowTrending(items: readonly unknown[]): boolean {
  return items.length >= TRENDING_MIN_POSTS;
}

function bestByActor(
  events: readonly TrendingEngagement[],
  now: number,
  accept: (event: TrendingEngagement) => boolean,
): Map<string, number> {
  const best = new Map<string, number>();
  for (const event of events) {
    if (!event.postId || !event.actorId || !accept(event)) continue;
    const score = engagementScore(event.kind, event.at, now);
    const previous = best.get(event.actorId);
    if (previous === undefined || score > previous) best.set(event.actorId, score);
  }
  return best;
}

function summedScore(best: ReadonlyMap<string, number>): number {
  let score = 0;
  for (const value of best.values()) score += value;
  return score;
}

/**
 * Distinct actors before the post author is known.
 * One person commenting many times still counts as one.
 */
function previewActors(
  engagements: readonly TrendingEngagement[],
  now: number,
): Map<string, Map<string, number>> {
  const grouped = new Map<string, TrendingEngagement[]>();
  for (const event of engagements) {
    if (!event.postId || !event.actorId || !inTrendingWindow(event.at, now)) continue;
    const list = grouped.get(event.postId);
    if (list) list.push(event);
    else grouped.set(event.postId, [event]);
  }
  const actors = new Map<string, Map<string, number>>();
  for (const [postId, events] of grouped) {
    actors.set(
      postId,
      bestByActor(events, now, () => true),
    );
  }
  return actors;
}

/** Post ids worth loading. Under the distinct-actor minimum never qualifies. */
export function trendingCandidateIds(
  engagements: readonly TrendingEngagement[],
  now: number,
  limit = TRENDING_POST_LIMIT,
): string[] {
  return [...previewActors(engagements, now).entries()]
    .filter(([, actors]) => actors.size >= TRENDING_MIN_ENGAGEMENTS)
    .sort(
      (a, b) =>
        summedScore(b[1]) - summedScore(a[1]) ||
        b[1].size - a[1].size ||
        (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
    )
    .slice(0, Math.max(0, limit))
    .map(([id]) => id);
}

function hiddenPost(
  post: TrendingPostSource,
  author: TrendingAuthor | undefined,
  blocked: ReadonlySet<string>,
  muted: ReadonlySet<string>,
): boolean {
  if (post.deleted) return true;
  if (post.hiddenAt) return true;
  if (post.postType === "mail_day") return true;
  if (post.privateContent) return true;
  if (!author) return true;
  if (trendingAuthorHidden(author)) return true;
  if (blocked.has(author.id) || muted.has(author.id)) return true;
  return false;
}

/**
 * Rank public posts by decayed engagement in the window.
 * Returns [] when fewer than TRENDING_MIN_POSTS clear the bar, so the
 * strip can disappear instead of rendering a short row.
 */
export function rankTrending(input: {
  engagements: readonly TrendingEngagement[];
  posts: readonly TrendingPostSource[];
  authors: readonly TrendingAuthor[];
  now: number;
  blockedIds?: Iterable<string>;
  mutedIds?: Iterable<string>;
}): TrendingItem[] {
  const blocked = new Set(input.blockedIds ?? []);
  const muted = new Set(input.mutedIds ?? []);
  const profiles = new Map(input.authors.map((author) => [author.id, author]));
  const byPost = new Map<string, TrendingEngagement[]>();
  for (const event of input.engagements) {
    const list = byPost.get(event.postId);
    if (list) list.push(event);
    else byPost.set(event.postId, [event]);
  }
  const ranked: Array<{ item: TrendingItem; createdAt: string }> = [];

  for (const post of input.posts) {
    const author = profiles.get(post.authorId);
    if (hiddenPost(post, author, blocked, muted) || !author) continue;
    const actors = bestByActor(byPost.get(post.id) ?? [], input.now, (event) => {
      if (event.actorId === post.authorId) return false;
      if (event.kind === "like" && event.recipientId !== post.authorId) return false;
      const profile = profiles.get(event.actorId);
      if (!profile || trendingAuthorHidden(profile)) return false;
      return inTrendingWindow(event.at, input.now);
    });
    if (actors.size < TRENDING_MIN_ENGAGEMENTS) continue;
    const player = post.player?.trim() ? post.player.trim() : null;
    ranked.push({
      createdAt: post.createdAt,
      item: {
        id: post.id,
        href: `/posts/${post.id}`,
        authorId: author.id,
        username: author.username,
        displayName: author.displayName.trim() || author.username,
        avatarUrl: author.avatarUrl,
        accent: author.accent || "#7c5cff",
        excerpt: trendingExcerpt(post.body),
        player,
        score: summedScore(actors),
        engagements: actors.size,
      },
    });
  }

  if (!shouldShowTrending(ranked)) return [];

  ranked.sort(
    (a, b) =>
      b.item.score - a.item.score ||
      b.item.engagements - a.item.engagements ||
      (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0) ||
      (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0),
  );

  return ranked.slice(0, TRENDING_POOL).map((row) => row.item);
}

/**
 * Drop authors this viewer blocked or muted.
 * visibleIds, when passed, keeps only posts the viewer's RLS select returned.
 * Null skips that check (signed-out viewers). The 3-post minimum is applied again.
 */
export function filterTrendingForViewer(
  items: readonly TrendingItem[],
  input: {
    blockedIds?: Iterable<string>;
    mutedIds?: Iterable<string>;
    visibleIds?: ReadonlySet<string> | null;
  } = {},
): TrendingItem[] {
  const hidden = new Set([...(input.blockedIds ?? []), ...(input.mutedIds ?? [])]);
  let visible = hidden.size === 0 ? [...items] : items.filter((item) => !hidden.has(item.authorId));
  if (input.visibleIds != null) {
    const allowed = input.visibleIds;
    visible = visible.filter((item) => allowed.has(item.id));
  }
  if (!shouldShowTrending(visible)) return [];
  return visible.slice(0, TRENDING_LIMIT);
}

type PostIdClient = {
  from(table: string): {
    select(columns: string): {
      in(
        column: string,
        values: readonly string[],
      ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
    };
  };
};

/** Post ids this viewer can still read. RLS hides a post when its author blocked them. */
export async function loadViewerPostIds(supabase: PostIdClient, ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("posts").select("id").in("id", ids);
  if (error) throw new Error(error.message ?? "Could not read posts");
  if (!Array.isArray(data)) return [];
  const allowed = new Set(ids);
  const visible: string[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const id = (row as { id?: unknown }).id;
    if (typeof id === "string" && allowed.has(id)) visible.push(id);
  }
  return visible;
}

type SessionEntry<T> = { at: number; value: T };

let publicSession: SessionEntry<TrendingItem[]> | null = null;
const visibleSessions = new Map<string, SessionEntry<string[]>>();

function freshEntry<T>(entry: SessionEntry<T> | null | undefined, now: number): T | null {
  if (!entry) return null;
  if (now - entry.at > TRENDING_SESSION_MS) return null;
  return entry.value;
}

/** Last successful public ranking for this tab. A failed fetch is not stored. */
export function rememberTrendingPublic(items: readonly TrendingItem[], now = Date.now()) {
  publicSession = { at: now, value: [...items] };
}

export function trendingPublicSession(now = Date.now()): TrendingItem[] | null {
  const value = freshEntry(publicSession, now);
  if (!value) publicSession = null;
  return value;
}

export function rememberTrendingVisible(viewerId: string, ids: readonly string[], now = Date.now()) {
  visibleSessions.set(viewerId, { at: now, value: [...ids] });
}

export function trendingVisibleSession(viewerId: string, now = Date.now()): string[] | null {
  const value = freshEntry(visibleSessions.get(viewerId), now);
  if (!value) visibleSessions.delete(viewerId);
  return value;
}

export function clearTrendingSession() {
  publicSession = null;
  visibleSessions.clear();
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Ignore a payload that is not the cached ranking shape. */
export function trendingItemsFromPayload(payload: unknown): TrendingItem[] {
  if (!payload || typeof payload !== "object") return [];
  const items = (payload as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const parsed: TrendingItem[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = text(row.id);
    const href = text(row.href);
    const authorId = text(row.authorId);
    const username = text(row.username);
    if (!id || !authorId || !username || !href || !href.startsWith("/posts/")) continue;
    const player = text(row.player)?.trim() ?? "";
    parsed.push({
      id,
      href,
      authorId,
      username,
      displayName: text(row.displayName)?.trim() || username,
      avatarUrl: text(row.avatarUrl),
      accent: text(row.accent) || "#7c5cff",
      excerpt: text(row.excerpt) ?? "",
      player: player || null,
      score: typeof row.score === "number" && Number.isFinite(row.score) ? row.score : 0,
      engagements:
        typeof row.engagements === "number" && Number.isFinite(row.engagements) ? row.engagements : 0,
    });
  }
  return parsed;
}

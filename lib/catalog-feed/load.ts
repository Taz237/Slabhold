import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { cleanImageUrl } from "@/lib/social/link-preview";
import { hiddenMovingOwner } from "@/lib/moving-today/present";
import { getCardLikes } from "@/lib/public-catalog/load";
import { isTcgRow } from "@/lib/public-catalog/query";
import { FEED_PAGE_SIZE, feedCardFromRow, type FeedCard, type FeedFilters, type FeedPage } from "./feed";

/** public_cards columns only. Never price paid, never a private row. */
export const FEED_COLUMNS =
  "id, user_id, player, year, year_label, set, set_name, card_number, no_number, parallel, serial_run, grade, grader, condition_type, is_rookie, is_auto, is_relic, image_url, accent, sport, category, estimated_value, created_at";

/** Popular cards mixed into each For You page. */
export const FEED_POPULAR_PER_PAGE = 4;
/** Following reads the newest this many follows. */
export const FEED_FOLLOW_LIMIT = 200;
/** Comments counted per page. A page has at most 12 posts. */
const COMMENT_COUNT_LIMIT = 2000;
const IN_CHUNK = 80;

type Row = Record<string, unknown>;
type Admin = NonNullable<ReturnType<typeof createSupabaseAdmin>>;
type Result = { data: unknown[] | null; error: { message: string } | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = any;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function rowsOf(result: Result): Row[] {
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as Row[];
}

function withSport(query: Query, filters: FeedFilters): Query {
  return filters.sport ? query.ilike("sport", filters.sport) : query;
}

async function readIn(admin: Admin, table: string, columns: string, column: string, ids: string[], shape?: (q: Query) => Query) {
  if (ids.length === 0) return [];
  const results = (await Promise.all(
    chunks([...new Set(ids)], IN_CHUNK).map((group) => {
      const query = admin.from(table).select(columns).in(column, group);
      return shape ? shape(query) : query;
    }),
  )) as Result[];
  return results.flatMap(rowsOf);
}

/** Owners by id. Test and review accounts never show. */
async function readOwners(admin: Admin, ids: string[]): Promise<Map<string, FeedCard["owner"]>> {
  const owners = new Map<string, FeedCard["owner"]>();
  let rows: Row[];
  try {
    rows = await readIn(admin, "profiles", "id, username, display_name, avatar_url, is_test", "id", ids);
  } catch (error) {
    // An older database without profiles.is_test.
    if (!/is_test/i.test(error instanceof Error ? error.message : "")) throw error;
    rows = await readIn(admin, "profiles", "id, username, display_name, avatar_url", "id", ids);
  }
  for (const row of rows) {
    const id = text(row.id);
    const username = text(row.username);
    if (!id || !username) continue;
    if (hiddenMovingOwner({ username, isTest: row.is_test === true })) continue;
    owners.set(id, {
      id,
      username,
      displayName: text(row.display_name) || username,
      avatarUrl: cleanImageUrl(text(row.avatar_url) || null),
    });
  }
  return owners;
}

export type CardEngagement = { likeCount: number; commentCount: number; postId: string | null };

/**
 * Likes and comments for cards, from the posts that show them. A card's
 * likes add up across its posts; its comments and heart use its newest post.
 */
export async function readCardEngagement(admin: Admin, cardIds: string[]): Promise<Map<string, CardEngagement>> {
  const out = new Map<string, CardEngagement>();
  if (cardIds.length === 0) return out;
  const visible = (query: Query) => query.is("hidden_at", null);
  const [direct, links] = await Promise.all([
    readIn(admin, "posts", "id, like_count, created_at, card_id:card->>id", "card->>id", cardIds, visible),
    readIn(admin, "post_cards", "post_id, card_id", "card_id", cardIds),
  ]);
  const posts = new Map<string, { likes: number; createdAt: string }>();
  const postsByCard = new Map<string, Set<string>>();
  const link = (cardId: string, postId: string) => {
    const set = postsByCard.get(cardId) ?? new Set<string>();
    set.add(postId);
    postsByCard.set(cardId, set);
  };
  const remember = (row: Row) => {
    const id = text(row.id);
    if (!id) return;
    const likes = Number(row.like_count);
    posts.set(id, { likes: Number.isFinite(likes) && likes > 0 ? likes : 0, createdAt: text(row.created_at) });
  };
  for (const row of direct) {
    remember(row);
    if (text(row.card_id)) link(text(row.card_id), text(row.id));
  }
  const linkedIds = links.map((row) => text(row.post_id)).filter((postId) => postId && !posts.has(postId));
  for (const row of await readIn(admin, "posts", "id, like_count, created_at", "id", linkedIds, visible)) remember(row);
  for (const row of links) {
    if (posts.has(text(row.post_id))) link(text(row.card_id), text(row.post_id));
  }

  const primary = new Map<string, string>();
  for (const [cardId, ids] of postsByCard) {
    const known = [...ids].filter((postId) => posts.has(postId));
    if (known.length === 0) continue;
    known.sort((a, b) => posts.get(b)!.createdAt.localeCompare(posts.get(a)!.createdAt) || b.localeCompare(a));
    primary.set(cardId, known[0]);
    out.set(cardId, {
      likeCount: known.reduce((sum, postId) => sum + posts.get(postId)!.likes, 0),
      commentCount: 0,
      postId: known[0],
    });
  }
  const commentRows = await readIn(
    admin,
    "comments",
    "post_id",
    "post_id",
    [...new Set(primary.values())],
    (query) => query.limit(COMMENT_COUNT_LIMIT),
  );
  const comments = new Map<string, number>();
  for (const row of commentRows) comments.set(text(row.post_id), (comments.get(text(row.post_id)) ?? 0) + 1);
  for (const [cardId, postId] of primary) {
    const entry = out.get(cardId);
    if (entry) entry.commentCount = comments.get(postId) ?? 0;
  }
  return out;
}

async function toFeedCards(admin: Admin, rows: Row[], source: (row: Row) => FeedCard["source"]): Promise<FeedCard[]> {
  const kept = rows.filter((row) => !isTcgRow(row));
  const [owners, engagement] = await Promise.all([
    readOwners(admin, kept.map((row) => text(row.user_id)).filter(Boolean)),
    readCardEngagement(admin, kept.map((row) => text(row.id)).filter(Boolean)),
  ]);
  const cards: FeedCard[] = [];
  for (const row of kept) {
    const made = feedCardFromRow(row, owners.get(text(row.user_id)), {
      ...engagement.get(text(row.id)),
      source: source(row),
    });
    if (!made) continue;
    cards.push({ ...made, imageUrl: made.imageUrl ? cleanImageUrl(made.imageUrl) : null });
  }
  return cards;
}

/** Who the viewer follows, newest first. */
export async function readFollowing(admin: Admin, viewerId: string): Promise<string[]> {
  const rows = rowsOf(
    (await admin
      .from("follows")
      .select("following_id")
      .eq("follower_id", viewerId)
      .order("created_at", { ascending: false })
      .limit(FEED_FOLLOW_LIMIT)) as Result,
  );
  return rows.map((row) => text(row.following_id)).filter(Boolean);
}

/**
 * One page of the feed.
 * For You: the newest public cards, plus a few of the most liked. The screen
 * mixes them with what the viewer likes (see mixFeed).
 * Following: public cards from people the viewer follows, newest first.
 * Tests pass a fake `admin` and `likes`.
 */
export async function readFeedPage(
  filters: FeedFilters,
  offset: number,
  viewerId: string | null,
  admin: Admin | null = createSupabaseAdmin(),
  likes?: [string, number][],
): Promise<FeedPage> {
  if (!admin) return { cards: [], nextOffset: null };
  const end = offset + FEED_PAGE_SIZE;

  if (filters.tab === "following") {
    if (!viewerId) return { cards: [], nextOffset: null };
    const following = await readFollowing(admin, viewerId);
    if (following.length === 0) return { cards: [], nextOffset: null };
    const rows = rowsOf(
      (await withSport(admin.from("public_cards").select(FEED_COLUMNS).in("user_id", following), filters)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, end - 1)) as Result,
    );
    return {
      cards: await toFeedCards(admin, rows, () => "following"),
      nextOffset: rows.length === FEED_PAGE_SIZE ? end : null,
    };
  }

  const page = Math.floor(offset / FEED_PAGE_SIZE);
  const pairs = likes ?? (await getCardLikes().catch(() => []));
  const popularIds = pairs
    .slice(page * FEED_POPULAR_PER_PAGE, (page + 1) * FEED_POPULAR_PER_PAGE)
    .map(([id]) => id);
  const [fresh, popular] = await Promise.all([
    withSport(admin.from("public_cards").select(FEED_COLUMNS), filters)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, end - 1) as Promise<Result>,
    popularIds.length
      ? (withSport(admin.from("public_cards").select(FEED_COLUMNS).in("id", popularIds), filters) as Promise<Result>)
      : Promise.resolve({ data: [], error: null } as Result),
  ]);
  const freshRows = rowsOf(fresh);
  const popularSet = new Set(popularIds);
  const seen = new Set<string>();
  const rows = [...rowsOf(popular), ...freshRows].filter((row) => {
    const id = text(row.id);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const morePopular = pairs.length > (page + 1) * FEED_POPULAR_PER_PAGE;
  return {
    cards: await toFeedCards(admin, rows, (row) => (popularSet.has(text(row.id)) ? "popular" : "fresh")),
    nextOffset: freshRows.length === FEED_PAGE_SIZE || morePopular ? end : null,
  };
}

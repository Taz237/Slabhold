import "server-only";

import { unstable_cache } from "next/cache";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { cleanImageUrl } from "@/lib/social/link-preview";
import { hiddenMovingOwner } from "@/lib/moving-today/present";
import { isTcgRow } from "@/lib/public-catalog/query";
import { FEED_PAGE_SIZE, feedCardFromRow, type FeedCard, type FeedFilters, type FeedPage } from "./feed";

/** public_cards columns only. Never price paid, never a private row. */
export const FEED_COLUMNS =
  "id, user_id, player, year, year_label, set, set_name, card_number, no_number, parallel, serial_run, grade, grader, condition_type, is_rookie, is_auto, is_relic, image_url, accent, sport, category, estimated_value, created_at";

/** Popular cards mixed into each For You page. */
export const FEED_POPULAR_PER_PAGE = 4;
/** Following reads the newest this many follows. */
export const FEED_FOLLOW_LIMIT = 200;
const IN_CHUNK = 80;
/**
 * Rows one grouped count read takes. Under the API's row cap, so a read that
 * comes back this full may have been cut short: then exact counts take over.
 */
export const ENGAGEMENT_ROW_CAP = 1000;
/** Recent hearts read to rank the For You popular lane. */
export const HEART_RANK_ROWS = 1000;
/** Cards in the popular ranking. */
export const HEART_RANK_CARDS = 200;
/** The ranking is shared for five minutes. */
export const HEART_RANK_CACHE_SECONDS = 300;

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

export type CardEngagement = { likeCount: number; commentCount: number };

/** Exact head counts per card, run together. Only when a grouped read came back full. */
async function exactCounts(admin: Admin, table: "card_likes" | "card_comments", cardIds: string[]): Promise<Map<string, number>> {
  const counts = await Promise.all(
    cardIds.map(async (cardId) => {
      const { count, error } = (await admin
        .from(table)
        .select("card_id", { count: "exact", head: true })
        .eq("card_id", cardId)) as { count: number | null; error: { message: string } | null };
      // A failed count reads as zero; the card still shows.
      return [cardId, error || count == null ? 0 : count] as const;
    }),
  );
  return new Map(counts);
}

/**
 * Rows per card for a whole page in one read (card_id only), counted here.
 * A page is 12 to 16 cards, so this stays small. If the read comes back
 * full it may be cut short, so those cards get exact counts instead.
 */
async function countBy(
  admin: Admin,
  table: "card_likes" | "card_comments",
  cardIds: string[],
  cap: number,
): Promise<Map<string, number>> {
  const out = new Map<string, number>(cardIds.map((id) => [id, 0]));
  const result = (await admin.from(table).select("card_id").in("card_id", cardIds).limit(cap)) as Result;
  if (result.error) return out;
  const rows = (result.data ?? []) as Row[];
  if (rows.length >= cap) return exactCounts(admin, table, cardIds);
  for (const row of rows) {
    const id = text(row.card_id);
    if (out.has(id)) out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

/** Hearts and comments on cards, from card_likes and card_comments. One read per table per page. */
export async function readCardEngagement(
  admin: Admin,
  cardIds: string[],
  cap = ENGAGEMENT_ROW_CAP,
): Promise<Map<string, CardEngagement>> {
  const ids = [...new Set(cardIds)];
  const out = new Map<string, CardEngagement>();
  if (ids.length === 0) return out;
  const groups = chunks(ids, IN_CHUNK);
  const read = async (table: "card_likes" | "card_comments") =>
    new Map((await Promise.all(groups.map((group) => countBy(admin, table, group, cap)))).flatMap((map) => [...map]));
  const [likes, comments] = await Promise.all([read("card_likes"), read("card_comments")]);
  for (const id of ids) out.set(id, { likeCount: likes.get(id) ?? 0, commentCount: comments.get(id) ?? 0 });
  return out;
}

/**
 * The For You popular lane: cards ranked by their newest hearts in
 * card_likes. Catalog only. Timeline posts and their likes never count.
 */
export async function readCardHeartRanking(admin: Admin | null = createSupabaseAdmin()): Promise<[string, number][]> {
  if (!admin) return [];
  const rows = rowsOf(
    (await admin
      .from("card_likes")
      .select("card_id")
      .order("created_at", { ascending: false })
      .limit(HEART_RANK_ROWS)) as Result,
  );
  const hearts = new Map<string, number>();
  for (const row of rows) {
    const id = text(row.card_id);
    if (id) hearts.set(id, (hearts.get(id) ?? 0) + 1);
  }
  return [...hearts.entries()].sort((a, b) => b[1] - a[1]).slice(0, HEART_RANK_CARDS);
}

/** The heart ranking, shared for five minutes. */
export async function getCardHeartRanking(): Promise<[string, number][]> {
  return unstable_cache(() => readCardHeartRanking(), ["catalog-feed-card-hearts-v1"], {
    revalidate: HEART_RANK_CACHE_SECONDS,
  })();
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
 * For You: the newest public cards, plus a few of the most hearted (card_likes). The screen
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
  const pairs = likes ?? (await getCardHeartRanking().catch(() => []));
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

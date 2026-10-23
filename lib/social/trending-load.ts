import "server-only";

import { unstable_cache } from "next/cache";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/value/card-value-access";
import {
  attachedCardIds,
  rankTrending,
  trendingCandidateIds,
  trendingPostPrivacy,
  TRENDING_CACHE_SECONDS,
  TRENDING_ENGAGEMENT_LIMIT,
  TRENDING_MIN_POSTS,
  TRENDING_WINDOW_MS,
  type EngagementKind,
  type TrendingAuthor,
  type TrendingCardRow,
  type TrendingEngagement,
  type TrendingItem,
  type TrendingPostSource,
} from "./trending";

type Db = NonNullable<ReturnType<typeof createSupabaseAdmin>>;
type Row = Record<string, unknown>;
type DbError = { code?: string; message?: string } | null;

type Query = {
  eq: (column: string, value: string) => Query;
  gte: (column: string, value: string) => Query;
  in: (column: string, values: readonly string[]) => Query;
  is: (column: string, value: null) => Query;
  not: (column: string, operator: string, value: null) => Query;
  order: (column: string, options: { ascending: boolean }) => Query;
  limit: (count: number) => Query;
  then: PromiseLike<{ data: unknown; error: DbError }>["then"];
};

const IN_CHUNK = 80;

function chunks<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function missingTable(error: DbError) {
  if (!error) return false;
  return error.code === "PGRST205" || error.code === "42P01" || /schema cache/i.test(error.message ?? "");
}

function missingColumn(error: DbError, column: string) {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  return new RegExp(column, "i").test(error.message ?? "");
}

async function selectRows(
  admin: Db,
  table: string,
  columns: string,
  build: (query: Query) => Query,
): Promise<Row[]> {
  const query = admin.from(table).select(columns) as unknown as Query;
  const { data, error } = await build(query);
  if (error) {
    if (missingTable(error)) return [];
    throw new Error(error.message);
  }
  return Array.isArray(data) ? (data as Row[]) : [];
}

function asEvent(postId: unknown, at: unknown, kind: EngagementKind): TrendingEngagement | null {
  if (typeof postId !== "string" || !isUuid(postId)) return null;
  if (typeof at !== "string" || !at) return null;
  return { postId, kind, at };
}

function latest(query: Query, since: string): Query {
  return query.gte("created_at", since).order("created_at", { ascending: false }).limit(TRENDING_ENGAGEMENT_LIMIT);
}

async function readKind(
  admin: Db,
  table: string,
  columns: string,
  kind: EngagementKind,
  postColumn: string,
  since: string,
  extra?: (query: Query) => Query,
): Promise<TrendingEngagement[]> {
  const rows = await selectRows(admin, table, columns, (query) => latest(extra ? extra(query) : query, since));
  const events: TrendingEngagement[] = [];
  for (const row of rows) {
    const item = asEvent(row[postColumn], row.created_at, kind);
    if (item) events.push(item);
  }
  return events;
}

async function readAuthors(admin: Db, ids: string[]): Promise<TrendingAuthor[]> {
  const unique = [...new Set(ids)].filter((id) => isUuid(id));
  const authors: TrendingAuthor[] = [];
  for (const group of chunks(unique, IN_CHUNK)) {
    if (group.length === 0) continue;
    const withFlag = await admin
      .from("profiles")
      .select("id, username, display_name, avatar_url, accent, is_test")
      .in("id", group);
    let data = withFlag.data as Row[] | null;
    let error = withFlag.error;
    if (error && missingColumn(error, "is_test")) {
      const plain = await admin
        .from("profiles")
        .select("id, username, display_name, avatar_url, accent")
        .in("id", group);
      data = plain.data as Row[] | null;
      error = plain.error;
    }
    if (error) {
      if (missingTable(error)) continue;
      throw new Error(error.message);
    }
    for (const row of data ?? []) {
      const id = typeof row.id === "string" ? row.id : "";
      const username = typeof row.username === "string" ? row.username : "";
      if (!id || !username) continue;
      authors.push({
        id,
        username,
        displayName: typeof row.display_name === "string" ? row.display_name : username,
        avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null,
        accent: typeof row.accent === "string" && row.accent ? row.accent : "#7c5cff",
        isTest: row.is_test === true,
      });
    }
  }
  return authors;
}

type LoadedPost = {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
  card: unknown;
  meta: unknown;
};

async function readPosts(admin: Db, ids: string[]): Promise<LoadedPost[]> {
  const posts: LoadedPost[] = [];
  for (const group of chunks(ids, IN_CHUNK)) {
    if (group.length === 0) continue;
    const rows = await selectRows(
      admin,
      "posts",
      "id, user_id, content, created_at, hidden_at, card, meta",
      (query) => query.in("id", group).is("hidden_at", null),
    );
    for (const row of rows) {
      const id = typeof row.id === "string" ? row.id : "";
      const authorId = typeof row.user_id === "string" ? row.user_id : "";
      const createdAt = typeof row.created_at === "string" ? row.created_at : "";
      if (!id || !authorId || !createdAt || row.hidden_at) continue;
      posts.push({
        id,
        authorId,
        body: typeof row.content === "string" ? row.content : "",
        createdAt,
        card: row.card,
        meta: row.meta,
      });
    }
  }
  return posts;
}

async function readLinks(admin: Db, postIds: string[]): Promise<Map<string, string[]>> {
  const linked = new Map<string, string[]>();
  for (const group of chunks(postIds, IN_CHUNK)) {
    if (group.length === 0) continue;
    const rows = await selectRows(admin, "post_cards", "post_id, card_id, position", (query) =>
      query.in("post_id", group).order("position", { ascending: true }),
    );
    for (const row of rows) {
      const postId = typeof row.post_id === "string" ? row.post_id : "";
      const cardId = typeof row.card_id === "string" ? row.card_id : "";
      if (!postId || !cardId) continue;
      const list = linked.get(postId) ?? [];
      list.push(cardId);
      linked.set(postId, list);
    }
  }
  return linked;
}

async function readCards(admin: Db, ids: string[]): Promise<Map<string, TrendingCardRow>> {
  const unique = [...new Set(ids)].filter((id) => isUuid(id));
  const cards = new Map<string, TrendingCardRow>();
  for (const group of chunks(unique, IN_CHUNK)) {
    if (group.length === 0) continue;
    const rows = await selectRows(admin, "cards", "id, is_public, player", (query) => query.in("id", group));
    for (const row of rows) {
      const id = typeof row.id === "string" ? row.id : "";
      if (!id) continue;
      cards.set(id, {
        id,
        isPublic: row.is_public === true,
        player: typeof row.player === "string" ? row.player : "",
      });
    }
  }
  return cards;
}

async function readTrendingNow(now: Date): Promise<TrendingItem[]> {
  const admin = createSupabaseAdmin();
  if (!admin) return [];

  const since = new Date(now.getTime() - TRENDING_WINDOW_MS).toISOString();
  const [likes, replies, quotes, reposts] = await Promise.all([
    readKind(admin, "notifications", "post_id, created_at", "like", "post_id", since, (query) =>
      query.eq("kind", "like").not("post_id", "is", null),
    ),
    readKind(admin, "comments", "post_id, created_at", "reply", "post_id", since),
    readKind(admin, "posts", "quoted_post_id, created_at", "quote", "quoted_post_id", since, (query) =>
      query.not("quoted_post_id", "is", null).is("hidden_at", null),
    ),
    readKind(admin, "reposts", "post_id, created_at", "repost", "post_id", since),
  ]);

  const engagements = [...likes, ...replies, ...quotes, ...reposts];
  const candidateIds = trendingCandidateIds(engagements, now.getTime());
  if (candidateIds.length < TRENDING_MIN_POSTS) return [];

  const loaded = await readPosts(admin, candidateIds);
  if (loaded.length < TRENDING_MIN_POSTS) return [];

  const linked = await readLinks(
    admin,
    loaded.map((post) => post.id),
  );
  const cardIds: string[] = [];
  for (const post of loaded) {
    cardIds.push(...attachedCardIds({ card: post.card, meta: post.meta, linked: linked.get(post.id) }));
  }
  const cards = await readCards(admin, cardIds);
  const posts: TrendingPostSource[] = loaded.map((post) => {
    const privacy = trendingPostPrivacy(
      attachedCardIds({ card: post.card, meta: post.meta, linked: linked.get(post.id) }),
      cards,
    );
    return {
      id: post.id,
      authorId: post.authorId,
      body: post.body,
      createdAt: post.createdAt,
      hiddenAt: null,
      privateContent: privacy.privateContent,
      player: privacy.player,
    };
  });
  const authors = await readAuthors(
    admin,
    posts.map((post) => post.authorId),
  );

  return rankTrending({
    engagements,
    posts,
    authors,
    now: now.getTime(),
  });
}

/**
 * One shared ranking for every viewer. Blocked and muted authors are
 * removed after this returns, from the lists the feed already has.
 * The read is cached for about five minutes, including a failed read,
 * so a request never repeats the engagement queries inside that window.
 */
export async function getTrendingNow(): Promise<TrendingItem[]> {
  return unstable_cache(
    async () => {
      try {
        return await readTrendingNow(new Date());
      } catch (error) {
        console.warn("[trending-now]", error instanceof Error ? error.message : "read failed");
        return [];
      }
    },
    ["trending-now"],
    { revalidate: TRENDING_CACHE_SECONDS },
  )();
}

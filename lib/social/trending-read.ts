import { isUuid } from "@/lib/value/card-value-access";
import {
  attachedCardIds,
  rankTrending,
  trendingCandidateIds,
  trendingPostPrivacy,
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

type Row = Record<string, unknown>;
type DbError = { code?: string; message?: string } | null;

export type TrendingQuery = {
  eq: (column: string, value: string) => TrendingQuery;
  gte: (column: string, value: string) => TrendingQuery;
  in: (column: string, values: readonly string[]) => TrendingQuery;
  is: (column: string, value: null) => TrendingQuery;
  not: (column: string, operator: string, value: null) => TrendingQuery;
  order: (column: string, options: { ascending: boolean }) => TrendingQuery;
  limit: (count: number) => TrendingQuery;
  then: PromiseLike<{ data: unknown; error: DbError }>["then"];
};

/** Minimal query surface. The service-role client satisfies this at the call site. */
export type TrendingDb = {
  from: (table: string) => {
    select: (columns: string) => TrendingQuery;
  };
};

const IN_CHUNK = 80;

function chunks<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function missingColumn(error: DbError, column: string) {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  return new RegExp(column, "i").test(error.message ?? "");
}

async function selectRows(
  admin: TrendingDb,
  table: string,
  columns: string,
  build: (query: TrendingQuery) => TrendingQuery,
): Promise<Row[]> {
  const query = admin.from(table).select(columns);
  const { data, error } = await build(query);
  if (error) throw new Error(error.message ?? `${table} read failed`);
  return Array.isArray(data) ? (data as Row[]) : [];
}

function asEvent(
  postId: unknown,
  at: unknown,
  kind: EngagementKind,
  actorId: unknown,
  recipientId?: unknown,
): TrendingEngagement | null {
  if (typeof postId !== "string" || !isUuid(postId)) return null;
  if (typeof at !== "string" || !at) return null;
  if (typeof actorId !== "string" || !isUuid(actorId)) return null;
  if (kind === "like") {
    if (typeof recipientId !== "string" || !isUuid(recipientId)) return null;
    return { postId, kind, at, actorId, recipientId };
  }
  return { postId, kind, at, actorId };
}

function latest(query: TrendingQuery, since: string): TrendingQuery {
  return query.gte("created_at", since).order("created_at", { ascending: false }).limit(TRENDING_ENGAGEMENT_LIMIT);
}

async function readKind(
  admin: TrendingDb,
  table: string,
  columns: string,
  kind: EngagementKind,
  postColumn: string,
  actorColumn: string,
  since: string,
  extra?: (query: TrendingQuery) => TrendingQuery,
): Promise<{ events: TrendingEngagement[]; rows: number }> {
  const rows = await selectRows(admin, table, columns, (query) => latest(extra ? extra(query) : query, since));
  const events: TrendingEngagement[] = [];
  for (const row of rows) {
    const item = asEvent(row[postColumn], row.created_at, kind, row[actorColumn], row.recipient_id);
    if (item) events.push(item);
  }
  return { events, rows: rows.length };
}

async function readAuthors(admin: TrendingDb, ids: string[]): Promise<TrendingAuthor[]> {
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
    if (error) throw new Error(error.message ?? "profiles read failed");
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
  postType: "post" | "mail_day";
  card: unknown;
  meta: unknown;
};

async function readPosts(admin: TrendingDb, ids: string[]): Promise<LoadedPost[]> {
  const posts: LoadedPost[] = [];
  for (const group of chunks(ids, IN_CHUNK)) {
    if (group.length === 0) continue;
    const rows = await selectRows(
      admin,
      "posts",
      "id, user_id, content, created_at, hidden_at, post_type, card, meta",
      (query) => query.in("id", group).is("hidden_at", null),
    );
    for (const row of rows) {
      const id = typeof row.id === "string" ? row.id : "";
      const authorId = typeof row.user_id === "string" ? row.user_id : "";
      const createdAt = typeof row.created_at === "string" ? row.created_at : "";
      if (!id || !authorId || !createdAt || row.hidden_at) continue;
      if (row.post_type === "mail_day") continue;
      posts.push({
        id,
        authorId,
        body: typeof row.content === "string" ? row.content : "",
        createdAt,
        postType: "post",
        card: row.card,
        meta: row.meta,
      });
    }
  }
  return posts;
}

async function readLinks(admin: TrendingDb, postIds: string[]): Promise<Map<string, string[]>> {
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

async function readCards(admin: TrendingDb, ids: string[]): Promise<Map<string, TrendingCardRow>> {
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

function warnIfCapped(reads: ReadonlyArray<{ table: string; rows: number }>, warn: (message: string) => void) {
  const capped = reads.filter((read) => read.rows >= TRENDING_ENGAGEMENT_LIMIT);
  if (capped.length === 0) return;
  const tables = capped.map((read) => read.table).join(", ");
  warn(`[trending-now] engagement read hit the ${TRENDING_ENGAGEMENT_LIMIT}-row cap (${tables})`);
}

/**
 * Rank the window once. Throws when a read fails so the caller can avoid caching it.
 * Mail Day posts are left out. Each post's score uses distinct actors other than the author.
 */
export async function loadTrendingNow(
  admin: TrendingDb | null,
  now: Date,
  warn: (message: string) => void = console.warn,
): Promise<TrendingItem[]> {
  if (!admin) return [];

  const since = new Date(now.getTime() - TRENDING_WINDOW_MS).toISOString();
  const [likes, replies, quotes, reposts] = await Promise.all([
    readKind(
      admin,
      "notifications",
      "post_id, actor_id, recipient_id, created_at",
      "like",
      "post_id",
      "actor_id",
      since,
      (query) => query.eq("kind", "like").not("post_id", "is", null),
    ),
    readKind(admin, "comments", "post_id, user_id, created_at", "reply", "post_id", "user_id", since),
    readKind(
      admin,
      "posts",
      "quoted_post_id, user_id, created_at",
      "quote",
      "quoted_post_id",
      "user_id",
      since,
      (query) => query.not("quoted_post_id", "is", null).is("hidden_at", null),
    ),
    readKind(admin, "reposts", "post_id, user_id, created_at", "repost", "post_id", "user_id", since),
  ]);
  warnIfCapped(
    [
      { table: "notifications", rows: likes.rows },
      { table: "comments", rows: replies.rows },
      { table: "posts", rows: quotes.rows },
      { table: "reposts", rows: reposts.rows },
    ],
    warn,
  );

  const engagements = [...likes.events, ...replies.events, ...quotes.events, ...reposts.events];
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
      postType: post.postType,
      privateContent: privacy.privateContent,
      player: privacy.player,
    };
  });
  const authors = await readAuthors(admin, [
    ...posts.map((post) => post.authorId),
    ...engagements.map((event) => event.actorId),
  ]);

  return rankTrending({
    engagements,
    posts,
    authors,
    now: now.getTime(),
  });
}

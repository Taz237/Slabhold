import "server-only";

import { unstable_cache } from "next/cache";
import { createTtlCache } from "@/lib/moving-today/cache";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer, getAuthUserId } from "@/lib/supabase/server";
import { loadHiddenAuthorIds } from "@/lib/safety/filters";
import { presentLeaderboard, type LeaderboardPageModel, type LeaderboardSnapshot, type LeaderboardViewer } from "./present";
import { LEADERBOARD_CACHE_SECONDS, parseLeaderboardQuery } from "./rules";
import { emptySnapshot, snapshotFromInput } from "./snapshot";
import type { BoardCard, BoardFollow, BoardLike, BoardPost, BoardProfile, BoardReply, ScoreInput } from "./score";
import { previousWeek, weekContaining } from "./week";

const PAGE = 1000;
const ERROR_CACHE_MS = 60 * 1000;

type Row = Record<string, unknown>;

type FilterQuery = {
  eq: (column: string, value: string) => FilterQuery;
  gte: (column: string, value: string) => FilterQuery;
  lt: (column: string, value: string) => FilterQuery;
  is: (column: string, value: null) => FilterQuery;
  in: (column: string, value: string[]) => FilterQuery;
  order: (column: string) => FilterQuery;
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

type Admin = {
  from: (table: string) => { select: (columns: string) => FilterQuery };
};

const buckets = new Map<string, ReturnType<typeof createTtlCache<LeaderboardSnapshot>>>();

function bucket(weekId: string) {
  let cache = buckets.get(weekId);
  if (!cache) {
    cache = createTtlCache<LeaderboardSnapshot>(LEADERBOARD_CACHE_SECONDS * 1000, Date.now, ERROR_CACHE_MS);
    buckets.set(weekId, cache);
  }
  return cache;
}

function asRows(data: unknown): Row[] {
  if (!Array.isArray(data)) return [];
  return data.filter((row): row is Row => Boolean(row) && typeof row === "object");
}

async function pageRows(
  admin: Admin,
  table: string,
  columns: string,
  orderBy: string,
  apply: (query: FilterQuery) => FilterQuery,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; from < 20_000; from += PAGE) {
    const { data, error } = await apply(admin.from(table).select(columns))
      .order(orderBy)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = asRows(data);
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function cardIdList(row: Row, extra: readonly string[]): string[] {
  const ids: string[] = [];
  const attached = text(row.attached_card_id);
  if (attached) ids.push(attached);
  const card = row.card;
  if (card && typeof card === "object" && typeof (card as { id?: unknown }).id === "string") {
    const id = (card as { id: string }).id.trim();
    if (id && !ids.includes(id)) ids.push(id);
  }
  for (const id of extra) {
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

async function readInput(admin: Admin, startIso: string, endIso: string): Promise<ScoreInput> {
  const [profiles, cards, postHeads, likes, replies, follows] = await Promise.all([
    pageRows(
      admin,
      "profiles",
      "id, username, display_name, avatar_url, accent, created_at, is_test",
      "id",
      (query) => query,
    ),
    pageRows(admin, "cards", "id, user_id, is_public, player", "id", (query) => query),
    pageRows(admin, "posts", "id, user_id", "id", (query) => query.is("hidden_at", null)),
    pageRows(
      admin,
      "notifications",
      "actor_id, post_id, created_at",
      "created_at",
      (query) => query.eq("kind", "like").gte("created_at", startIso).lt("created_at", endIso),
    ),
    pageRows(
      admin,
      "comments",
      "id, user_id, post_id, created_at",
      "id",
      (query) => query.gte("created_at", startIso).lt("created_at", endIso),
    ),
    pageRows(
      admin,
      "follows",
      "follower_id, following_id, created_at",
      "created_at",
      (query) => query.gte("created_at", startIso).lt("created_at", endIso),
    ),
  ]);

  const likePostIds = new Set<string>();
  const mappedLikes: BoardLike[] = [];
  for (const row of likes) {
    const actorId = text(row.actor_id);
    const postId = text(row.post_id);
    const createdAt = text(row.created_at);
    if (!actorId || !postId || !createdAt) continue;
    likePostIds.add(postId);
    mappedLikes.push({ actorId, postId, createdAt, undone: false });
  }
  const mappedReplies: BoardReply[] = [];
  for (const row of replies) {
    const actorId = text(row.user_id);
    const postId = text(row.post_id);
    const createdAt = text(row.created_at);
    const id = text(row.id);
    if (!actorId || !postId || !createdAt) continue;
    likePostIds.add(postId);
    mappedReplies.push({ id: id || `${postId}:${actorId}:${createdAt}`, actorId, postId, createdAt, undone: false });
  }

  const postIds = [...likePostIds];
  const postRows: Row[] = [];
  const linkRows: Row[] = [];
  for (let index = 0; index < postIds.length; index += 80) {
    const chunk = postIds.slice(index, index + 80);
    const [posts, links] = await Promise.all([
      pageRows(
        admin,
        "posts",
        "id, user_id, content, hidden_at, attached_card_id:card->>id",
        "id",
        (query) => query.in("id", chunk),
      ),
      pageRows(admin, "post_cards", "post_id, card_id", "post_id", (query) => query.in("post_id", chunk)),
    ]);
    postRows.push(...posts);
    linkRows.push(...links);
  }

  const linksByPost = new Map<string, string[]>();
  for (const row of linkRows) {
    const postId = text(row.post_id);
    const cardId = text(row.card_id);
    if (!postId || !cardId) continue;
    const list = linksByPost.get(postId) ?? [];
    list.push(cardId);
    linksByPost.set(postId, list);
  }

  const posts: BoardPost[] = postRows.map((row) => ({
    id: text(row.id),
    authorId: text(row.user_id),
    body: text(row.content),
    hiddenAt: text(row.hidden_at) || null,
    deleted: false,
    cardIds: cardIdList(row, linksByPost.get(text(row.id)) ?? []),
  }));

  const mappedProfiles: BoardProfile[] = profiles.map((row) => ({
    id: text(row.id),
    username: text(row.username),
    displayName: text(row.display_name),
    createdAt: text(row.created_at),
    isTest: row.is_test === true,
    avatarUrl: text(row.avatar_url) || null,
    accent: text(row.accent) || "#7c5cff",
  }));

  const mappedCards: BoardCard[] = cards.flatMap((row) => {
    const id = text(row.id);
    const userId = text(row.user_id);
    if (!id || !userId) return [];
    return [
      {
        id,
        userId,
        isPublic: row.is_public === true,
        player: text(row.player),
      },
    ];
  });

  const mappedFollows: BoardFollow[] = follows.flatMap((row) => {
    const followerId = text(row.follower_id);
    const followingId = text(row.following_id);
    const createdAt = text(row.created_at);
    if (!followerId || !followingId || !createdAt) return [];
    // Unfollow deletes the row and the notification, so a removed follow is not here.
    return [{ followerId, followingId, createdAt, removedAt: null }];
  });

  return {
    profiles: mappedProfiles,
    posts,
    cards: mappedCards,
    usersWithPost: postHeads.map((row) => text(row.user_id)).filter(Boolean),
    likes: mappedLikes,
    replies: mappedReplies,
    follows: mappedFollows,
  };
}

async function readSnapshot(weekStart: Date): Promise<LeaderboardSnapshot> {
  const admin = createSupabaseAdmin();
  if (!admin) return emptySnapshot(weekStart);
  const current = weekContaining(weekStart);
  const previous = previousWeek(weekStart);
  const input = await readInput(admin as unknown as Admin, previous.start.toISOString(), current.end.toISOString());
  return snapshotFromInput(input, weekStart);
}

/**
 * Shared boards for the current week id. The signed-in viewer is not an argument,
 * so the You row and block list stay out of this cache.
 */
export async function getLeaderboardSnapshot(now = new Date()): Promise<LeaderboardSnapshot> {
  const weekId = weekContaining(now).start.toISOString();
  return unstable_cache(
    async (id: string) => bucket(id).read(() => readSnapshot(new Date(id))),
    ["leaderboard"],
    { revalidate: LEADERBOARD_CACHE_SECONDS },
  )(weekId);
}

async function readViewer(): Promise<LeaderboardViewer> {
  const userId = await getAuthUserId();
  if (!userId) return { userId: null, hiddenIds: [] };
  const supabase = await createSupabaseServer();
  if (!supabase) return { userId, hiddenIds: [] };
  try {
    const hiddenIds = await loadHiddenAuthorIds(supabase, true);
    return { userId, hiddenIds };
  } catch {
    return { userId, hiddenIds: [] };
  }
}

export async function getLeaderboardPage(input: {
  week?: string;
  board?: string;
  now?: Date;
}): Promise<LeaderboardPageModel> {
  const now = input.now ?? new Date();
  const parsed = parseLeaderboardQuery(input.week, input.board);
  let snapshot: LeaderboardSnapshot;
  try {
    snapshot = await getLeaderboardSnapshot(now);
  } catch {
    snapshot = emptySnapshot(now);
  }
  const viewer = await readViewer();
  return presentLeaderboard({ snapshot, viewer, week: parsed.week, boardId: parsed.boardId, now });
}

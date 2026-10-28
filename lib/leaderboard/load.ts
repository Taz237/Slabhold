import "server-only";

import { unstable_cache } from "next/cache";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/supabase/server";
import { pageRows, type PageAdmin } from "./pages";
import {
  presentLeaderboard,
  unavailableLeaderboard,
  type LeaderboardPageModel,
  type LeaderboardSnapshot,
  type LeaderboardViewer,
} from "./present";
import { LEADERBOARD_CACHE_SECONDS, leaderboardFocus, parseLeaderboardQuery } from "./rules";
import { getPostLikeActors, type BlockPair, type BoardCard, type BoardFollow, type BoardLike, type BoardPost, type BoardProfile, type BoardReply, type ScoreInput } from "./score";
import { snapshotFromInput } from "./snapshot";
import { hiddenIdsForViewer, type ViewerBlock, type ViewerMute } from "./viewer";
import { previousWeek, weekContaining } from "./week";

const CHUNK = 80;

type Row = Record<string, unknown>;
type Admin = PageAdmin;

type ViewerRead =
  | { ok: true; userId: string | null; hiddenIds: string[] }
  | { ok: false };

function asRows(data: unknown): Row[] {
  if (!Array.isArray(data)) return [];
  return data.filter((row): row is Row => Boolean(row) && typeof row === "object");
}

export async function rowsIn(
  admin: Admin,
  table: string,
  columns: string,
  column: string,
  ids: readonly string[],
  tieBreak?: string,
): Promise<Row[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  const orderBy = tieBreak ? [column, tieBreak] : [column];
  const rows: Row[] = [];
  for (let index = 0; index < unique.length; index += CHUNK) {
    const chunk = unique.slice(index, index + CHUNK);
    const batch = await pageRows(admin, table, columns, orderBy, (query) => query.in(column, chunk));
    rows.push(...batch);
  }
  return rows;
}

/** One card row per actor. A full collection read can pass the page cap and blank the board. */
export async function usersWithACard(admin: Admin, userIds: readonly string[]): Promise<string[]> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const found: string[] = [];
  const probe = admin as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          limit: (count: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
        };
      };
    };
  };
  for (let index = 0; index < ids.length; index += 40) {
    const chunk = ids.slice(index, index + 40);
    const hits = await Promise.all(
      chunk.map(async (userId) => {
        const { data, error } = await probe.from("cards").select("user_id").eq("user_id", userId).limit(1);
        if (error) throw new Error(error.message);
        return asRows(data).length > 0 ? userId : "";
      }),
    );
    for (const id of hits) if (id) found.push(id);
  }
  return found;
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

function mapCard(row: Row): BoardCard | null {
  const id = text(row.id);
  const userId = text(row.user_id);
  if (!id || !userId) return null;
  const yearRaw = row.year;
  const year = typeof yearRaw === "number" ? yearRaw : Number(yearRaw);
  return {
    id,
    userId,
    isPublic: row.is_public === true,
    player: text(row.player),
    year: Number.isFinite(year) ? year : 0,
    setName: text(row.set),
    parallel: text(row.parallel),
    imageUrl: text(row.image_url) || null,
    createdAt: text(row.created_at),
    hidden: false,
    deleted: false,
  };
}

async function readInput(admin: Admin, startIso: string, endIso: string): Promise<Omit<ScoreInput, "now">> {
  const [replyRows, followRows, blockRows, addedCardRows] = await Promise.all([
    pageRows(admin, "comments", "id, user_id, post_id, created_at", ["id"], (query) =>
      query.gte("created_at", startIso).lt("created_at", endIso),
    ),
    pageRows(
      admin,
      "follows",
      "follower_id, following_id, created_at",
      ["created_at", "follower_id", "following_id"],
      (query) => query.gte("created_at", startIso).lt("created_at", endIso),
    ),
    pageRows(admin, "blocks", "blocker_id, blocked_id", ["blocker_id", "blocked_id"], (query) => query),
    pageRows(
      admin,
      "cards",
      "id, user_id, player, year, set, parallel, image_url, is_public, created_at",
      ["created_at", "id"],
      (query) => query.gte("created_at", startIso).lt("created_at", endIso),
    ),
  ]);

  const mappedReplies: BoardReply[] = [];
  for (const row of replyRows) {
    const actorId = text(row.user_id);
    const postId = text(row.post_id);
    const createdAt = text(row.created_at);
    const id = text(row.id);
    if (!actorId || !postId || !createdAt) continue;
    mappedReplies.push({
      id: id || `${postId}:${actorId}:${createdAt}`,
      actorId,
      postId,
      createdAt,
      undone: false,
      hidden: false,
      deleted: false,
    });
  }

  const mappedFollows: BoardFollow[] = followRows.flatMap((row) => {
    const followerId = text(row.follower_id);
    const followingId = text(row.following_id);
    const createdAt = text(row.created_at);
    if (!followerId || !followingId || !createdAt) return [];
    // Unfollow deletes the row, so a removed follow is not here.
    return [{ followerId, followingId, createdAt, removedAt: null }];
  });

  const blockPairs: BlockPair[] = blockRows.flatMap((row) => {
    const blockerId = text(row.blocker_id);
    const blockedId = text(row.blocked_id);
    if (!blockerId || !blockedId) return [];
    return [{ blockerId, blockedId }];
  });

  const likes: BoardLike[] = [...getPostLikeActors()];
  const postIds = new Set<string>();
  for (const like of likes) postIds.add(like.postId);
  for (const reply of mappedReplies) postIds.add(reply.postId);

  const postRows = await rowsIn(
    admin,
    "posts",
    "id, user_id, content, hidden_at, post_type, created_at, attached_card_id:card->>id",
    "id",
    [...postIds],
  );
  const linkRows = await rowsIn(admin, "post_cards", "post_id, card_id", "post_id", [...postIds]);
  const linksByPost = new Map<string, string[]>();
  for (const row of linkRows) {
    const postId = text(row.post_id);
    const cardId = text(row.card_id);
    if (!postId || !cardId) continue;
    const list = linksByPost.get(postId) ?? [];
    list.push(cardId);
    linksByPost.set(postId, list);
  }

  const posts: BoardPost[] = postRows.flatMap((row) => {
    const id = text(row.id);
    const authorId = text(row.user_id);
    if (!id || !authorId) return [];
    return [
      {
        id,
        authorId,
        body: text(row.content),
        hiddenAt: text(row.hidden_at) || null,
        deleted: false,
        cardIds: cardIdList(row, linksByPost.get(id) ?? []),
        postType: text(row.post_type) === "mail_day" ? "mail_day" : "post",
        createdAt: text(row.created_at),
      },
    ];
  });

  const actorIds = new Set<string>();
  for (const like of likes) actorIds.add(like.actorId);
  for (const reply of mappedReplies) actorIds.add(reply.actorId);
  for (const follow of mappedFollows) actorIds.add(follow.followerId);

  const personIds = new Set<string>(actorIds);
  for (const follow of mappedFollows) personIds.add(follow.followingId);
  for (const post of posts) personIds.add(post.authorId);
  for (const row of addedCardRows) {
    const userId = text(row.user_id);
    if (userId) personIds.add(userId);
  }

  const cardIds = posts.flatMap((post) => post.cardIds);
  const [profileRows, attachedCards, cardOwners, actorPosts] = await Promise.all([
    rowsIn(
      admin,
      "profiles",
      "id, username, display_name, avatar_url, accent, created_at, is_test",
      "id",
      [...personIds],
    ),
    rowsIn(admin, "cards", "id, user_id, is_public, player", "id", cardIds),
    usersWithACard(admin, [...actorIds]),
    rowsIn(admin, "posts", "id, user_id, post_type, hidden_at", "user_id", [...actorIds], "id"),
  ]);

  const profiles: BoardProfile[] = profileRows.flatMap((row) => {
    const id = text(row.id);
    if (!id) return [];
    return [
      {
        id,
        username: text(row.username),
        displayName: text(row.display_name),
        createdAt: text(row.created_at),
        isTest: row.is_test === true,
        avatarUrl: text(row.avatar_url) || null,
        accent: text(row.accent) || "#7c5cff",
      },
    ];
  });

  const cards = new Map<string, BoardCard>();
  for (const row of attachedCards) {
    const card = mapCard(row);
    if (card) cards.set(card.id, card);
  }
  for (const row of addedCardRows) {
    const card = mapCard(row);
    if (card) cards.set(card.id, card);
  }
  const owners = new Set([...cards.values()].map((card) => card.userId));
  for (const userId of cardOwners) {
    if (owners.has(userId)) continue;
    cards.set(`exists:${userId}`, {
      id: `exists:${userId}`,
      userId,
      isPublic: false,
      player: "",
      year: 0,
      setName: "",
      parallel: "",
      imageUrl: null,
      createdAt: "",
      hidden: false,
      deleted: false,
    });
  }

  const usersWithPost = new Set<string>();
  for (const row of actorPosts) {
    if (text(row.hidden_at)) continue;
    if (text(row.post_type) === "mail_day") continue;
    const userId = text(row.user_id);
    if (userId) usersWithPost.add(userId);
  }

  return {
    profiles,
    posts,
    cards: [...cards.values()],
    usersWithPost: [...usersWithPost],
    likes,
    replies: mappedReplies,
    follows: mappedFollows,
    blockPairs,
  };
}

async function readSnapshot(weekStart: Date): Promise<LeaderboardSnapshot> {
  const admin = createSupabaseAdmin();
  if (!admin) throw new Error("leaderboard database is unavailable");
  const current = weekContaining(weekStart);
  const previous = previousWeek(weekStart);
  const input = await readInput(admin as unknown as Admin, previous.start.toISOString(), current.end.toISOString());
  const scoredAt = new Date();
  return snapshotFromInput({ ...input, now: weekStart }, weekStart, scoredAt);
}

/**
 * Shared boards for the current week id. One cache. The signed-in viewer is
 * not an argument, so the You row and block list stay out of this cache.
 */
export async function getLeaderboardSnapshot(now = new Date()): Promise<LeaderboardSnapshot> {
  const weekId = weekContaining(now).start.toISOString();
  return unstable_cache(async (id: string) => readSnapshot(new Date(id)), ["leaderboard"], {
    revalidate: LEADERBOARD_CACHE_SECONDS,
  })(weekId);
}

async function readViewer(): Promise<ViewerRead> {
  const userId = await getAuthUserId();
  if (!userId) return { ok: true, userId: null, hiddenIds: [] };
  const admin = createSupabaseAdmin();
  if (!admin) return { ok: false };
  try {
    const client = admin as unknown as Admin;
    const [blockedByMe, blockingMe, muted] = await Promise.all([
      pageRows(client, "blocks", "blocked_id", ["blocked_id"], (query) => query.eq("blocker_id", userId)),
      pageRows(client, "blocks", "blocker_id", ["blocker_id"], (query) => query.eq("blocked_id", userId)),
      pageRows(client, "mutes", "muted_id", ["muted_id"], (query) => query.eq("muter_id", userId)),
    ]);
    const blocks: ViewerBlock[] = [
      ...blockedByMe.map((row) => ({ blockerId: userId, blockedId: text(row.blocked_id) })),
      ...blockingMe.map((row) => ({ blockerId: text(row.blocker_id), blockedId: userId })),
    ];
    const mutes: ViewerMute[] = muted.map((row) => ({ muterId: userId, mutedId: text(row.muted_id) }));
    return { ok: true, userId, hiddenIds: hiddenIdsForViewer(userId, blocks, mutes) };
  } catch {
    return { ok: false };
  }
}

export async function getLeaderboardPage(input: {
  week?: string;
  board?: string;
  now?: Date;
}): Promise<LeaderboardPageModel> {
  const now = input.now ?? new Date();
  const parsed = parseLeaderboardQuery(input.week, input.board);
  const focusBoardId = leaderboardFocus(input.board);
  const failed = () => unavailableLeaderboard({ week: parsed.week, focusBoardId, now });
  let snapshot: LeaderboardSnapshot;
  try {
    snapshot = await getLeaderboardSnapshot(now);
  } catch {
    return failed();
  }
  const viewer = await readViewer();
  if (!viewer.ok) return failed();
  const ready: LeaderboardViewer = { userId: viewer.userId, hiddenIds: viewer.hiddenIds };
  return presentLeaderboard({ snapshot, viewer: ready, week: parsed.week, focusBoardId, now });
}

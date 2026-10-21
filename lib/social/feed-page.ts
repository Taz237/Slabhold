import type { FollowEdge } from "./types";
import { followedAccountIds } from "./timeline";

/** Home, Following, and profile timelines request about this many merged rows. */
export const FEED_PAGE_SIZE = 30;

export type FeedCursor = {
  createdAt: string;
  /** posts.id, or reposts.post_id. Both are uuids so the tie-break matches. */
  id: string;
  kind: "post" | "repost";
  /** Post author, or the account that reposted. */
  userId: string;
};

export type FeedRow = {
  kind: "post" | "repost";
  createdAt: string;
  id: string;
  userId: string;
};

const SAFE_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T[0-9:.+-]+Z?$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isFeedCursor(value: FeedCursor | null | undefined): value is FeedCursor {
  if (!value) return false;
  if (value.kind !== "post" && value.kind !== "repost") return false;
  if (!UUID_RE.test(value.id) || !UUID_RE.test(value.userId)) return false;
  return value.createdAt.length <= 40 && SAFE_TIMESTAMP.test(value.createdAt);
}

/**
 * Newest first: created_at desc, then id desc.
 * A repost sorts ahead of the original when those tie, then user id desc.
 * Timestamp text is the value Postgres returned, so lexicographic order matches time.
 */
export function compareFeedDesc(a: FeedRow, b: FeedRow): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  if (a.id !== b.id) return a.id < b.id ? 1 : -1;
  const rankA = a.kind === "repost" ? 1 : 0;
  const rankB = b.kind === "repost" ? 1 : 0;
  if (rankA !== rankB) return rankB - rankA;
  if (a.userId !== b.userId) return a.userId < b.userId ? 1 : -1;
  return 0;
}

/** True when `row` is strictly older than the cursor in compareFeedDesc order. */
export function isBeforeCursor(row: FeedRow, cursor: FeedCursor): boolean {
  if (row.createdAt !== cursor.createdAt) return row.createdAt < cursor.createdAt;
  if (row.id !== cursor.id) return row.id < cursor.id;
  const rowRank = row.kind === "repost" ? 1 : 0;
  const cursorRank = cursor.kind === "repost" ? 1 : 0;
  if (rowRank !== cursorRank) return rowRank < cursorRank;
  return row.userId < cursor.userId;
}

export function cursorFromRow(row: FeedRow): FeedCursor {
  return {
    createdAt: row.createdAt,
    id: row.id,
    kind: row.kind,
    userId: row.userId,
  };
}

function quoteFilterValue(value: string) {
  return `"${value}"`;
}

/**
 * PostgREST `or` filter matching isBeforeCursor for one table.
 * `idColumn` is `id` on posts and `post_id` on reposts.
 */
export function keysetOrFilter(
  cursor: FeedCursor,
  rowKind: "post" | "repost",
  idColumn: "id" | "post_id",
): string {
  const ts = quoteFilterValue(cursor.createdAt);
  const id = quoteFilterValue(cursor.id);
  const parts = [
    `created_at.lt.${ts}`,
    `and(created_at.eq.${ts},${idColumn}.lt.${id})`,
  ];
  const rowRank = rowKind === "repost" ? 1 : 0;
  const cursorRank = cursor.kind === "repost" ? 1 : 0;
  if (rowRank < cursorRank) {
    parts.push(`and(created_at.eq.${ts},${idColumn}.eq.${id})`);
  } else if (rowRank === cursorRank) {
    parts.push(
      `and(created_at.eq.${ts},${idColumn}.eq.${id},user_id.lt.${quoteFilterValue(cursor.userId)})`,
    );
  }
  return parts.join(",");
}

/**
 * If the original and a repost of it are both in the window, keep the newest repost.
 * Same rule as the client timeline: one row per post.
 */
export function dedupeFeedRows(rows: FeedRow[]): FeedRow[] {
  const byPostId = new Map<string, FeedRow[]>();
  for (const row of rows) {
    const group = byPostId.get(row.id);
    if (group) group.push(row);
    else byPostId.set(row.id, [row]);
  }
  const picked: FeedRow[] = [];
  for (const group of byPostId.values()) {
    const reposts = group.filter((row) => row.kind === "repost");
    if (reposts.length > 0) picked.push([...reposts].sort(compareFeedDesc)[0]!);
    else picked.push(group[0]!);
  }
  return picked.sort(compareFeedDesc);
}

/**
 * Merge a page of posts and a page of reposts that were each queried with the same cursor.
 * The returned prefix cannot skip a row that is still in either table.
 */
export function buildFeedPage(input: {
  posts: FeedRow[];
  reposts: FeedRow[];
  postsExhausted: boolean;
  repostsExhausted: boolean;
  pageSize: number;
}): { rows: FeedRow[]; hasMore: boolean; nextCursor: FeedCursor | null } {
  const posts = [...input.posts].sort(compareFeedDesc);
  const reposts = [...input.reposts].sort(compareFeedDesc);
  const postsExhausted = input.postsExhausted || posts.length === 0;
  const repostsExhausted = input.repostsExhausted || reposts.length === 0;
  const postBoundary = postsExhausted ? null : posts[posts.length - 1]!;
  const repostBoundary = repostsExhausted ? null : reposts[reposts.length - 1]!;
  const safe = [...posts, ...reposts].filter((row) => {
    if (postBoundary && compareFeedDesc(row, postBoundary) > 0) return false;
    if (repostBoundary && compareFeedDesc(row, repostBoundary) > 0) return false;
    return true;
  });
  const deduped = dedupeFeedRows(safe);
  const page = deduped.slice(0, Math.max(0, input.pageSize));
  const last = page[page.length - 1];
  if (!last) return { rows: [], hasMore: false, nextCursor: null };
  const hasMore = deduped.length > page.length || !postsExhausted || !repostsExhausted;
  return {
    rows: page,
    hasMore,
    nextCursor: hasMore ? cursorFromRow(last) : null,
  };
}

/**
 * Accounts whose posts and reposts belong on Following.
 * The viewer is included only after they follow someone. Nobody followed → empty,
 * so the screen can keep the "Follow collectors" empty state.
 */
export function followingAuthorIds(follows: FollowEdge[], userId: string): string[] {
  if (!userId) return [];
  const ids = followedAccountIds(follows, userId);
  if (ids.size === 0) return [];
  ids.add(userId);
  return [...ids].sort();
}

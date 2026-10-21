import type { FollowEdge } from "./types";
import { compareByRecent, followedAccountIds, timelineSortKey } from "./timeline";

/** Home, Following, and profile timelines request about this many merged rows. */
export const FEED_PAGE_SIZE = 30;

/**
 * Keyset cursor. `key` is the byRecent tie-break (`post:id` or `repost:userId:postId`),
 * so rows that share a timestamp stay in the same order across pages.
 */
export type FeedCursor = {
  createdAt: string;
  key: string;
};

export type FeedRow = {
  kind: "post" | "repost";
  createdAt: string;
  /** posts.id, which is also reposts.post_id. */
  id: string;
  /** Post author, or the account that reposted. */
  userId: string;
};

const SAFE_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T[0-9:.+-]+Z?$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function feedRowKey(row: FeedRow): string {
  return timelineSortKey(row.id, row.kind === "repost" ? row.userId : null);
}

export function parseTimelineKey(
  key: string,
): { kind: "post"; id: string } | { kind: "repost"; userId: string; postId: string } | null {
  if (key.startsWith("post:")) {
    const id = key.slice("post:".length);
    return UUID_RE.test(id) ? { kind: "post", id } : null;
  }
  if (!key.startsWith("repost:")) return null;
  const [userId, postId, extra] = key.slice("repost:".length).split(":");
  if (extra !== undefined || !userId || !postId) return null;
  if (!UUID_RE.test(userId) || !UUID_RE.test(postId)) return null;
  return { kind: "repost", userId, postId };
}

export function isFeedCursor(value: FeedCursor | null | undefined): value is FeedCursor {
  if (!value) return false;
  if (value.createdAt.length > 40 || !SAFE_TIMESTAMP.test(value.createdAt)) return false;
  return parseTimelineKey(value.key) !== null;
}

/** Same order as byRecent: created_at desc, then the timeline key ascending. */
export function compareFeedDesc(a: FeedRow, b: FeedRow): number {
  return compareByRecent(
    { at: a.createdAt, key: feedRowKey(a) },
    { at: b.createdAt, key: feedRowKey(b) },
  );
}

/** True when `row` sorts strictly after the cursor (older page). */
export function isBeforeCursor(row: FeedRow, cursor: FeedCursor): boolean {
  if (row.createdAt !== cursor.createdAt) return row.createdAt.localeCompare(cursor.createdAt) < 0;
  return feedRowKey(row).localeCompare(cursor.key) > 0;
}

export function cursorFromRow(row: FeedRow): FeedCursor {
  return { createdAt: row.createdAt, key: feedRowKey(row) };
}

function quoteFilterValue(value: string) {
  return `"${value}"`;
}

/**
 * PostgREST `or` filter for rows that sort after the cursor in one table.
 * Posts tie-break on id ascending (`post:${id}`). Reposts tie-break on
 * user_id then post_id (`repost:${userId}:${postId}`).
 */
export function keysetOrFilter(cursor: FeedCursor, table: "posts" | "reposts"): string {
  const ts = quoteFilterValue(cursor.createdAt);
  const older = `created_at.lt.${ts}`;
  const parsed = parseTimelineKey(cursor.key);
  if (!parsed) return older;
  const sameTime = `created_at.eq.${ts}`;
  if (table === "posts") {
    if (parsed.kind === "repost") return older;
    return [older, `and(${sameTime},id.gt.${quoteFilterValue(parsed.id)})`].join(",");
  }
  if (parsed.kind === "post") return [older, sameTime].join(",");
  const user = quoteFilterValue(parsed.userId);
  const postId = quoteFilterValue(parsed.postId);
  return [
    older,
    `and(${sameTime},user_id.gt.${user})`,
    `and(${sameTime},user_id.eq.${user},post_id.gt.${postId})`,
  ].join(",");
}

/**
 * Post ids this page reposts, when those posts were not in the post query.
 * The loader fetches these by id so a repost is not dropped just because the
 * original is older than the post page.
 */
export function missingRepostOriginalIds(rows: FeedRow[], loadedPostIds: ReadonlySet<string>): string[] {
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.kind !== "repost" || loadedPostIds.has(row.id) || seen.has(row.id)) continue;
    seen.add(row.id);
    missing.push(row.id);
  }
  return missing;
}

/**
 * If the original and a repost of it are both in the window, keep the newest repost.
 * Same rule as preferRepostOnce: one row per post.
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
 * Reposts are ordered by repost time. The returned prefix cannot skip a row still in either table.
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
 * Matches followingTimeline: own posts are in Following, and an empty follow list stays empty.
 */
export function followingAuthorIds(follows: FollowEdge[], userId: string): string[] {
  if (!userId) return [];
  const ids = followedAccountIds(follows, userId);
  if (ids.size === 0) return [];
  ids.add(userId);
  return [...ids].sort();
}

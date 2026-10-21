import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FollowEdge } from "./types";
import {
  buildFeedPage,
  compareFeedDesc,
  dedupeFeedRows,
  followingAuthorIds,
  isBeforeCursor,
  keysetOrFilter,
  type FeedCursor,
  type FeedRow,
} from "./feed-page";

const ME = "11111111-1111-4111-8111-111111111111";
const JOY = "22222222-2222-4222-8222-222222222222";
const SAM = "33333333-3333-4333-8333-333333333333";

function edge(followerId: string, followingId: string): FollowEdge {
  return { followerId, followingId, createdAt: "2026-10-01T00:00:00.000Z" };
}

function row(
  kind: FeedRow["kind"],
  createdAt: string,
  id: string,
  userId: string,
): FeedRow {
  return { kind, createdAt, id, userId };
}

function stamp(n: number) {
  return `2026-10-21T12:00:${String(n).padStart(2, "0")}.000000+00:00`;
}

function uuid(n: number) {
  const hex = n.toString(16).padStart(12, "0");
  return `aaaaaaaa-aaaa-4aaa-8aaa-${hex}`;
}

function cursor(item: FeedRow): FeedCursor {
  return {
    createdAt: item.createdAt,
    id: item.id,
    kind: item.kind,
    userId: item.userId,
  };
}

/** Read a keyset `or` filter back and apply it to one row. */
function matchesKeysetOr(item: FeedRow, filter: string, idColumn: "id" | "post_id"): boolean {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < filter.length; i++) {
    const char = filter[i];
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(filter.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(filter.slice(start));
  return parts.some((part) => matchesClause(item, part, idColumn));
}

function matchesClause(item: FeedRow, clause: string, idColumn: "id" | "post_id"): boolean {
  const body = clause.startsWith("and(") ? clause.slice(4, -1) : clause;
  const checks = body.split(",");
  return checks.every((check) => {
    const match = /^([a-z_]+)\.(lt|eq)\."([^"]*)"$/.exec(check);
    assert.ok(match, check);
    const column = match[1] ?? "";
    const op = match[2];
    const value = match[3] ?? "";
    const actual =
      column === "created_at" ? item.createdAt : column === idColumn ? item.id : item.userId;
    if (op === "lt") return actual < value;
    if (op === "eq") return actual === value;
    return false;
  });
}

function pageOf(rows: FeedRow[], pageCursor: FeedCursor | null, pageSize: number) {
  const older = rows
    .filter((item) => !pageCursor || isBeforeCursor(item, pageCursor))
    .sort(compareFeedDesc)
    .slice(0, pageSize);
  return {
    rows: older,
    exhausted: older.length < pageSize,
  };
}

/** Walk keyset pages the way the loader does, including duplicate hops. */
function walk(posts: FeedRow[], reposts: FeedRow[], pageSize: number): FeedRow[] {
  const seen = new Set<string>();
  const out: FeedRow[] = [];
  let pageCursor: FeedCursor | null = null;
  for (let hop = 0; hop < 40; hop++) {
    const postPage = pageOf(posts, pageCursor, pageSize);
    const repostPage = pageOf(reposts, pageCursor, pageSize);
    const built = buildFeedPage({
      posts: postPage.rows,
      reposts: repostPage.rows,
      postsExhausted: postPage.exhausted,
      repostsExhausted: repostPage.exhausted,
      pageSize,
    });
    let added = 0;
    for (const item of built.rows) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
      added += 1;
    }
    if (!built.hasMore) return out;
    assert.ok(built.nextCursor);
    if (pageCursor) assert.equal(isBeforeCursor(built.nextCursor, pageCursor), true);
    assert.equal(added > 0 || isBeforeCursor(built.nextCursor, pageCursor!), true);
    pageCursor = built.nextCursor;
  }
  assert.fail("paging did not finish");
}

describe("following author set", () => {
  it("includes the viewer once they follow someone", () => {
    const ids = followingAuthorIds(
      [edge(ME, JOY), edge(SAM, ME), edge(ME, ME)],
      ME,
    );
    assert.deepEqual(ids, [JOY, ME].sort());
    assert.equal(ids.includes(SAM), false);
  });

  it("stays empty when the viewer follows nobody, so their own posts stay out", () => {
    assert.deepEqual(followingAuthorIds([], ME), []);
    assert.deepEqual(followingAuthorIds([edge(JOY, ME)], ME), []);
  });
});

describe("feed keyset paging", () => {
  it("orders by created_at desc then id desc and cursors the last row", () => {
    const posts = [
      row("post", stamp(1), uuid(1), ME),
      row("post", stamp(3), uuid(3), JOY),
      row("post", stamp(3), uuid(9), SAM),
    ];
    const built = buildFeedPage({
      posts,
      reposts: [],
      postsExhausted: true,
      repostsExhausted: true,
      pageSize: 2,
    });
    assert.deepEqual(
      built.rows.map((item) => item.id),
      [uuid(9), uuid(3)],
    );
    assert.deepEqual(built.nextCursor, {
      createdAt: stamp(3),
      id: uuid(3),
      kind: "post",
      userId: JOY,
    });
    assert.equal(built.hasMore, true);
  });

  it("walks interleaved posts and reposts without skips or duplicates", () => {
    const posts = [100, 90, 80, 70, 60].map((second, index) =>
      row("post", stamp(second), uuid(index + 1), JOY),
    );
    const reposts = [95, 85, 75, 65, 55].map((second, index) =>
      row("repost", stamp(second), uuid(index + 10), ME),
    );
    const paged = walk(posts, reposts, 2);
    const full = dedupeFeedRows([...posts, ...reposts]);
    assert.deepEqual(
      paged.map((item) => `${item.kind}:${item.id}:${item.createdAt}`),
      full.map((item) => `${item.kind}:${item.id}:${item.createdAt}`),
    );
  });

  it("keeps the newest repost and does not show the original again", () => {
    const original = row("post", stamp(10), uuid(4), JOY);
    const repost = row("repost", stamp(20), uuid(4), ME);
    const other = row("post", stamp(5), uuid(5), SAM);
    const paged = walk([original, other], [repost], 1);
    assert.deepEqual(
      paged.map((item) => `${item.kind}:${item.id}`),
      [`repost:${uuid(4)}`, `post:${uuid(5)}`],
    );
  });

  it("pages Following with the viewer included in the author set", () => {
    const authors = new Set(followingAuthorIds([edge(ME, JOY)], ME));
    const posts = [
      row("post", stamp(30), uuid(1), ME),
      row("post", stamp(20), uuid(2), JOY),
      row("post", stamp(25), uuid(3), SAM),
    ];
    const reposts = [
      row("repost", stamp(28), uuid(7), ME),
      row("repost", stamp(18), uuid(8), SAM),
    ];
    const mine = posts.filter((item) => authors.has(item.userId));
    const mineReposts = reposts.filter((item) => authors.has(item.userId));
    const paged = walk(mine, mineReposts, 2);
    assert.deepEqual(
      paged.map((item) => item.userId),
      [ME, ME, JOY],
    );
    assert.equal(paged.some((item) => item.id === uuid(3)), false);
    assert.equal(paged.some((item) => item.id === uuid(8)), false);
  });

  it("matches the keyset filter to the cursor predicate", () => {
    const samples: FeedRow[] = [];
    for (const second of [10, 20, 30]) {
      for (const id of [uuid(1), uuid(2), uuid(3)]) {
        for (const userId of [ME, JOY]) {
          samples.push(row("post", stamp(second), id, userId));
          samples.push(row("repost", stamp(second), id, userId));
        }
      }
    }
    const cursors = samples.filter((_, index) => index % 5 === 0).map(cursor);
    for (const pageCursor of cursors) {
      for (const rowKind of ["post", "repost"] as const) {
        const idColumn = rowKind === "post" ? "id" : "post_id";
        const filter = keysetOrFilter(pageCursor, rowKind, idColumn);
        for (const item of samples) {
          if (item.kind !== rowKind) continue;
          assert.equal(
            matchesKeysetOr(item, filter, idColumn),
            isBeforeCursor(item, pageCursor),
            `${rowKind} ${item.createdAt} ${item.id} vs ${pageCursor.kind}`,
          );
        }
      }
    }
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TRENDING_ENGAGEMENT_LIMIT } from "./trending";
import { loadTrendingNow, type TrendingDb, type TrendingQuery } from "./trending-read";

const NOW = "2026-10-22T18:00:00.000Z";
const NOW_DATE = new Date(NOW);

const POST_A = "11111111-1111-4111-8111-111111111111";
const POST_B = "22222222-2222-4222-8222-222222222222";
const POST_C = "33333333-3333-4333-8333-333333333333";
const POST_D = "44444444-4444-4444-8444-444444444444";
const AUTHOR_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AUTHOR_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AUTHOR_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const AUTHOR_D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const FAN_1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const FAN_2 = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const STRANGER = "99999999-9999-4999-8999-999999999999";

type Row = Record<string, unknown>;
type DbError = { code?: string; message?: string } | null;

function profile(id: string, username: string, isTest = false): Row {
  return {
    id,
    username,
    display_name: username,
    avatar_url: null,
    accent: "#7c5cff",
    is_test: isTest,
  };
}

function postRow(id: string, userId: string, postType = "post"): Row {
  return {
    id,
    user_id: userId,
    content: `Body ${id}`,
    created_at: NOW,
    hidden_at: null,
    post_type: postType,
    card: null,
    meta: null,
  };
}

function like(postId: string, actorId: string, recipientId: string): Row {
  return {
    kind: "like",
    post_id: postId,
    actor_id: actorId,
    recipient_id: recipientId,
    created_at: NOW,
  };
}

function comment(postId: string, userId: string): Row {
  return { post_id: postId, user_id: userId, created_at: NOW };
}

function repost(postId: string, userId: string): Row {
  return { post_id: postId, user_id: userId, created_at: NOW };
}

const AUTHORS = [
  profile(AUTHOR_A, "ada"),
  profile(AUTHOR_B, "bea"),
  profile(AUTHOR_C, "cy"),
  profile(AUTHOR_D, "dee"),
  profile(FAN_1, "fanone"),
  profile(FAN_2, "fantwo"),
];

const POSTS = [
  postRow(POST_A, AUTHOR_A),
  postRow(POST_B, AUTHOR_B),
  postRow(POST_C, AUTHOR_C),
  postRow(POST_D, AUTHOR_D),
];

function pair(postId: string, authorId: string): Row[] {
  return [like(postId, FAN_1, authorId), like(postId, FAN_2, authorId)];
}

type Fake = TrendingDb & { calls: { table: string; columns: string }[] };

function fakeDb(tables: Record<string, Row[]>, errors: Record<string, DbError> = {}): Fake {
  const calls: { table: string; columns: string }[] = [];
  return {
    calls,
    from(table: string) {
      return {
        select(columns: string): TrendingQuery {
          calls.push({ table, columns });
          const filters: Array<(row: Row) => boolean> = [];
          let limit = Number.POSITIVE_INFINITY;
          let orderBy: { column: string; ascending: boolean } | null = null;
          const builder = {
            eq(column: string, value: string) {
              filters.push((row) => row[column] === value);
              return builder;
            },
            gte(column: string, value: string) {
              filters.push((row) => typeof row[column] === "string" && (row[column] as string) >= value);
              return builder;
            },
            in(column: string, values: readonly string[]) {
              const allowed = new Set(values);
              filters.push((row) => typeof row[column] === "string" && allowed.has(row[column] as string));
              return builder;
            },
            is(column: string, value: null) {
              filters.push((row) => (value === null ? row[column] == null : false));
              return builder;
            },
            not(column: string, operator: string, value: null) {
              if (operator === "is" && value === null) filters.push((row) => row[column] != null);
              return builder;
            },
            order(column: string, options: { ascending: boolean }) {
              orderBy = { column, ascending: options.ascending };
              return builder;
            },
            limit(count: number) {
              limit = count;
              return builder;
            },
            then(
              resolve: (value: { data: Row[] | null; error: DbError }) => unknown,
              reject?: (reason: unknown) => unknown,
            ) {
              const error = errors[table] ?? null;
              if (error) return Promise.resolve({ data: null, error }).then(resolve, reject);
              let rows = (tables[table] ?? []).filter((row) => filters.every((keep) => keep(row)));
              if (orderBy) {
                const column = orderBy.column;
                const direction = orderBy.ascending ? 1 : -1;
                rows = [...rows].sort((left, right) => {
                  const a = String(left[column] ?? "");
                  const b = String(right[column] ?? "");
                  if (a === b) return 0;
                  return a < b ? -direction : direction;
                });
              }
              return Promise.resolve({ data: rows.slice(0, limit), error: null }).then(resolve, reject);
            },
          };
          return builder as TrendingQuery;
        },
      };
    },
  };
}

describe("trending loader", () => {
  it("returns nothing without a database", async () => {
    assert.deepEqual(await loadTrendingNow(null, NOW_DATE), []);
  });

  it("ranks three posts from two distinct actors and reads the actor columns", async () => {
    const db = fakeDb({
      notifications: [...pair(POST_A, AUTHOR_A), ...pair(POST_B, AUTHOR_B), ...pair(POST_C, AUTHOR_C)],
      comments: [],
      reposts: [],
      posts: POSTS,
      profiles: AUTHORS,
      post_cards: [],
      cards: [],
    });
    const ranked = await loadTrendingNow(db, NOW_DATE, () => {
      throw new Error("cap should not be logged");
    });
    assert.deepEqual(
      ranked.map((row) => row.id),
      [POST_A, POST_B, POST_C],
    );
    assert.equal(ranked[0]?.engagements, 2);
    const columns = (table: string) => db.calls.filter((call) => call.table === table).map((call) => call.columns);
    assert.ok(columns("notifications").some((list) => list.includes("actor_id") && list.includes("recipient_id")));
    assert.ok(columns("comments").some((list) => list.includes("user_id")));
    assert.ok(columns("reposts").some((list) => list.includes("user_id")));
    assert.ok(columns("posts").some((list) => list.includes("quoted_post_id") && list.includes("user_id")));
    assert.ok(columns("posts").some((list) => list.includes("post_type") && list.includes("user_id")));
    assert.ok(columns("profiles").some((list) => list.includes("is_test")));
  });

  it("self-spam on 3 posts shows no rail", async () => {
    const db = fakeDb({
      notifications: [like(POST_A, AUTHOR_A, AUTHOR_A), like(POST_B, AUTHOR_B, AUTHOR_B), like(POST_C, AUTHOR_C, AUTHOR_C)],
      comments: [
        comment(POST_A, AUTHOR_A),
        comment(POST_A, AUTHOR_A),
        comment(POST_B, AUTHOR_B),
        comment(POST_B, AUTHOR_B),
        comment(POST_C, AUTHOR_C),
        comment(POST_C, AUTHOR_C),
      ],
      reposts: [repost(POST_A, AUTHOR_A), repost(POST_B, AUTHOR_B), repost(POST_C, AUTHOR_C)],
      posts: POSTS,
      profiles: AUTHORS,
      post_cards: [],
      cards: [],
    });
    assert.deepEqual(await loadTrendingNow(db, NOW_DATE), []);
  });

  it("does not count a forged like", async () => {
    const db = fakeDb({
      notifications: [
        ...pair(POST_A, AUTHOR_A),
        ...pair(POST_B, AUTHOR_B),
        ...pair(POST_C, AUTHOR_C),
        like(POST_D, FAN_1, AUTHOR_D),
        like(POST_D, FAN_2, STRANGER),
      ],
      comments: [],
      reposts: [],
      posts: POSTS,
      profiles: AUTHORS,
      post_cards: [],
      cards: [],
    });
    const ranked = await loadTrendingNow(db, NOW_DATE);
    assert.equal(
      ranked.some((row) => row.id === POST_D),
      false,
    );
    assert.deepEqual(
      ranked.map((row) => row.id),
      [POST_A, POST_B, POST_C],
    );
  });

  it("leaves Mail Day posts off the rail", async () => {
    const db = fakeDb({
      notifications: [
        ...pair(POST_A, AUTHOR_A),
        ...pair(POST_B, AUTHOR_B),
        ...pair(POST_C, AUTHOR_C),
        ...pair(POST_D, AUTHOR_D),
      ],
      comments: [],
      reposts: [],
      posts: [postRow(POST_A, AUTHOR_A), postRow(POST_B, AUTHOR_B), postRow(POST_C, AUTHOR_C), postRow(POST_D, AUTHOR_D, "mail_day")],
      profiles: AUTHORS,
      post_cards: [],
      cards: [],
    });
    const ranked = await loadTrendingNow(db, NOW_DATE);
    assert.equal(
      ranked.some((row) => row.id === POST_D),
      false,
    );
    assert.equal(ranked.length, 3);
  });

  it("logs once when a read hits the 1000-row limit", async () => {
    const filler = Array.from({ length: TRENDING_ENGAGEMENT_LIMIT }, () => ({
      kind: "like",
      post_id: POST_A,
      actor_id: "not-a-uuid",
      recipient_id: "not-a-uuid",
      user_id: "not-a-uuid",
      created_at: NOW,
    }));
    const warnings: string[] = [];
    const ranked = await loadTrendingNow(
      fakeDb({
        notifications: filler,
        comments: filler,
        reposts: [],
        posts: [],
        profiles: [],
      }),
      NOW_DATE,
      (message) => warnings.push(message),
    );
    assert.deepEqual(ranked, []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0] ?? "", /1000/);
    assert.match(warnings[0] ?? "", /notifications/);
    assert.match(warnings[0] ?? "", /comments/);
  });

  it("throws when a read fails instead of caching an empty rail", async () => {
    const db = fakeDb(
      { notifications: [], comments: [], reposts: [], posts: [], profiles: [] },
      { notifications: { message: "boom", code: "57014" } },
    );
    await assert.rejects(() => loadTrendingNow(db, NOW_DATE), /boom/);
  });
});

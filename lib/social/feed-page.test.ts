import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import type { FollowEdge } from "./types";
import { keepPagedItem, presentPagedItems } from "./paged-items";
import {
  createRememberedPosts,
  findKnownPost,
  mergeRememberedSnapshot,
  storeRemembered,
} from "./remembered-posts";
import { compareByRecent, timestampMicros, timelineSortKey, type TimelineItem } from "./timeline";
import type { Post, Profile } from "./types";
import {
  buildFeedPage,
  compareFeedDesc,
  cursorFromRow,
  dedupeFeedRows,
  feedRowKey,
  followingAuthorIds,
  homeHead,
  isBeforeCursor,
  keysetOrFilter,
  missingRepostOriginalIds,
  showsNewPosts,
  type FeedCursor,
  type FeedRow,
} from "./feed-page";

const ME = "11111111-1111-4111-8111-111111111111";
const JOY = "22222222-2222-4222-8222-222222222222";
const SAM = "33333333-3333-4333-8333-333333333333";

function edge(followerId: string, followingId: string): FollowEdge {
  return { followerId, followingId, createdAt: "2026-10-01T00:00:00.000Z" };
}

function row(kind: FeedRow["kind"], createdAt: string, id: string, userId: string): FeedRow {
  return { kind, createdAt, id, userId };
}

function stamp(n: number) {
  return `2026-10-21T12:00:${String(n).padStart(2, "0")}.000000+00:00`;
}

function uuid(n: number) {
  const hex = n.toString(16).padStart(12, "0");
  return `aaaaaaaa-aaaa-4aaa-8aaa-${hex}`;
}

function signature(item: FeedRow) {
  return `${item.kind}:${item.id}:${item.userId}:${item.createdAt}`;
}

/** Read a keyset `or` filter back and apply it to one row. */
function matchesKeysetOr(item: FeedRow, filter: string, table: "posts" | "reposts"): boolean {
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
  return parts.some((part) => matchesClause(item, part, table));
}

function matchesClause(item: FeedRow, clause: string, table: "posts" | "reposts"): boolean {
  const body = clause.startsWith("and(") ? clause.slice(4, -1) : clause;
  const checks = body.split(",");
  return checks.every((check) => {
    const match = /^([a-z_]+)\.(lt|eq|gt)\."([^"]*)"$/.exec(check);
    assert.ok(match, check);
    const column = match[1] ?? "";
    const op = match[2];
    const value = match[3] ?? "";
    const actual =
      column === "created_at"
        ? item.createdAt
        : column === "user_id"
          ? item.userId
          : column === "id" || column === "post_id"
            ? item.id
            : "";
    if (table === "posts" && column === "post_id") return false;
    if (op === "lt") return actual < value;
    if (op === "gt") return actual > value;
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

function cursorMovesForward(next: FeedCursor, previous: FeedCursor) {
  const nextTime = timestampMicros(next.createdAt);
  const previousTime = timestampMicros(previous.createdAt);
  if (nextTime !== null && previousTime !== null && nextTime !== previousTime) {
    return nextTime < previousTime;
  }
  if (next.createdAt !== previous.createdAt) return next.createdAt.localeCompare(previous.createdAt) < 0;
  return next.key.localeCompare(previous.key) > 0;
}

/**
 * Walk keyset pages the way the loader does.
 * Originals are omitted when any repost of that post exists, including on a later page.
 * A post id already shown is not shown again.
 */
function walk(posts: FeedRow[], reposts: FeedRow[], pageSize: number): FeedRow[] {
  const reposted = new Set(reposts.map((item) => item.id));
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
      if (item.kind === "post" && reposted.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
      added += 1;
    }
    if (!built.hasMore) return out;
    assert.ok(built.nextCursor);
    if (pageCursor) assert.equal(cursorMovesForward(built.nextCursor, pageCursor), true);
    assert.equal(added > 0 || pageCursor === null || cursorMovesForward(built.nextCursor, pageCursor), true);
    const previous = pageCursor;
    pageCursor = built.nextCursor;
    if (previous && pageCursor.key === previous.key && pageCursor.createdAt === previous.createdAt) {
      assert.fail("cursor did not advance");
    }
  }
  assert.fail("paging did not finish");
}

function person(id: string): Profile {
  return {
    id,
    email: "",
    username: id.slice(0, 8),
    displayName: id.slice(0, 8),
    bio: "",
    avatarDataUrl: null,
    coverDataUrl: null,
    accent: "#000",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function fullPost(id: string, authorId: string, body: string): Post {
  return {
    id,
    authorId,
    body,
    imageDataUrl: null,
    card: null,
    quotedPostId: null,
    createdAt: "2020-01-01T00:00:00.000Z",
  };
}

function item(
  post: Post,
  repostedBy: Profile | null,
  at: string,
): TimelineItem {
  return {
    key: repostedBy ? `repost:${repostedBy.id}:${post.id}` : `post:${post.id}`,
    post,
    at,
    repostedBy,
  };
}

describe("remembered posts", () => {
  it("keeps a post outside the newest 100 so it can be reposted after a refresh", () => {
    const memory = createRememberedPosts();
    const old = fullPost("old-post", JOY, "from last year");
    storeRemembered(memory, [old], [person(JOY)], new Set());
    const refreshed = mergeRememberedSnapshot(
      {
        posts: [fullPost("new-post", ME, "today")],
        profiles: [person(ME)],
        blockedIds: [] as string[],
      },
      memory,
      new Set(),
    );
    const found = findKnownPost(refreshed.posts, memory, old.id);
    assert.equal(found?.authorId, JOY);
    assert.equal(found?.body, "from last year");
    assert.equal(refreshed.profiles.some((profile) => profile.id === JOY), true);

    const blocked = mergeRememberedSnapshot(
      { posts: [] as Post[], profiles: [] as Profile[], blockedIds: [JOY] },
      memory,
      new Set(),
    );
    assert.equal(
      findKnownPost(blocked.posts, memory, old.id, { blockedIds: new Set([JOY]) }),
      undefined,
    );

    const removed = mergeRememberedSnapshot(
      { posts: [] as Post[], profiles: [] as Profile[], blockedIds: [] as string[] },
      memory,
      new Set([old.id]),
    );
    assert.equal(removed.posts.some((post) => post.id === old.id), false);
    assert.equal(
      findKnownPost(removed.posts, memory, old.id, { removedIds: new Set([old.id]) }),
      undefined,
    );
  });
});

describe("paged safety", () => {
  it("drops blocked people everywhere and muted people on home feeds", () => {
    const mine = fullPost("mine", ME, "old body");
    const edited = { ...mine, body: "edited" };
    const items = [
      item(mine, null, stamp(4)),
      item(fullPost("blocked-post", JOY, "nope"), null, stamp(3)),
      item(fullPost("reposted", ME, "x"), person(JOY), stamp(2)),
      item(fullPost("muted-post", SAM, "shh"), null, stamp(1)),
      item(fullPost("my-repost", SAM, "again"), person(ME), stamp(5)),
    ];
    const postsById = new Map([[edited.id, edited]]);
    const home = presentPagedItems(items, {
      blockedIds: new Set([JOY]),
      mutedIds: new Set([SAM]),
      postsById,
      reposts: [],
      viewerId: ME,
    });
    assert.deepEqual(
      home.map((entry) => entry.post.id),
      ["mine"],
    );
    assert.equal(home[0]?.post.body, "edited");

    const profile = presentPagedItems(items, {
      blockedIds: new Set([JOY]),
      postsById,
      reposts: [{ postId: "my-repost", userId: ME, createdAt: stamp(5) }],
      viewerId: ME,
    });
    assert.deepEqual(
      profile.map((entry) => entry.post.id),
      ["mine", "muted-post", "my-repost"],
    );
    assert.equal(keepPagedItem(items[2]!, { blockedIds: new Set([JOY]) }), false);
  });

  it("reloads the home feed when blocks or mutes change and pauses auto-load after an error", () => {
    const hook = readFileSync(join(process.cwd(), "components/use-paged-timeline.ts"), "utf8");
    const more = readFileSync(join(process.cwd(), "components/load-more.tsx"), "utf8");
    const view = readFileSync(join(process.cwd(), "components/feed-view.tsx"), "utf8");
    assert.match(hook, /input\.blockedIds/);
    assert.match(hook, /input\.mutedIds/);
    assert.match(hook, /\.sort\(\)\.join\(/);
    assert.equal(hook.includes("headToken"), false);
    assert.match(more, /Try again/);
    assert.match(more, /loading \|\| failed\) return/);
    assert.match(view, /New posts/);
  });
});

describe("new posts pill", () => {
  const earlier = homeHead(
    [{ id: "old", authorId: JOY, createdAt: "2026-10-21T12:00:10.000000+00:00" }],
    [],
  );

  it("stays hidden for the viewer's own post or repost and for a deleted head", () => {
    const ownPost = homeHead(
      [{ id: "mine", authorId: ME, createdAt: "2026-10-21T12:00:11.000000+00:00" }],
      [],
    );
    assert.equal(showsNewPosts(earlier, ownPost, ME, new Set()), false);
    const ownRepost = homeHead(
      [{ id: "old", authorId: JOY, createdAt: "2026-10-21T12:00:10.000000+00:00" }],
      [{ userId: ME, postId: "old", createdAt: "2026-10-21T12:00:12.000000+00:00" }],
    );
    assert.equal(showsNewPosts(earlier, ownRepost, ME, new Set()), false);
    const deleted = homeHead(
      [{ id: "older", authorId: SAM, createdAt: "2026-10-21T12:00:09.000000+00:00" }],
      [],
    );
    assert.equal(showsNewPosts(earlier, deleted, ME, new Set(["old"])), false);
    const someoneElse = homeHead(
      [{ id: "fresh", authorId: SAM, createdAt: "2026-10-21T12:00:11.000003+00:00" }],
      [],
    );
    assert.equal(showsNewPosts(earlier, someoneElse, ME, new Set()), true);
  });
});

describe("following author set", () => {
  it("includes the viewer once they follow someone", () => {
    const ids = followingAuthorIds([edge(ME, JOY), edge(SAM, ME), edge(ME, ME)], ME);
    assert.deepEqual(ids, [JOY, ME].sort());
    assert.equal(ids.includes(SAM), false);
  });

  it("stays empty when the viewer follows nobody, so their own posts stay out", () => {
    assert.deepEqual(followingAuthorIds([], ME), []);
    assert.deepEqual(followingAuthorIds([edge(JOY, ME)], ME), []);
  });

  it("loads Following from its own user_id query, not the home snapshot", () => {
    const view = readFileSync(join(process.cwd(), "components/feed-view.tsx"), "utf8");
    const loader = readFileSync(join(process.cwd(), "lib/social/load-feed-page.ts"), "utf8");
    assert.match(view, /scope: "following"/);
    assert.match(view, /authorIds: followingIds/);
    assert.match(loader, /query = query\.in\("user_id", options\.authorIds\)/);
    assert.doesNotMatch(view, /homePosts\.filter/);
    assert.equal(view.includes("lane === \"following\" ? feed : everyone"), true);
  });
});

describe("feed keyset paging", () => {
  it("orders by created_at desc then the byRecent key", () => {
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
      [uuid(3), uuid(9)],
    );
    assert.deepEqual(built.nextCursor, {
      createdAt: stamp(3),
      key: timelineSortKey(uuid(9)),
    });
    assert.equal(built.nextCursor?.key, `post:${uuid(9)}`);
    assert.equal(built.hasMore, true);
  });

  it("orders equal instants by the byRecent key, not by timestamp text", () => {
    const posts = [
      row("post", "2026-10-21T13:00:00.000Z", uuid(2), ME),
      row("post", "2026-10-21T12:00:00.000-02:00", uuid(1), JOY),
    ];
    const built = buildFeedPage({
      posts,
      reposts: [],
      postsExhausted: true,
      repostsExhausted: true,
      pageSize: 2,
    });
    assert.deepEqual(
      built.rows.map((entry) => entry.id),
      [uuid(1), uuid(2)],
    );
    const tied = [
      row("post", "2026-10-21T12:00:10.000Z", uuid(9), ME),
      row("post", "2026-10-21T12:00:10.000+00:00", uuid(3), JOY),
    ];
    const sameInstant = buildFeedPage({
      posts: tied,
      reposts: [],
      postsExhausted: true,
      repostsExhausted: true,
      pageSize: 2,
    });
    assert.deepEqual(
      sameInstant.rows.map((entry) => entry.id),
      [uuid(3), uuid(9)],
    );
  });

  it("pages two rows 3 microseconds apart once each", () => {
    const posts = [
      row("post", "2026-10-21T12:00:10.000123+00:00", uuid(1), ME),
      row("post", "2026-10-21T12:00:10.000126+00:00", uuid(2), JOY),
    ];
    const paged = walk(posts, [], 1);
    const full = dedupeFeedRows(posts);
    assert.deepEqual(paged.map(signature), full.map(signature));
    assert.deepEqual(
      paged.map((entry) => entry.id),
      [uuid(2), uuid(1)],
    );
    assert.equal(new Set(paged.map((entry) => entry.id)).size, posts.length);
  });

  it("pages a whole second before the same second plus a half", () => {
    const posts = [
      row("post", "2026-10-21T12:00:10+00:00", uuid(1), ME),
      row("post", "2026-10-21T12:00:10.5+00:00", uuid(2), JOY),
    ];
    const paged = walk(posts, [], 1);
    assert.deepEqual(paged.map(signature), dedupeFeedRows(posts).map(signature));
    assert.deepEqual(
      paged.map((entry) => entry.id),
      [uuid(2), uuid(1)],
    );
  });

  it("uses the byRecent key so equal timestamps are not skipped or repeated", () => {
    const at = stamp(10);
    const posts = [1, 4, 2, 5, 3].map((n) => row("post", at, uuid(n), JOY));
    const reposts = [8, 6, 7].map((n) => row("repost", at, uuid(n), ME));
    const paged = walk(posts, reposts, 3);
    const full = [...posts, ...reposts].sort(compareFeedDesc);
    assert.deepEqual(paged.map(signature), full.map(signature));
    const pages: FeedRow[][] = [];
    let pageCursor: FeedCursor | null = null;
    const ordered = [...full];
    while (ordered.length > 0) {
      const page = ordered.splice(0, 3);
      for (const item of page) {
        if (pageCursor) assert.equal(isBeforeCursor(item, pageCursor), true);
      }
      const last = page[page.length - 1]!;
      const nextCursor = cursorFromRow(last);
      assert.equal(nextCursor.key, timelineSortKey(last.id, last.kind === "repost" ? last.userId : null));
      pageCursor = nextCursor;
      pages.push(page);
    }
    const flat = pages.flat();
    assert.equal(new Set(flat.map(feedRowKey)).size, flat.length);
    assert.deepEqual(flat.map(feedRowKey), full.map(feedRowKey));
  });

  it("sorts with the same key string byRecent uses", () => {
    const rows = [
      row("post", stamp(4), uuid(2), JOY),
      row("repost", stamp(4), uuid(2), ME),
      row("repost", stamp(4), uuid(1), SAM),
      row("post", stamp(5), uuid(9), ME),
    ];
    const byFeed = [...rows].sort(compareFeedDesc).map(feedRowKey);
    const byTimeline = [...rows]
      .sort((a, b) =>
        compareByRecent(
          { at: a.createdAt, key: timelineSortKey(a.id, a.kind === "repost" ? a.userId : null) },
          { at: b.createdAt, key: timelineSortKey(b.id, b.kind === "repost" ? b.userId : null) },
        ),
      )
      .map((item) => timelineSortKey(item.id, item.kind === "repost" ? item.userId : null));
    assert.deepEqual(byFeed, byTimeline);
    assert.deepEqual(byFeed, [
      timelineSortKey(uuid(9)),
      timelineSortKey(uuid(2)),
      timelineSortKey(uuid(2), ME),
      timelineSortKey(uuid(1), SAM),
    ]);
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
    assert.deepEqual(paged.map(signature), full.map(signature));
  });

  it("pages a repost by repost time and still asks for the original when it is not on the post page", () => {
    const original = row("post", stamp(1), uuid(4), JOY);
    const repost = row("repost", stamp(20), uuid(4), ME);
    const other = row("post", stamp(5), uuid(5), SAM);
    const postPage = pageOf([original, other], null, 1);
    assert.deepEqual(postPage.rows.map((item) => item.id), [uuid(5)]);
    assert.deepEqual(missingRepostOriginalIds([repost], new Set(postPage.rows.map((item) => item.id))), [
      uuid(4),
    ]);
    const paged = walk([original, other], [repost], 1);
    assert.deepEqual(
      paged.map((item) => `${item.kind}:${item.id}`),
      [`repost:${uuid(4)}`, `post:${uuid(5)}`],
    );
    assert.equal(paged[0]?.createdAt, stamp(20));
  });

  it("hides the original across pages when a same-timestamp repost sorts later", () => {
    const at = stamp(10);
    const original = row("post", at, uuid(1), JOY);
    const fillers = [2, 3, 4].map((n) => row("post", at, uuid(n), SAM));
    const repost = row("repost", at, uuid(1), ME);
    const paged = walk([original, ...fillers], [repost], 2);
    assert.equal(
      paged.some((item) => item.kind === "post" && item.id === uuid(1)),
      false,
    );
    assert.equal(
      paged.some((item) => item.kind === "repost" && item.id === uuid(1)),
      true,
    );
    assert.deepEqual(paged.map(signature), dedupeFeedRows([original, ...fillers, repost]).map(signature));
  });

  it("pages Following with the viewer included in the author set", () => {
    const authors = new Set(followingAuthorIds([edge(ME, JOY)], ME));
    const posts = [
      row("post", stamp(30), uuid(1), ME),
      row("post", stamp(20), uuid(2), JOY),
      row("post", stamp(25), uuid(3), SAM),
    ];
    const reposts = [row("repost", stamp(28), uuid(7), ME), row("repost", stamp(18), uuid(8), SAM)];
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
    const cursors = samples.filter((_, index) => index % 5 === 0).map(cursorFromRow);
    for (const pageCursor of cursors) {
      for (const table of ["posts", "reposts"] as const) {
        const filter = keysetOrFilter(pageCursor, table);
        const rowKind = table === "posts" ? "post" : "repost";
        for (const item of samples) {
          if (item.kind !== rowKind) continue;
          assert.equal(
            matchesKeysetOr(item, filter, table),
            isBeforeCursor(item, pageCursor),
            `${table} ${item.createdAt} ${feedRowKey(item)} vs ${pageCursor.key}`,
          );
        }
      }
    }
  });
});

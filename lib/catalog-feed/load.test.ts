import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { FEED_COLUMNS, FEED_POPULAR_PER_PAGE, readCardEngagement, readCardHeartRanking, readFeedPage } from "./load";
import { FEED_PAGE_SIZE, type FeedFilters } from "./feed";

type Row = Record<string, unknown>;
type Call = { table: string; select: string; ops: [string, unknown[]][] };

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function card(n: number, extra: Row = {}): Row {
  return {
    id: uuid(n),
    user_id: uuid(900 + (n % 3)),
    player: `Player ${n}`,
    year_label: "2023-24",
    set_name: "Prizm",
    card_number: String(n),
    parallel: "",
    serial_run: null,
    grade: "",
    grader: "",
    condition_type: "raw",
    is_rookie: false,
    image_url: null,
    accent: "#7c5cff",
    sport: n % 2 ? "Basketball" : "Football",
    category: null,
    estimated_value: null,
    created_at: `2026-10-${String(1 + (n % 28)).padStart(2, "0")}T12:00:00Z`,
    ...extra,
  };
}

function tables(): Record<string, Row[]> {
  return {
    public_cards: Array.from({ length: 30 }, (_, i) => card(i + 1)),
    profiles: [
      { id: uuid(900), username: "ada", display_name: "Ada", avatar_url: null },
      { id: uuid(901), username: "ben", display_name: "Ben", avatar_url: null },
      { id: uuid(902), username: "qa_tester", display_name: "QA", is_test: true },
    ],
    follows: [{ follower_id: uuid(1), following_id: uuid(901), created_at: "2026-11-01" }],
    card_likes: [
      { card_id: uuid(3), user_id: uuid(1), created_at: "2026-11-03" },
      { card_id: uuid(3), user_id: uuid(2), created_at: "2026-11-02" },
      { card_id: uuid(4), user_id: uuid(1), created_at: "2026-11-04" },
    ],
    card_comments: [
      { id: "c1", card_id: uuid(3) },
      { id: "c2", card_id: uuid(5) },
    ],
  };
}

/** Enough of the PostgREST builder for the loader. Records every call. */
function fakeAdmin(data: Record<string, Row[]>) {
  const calls: Call[] = [];
  function from(table: string) {
    let rows = [...(data[table] ?? [])];
    const call: Call = { table, select: "", ops: [] };
    calls.push(call);
    let window: [number, number] | null = null;
    let limit = Infinity;
    let head = false;
    const builder = {
      select: (columns: string, opts?: { count?: string; head?: boolean }) => (
        (call.select = columns), (head = Boolean(opts?.head)), builder
      ),
      in: (col: string, values: unknown[]) => (
        call.ops.push(["in", [col, values]]), (rows = rows.filter((r) => values.includes(r[col]))), builder
      ),
      eq: (col: string, value: unknown) => (call.ops.push(["eq", [col, value]]), (rows = rows.filter((r) => r[col] === value)), builder),
      ilike: (col: string, value: string) => (
        call.ops.push(["ilike", [col, value]]),
        (rows = rows.filter((r) => String(r[col] ?? "").toLowerCase() === value.toLowerCase())),
        builder
      ),
      is: (col: string, value: unknown) => (call.ops.push(["is", [col, value]]), (rows = rows.filter((r) => (r[col] ?? null) === value)), builder),
      order: (col: string, opts?: { ascending?: boolean }) => {
        call.ops.push(["order", [col, opts]]);
        const dir = opts?.ascending === false ? -1 : 1;
        rows.sort((a, b) => (String(a[col]) < String(b[col]) ? -dir : String(a[col]) > String(b[col]) ? dir : 0));
        return builder;
      },
      range: (start: number, end: number) => (call.ops.push(["range", [start, end]]), (window = [start, end]), builder),
      limit: (n: number) => (call.ops.push(["limit", [n]]), (limit = n), builder),
      then<T>(resolve: (value: { data: Row[] | null; count: number; error: null }) => T) {
        const out = window ? rows.slice(window[0], window[1] + 1) : rows.slice(0, limit);
        return Promise.resolve({ data: head ? null : out, count: rows.length, error: null }).then(resolve);
      },
    };
    return builder;
  }
  return { admin: { from } as never, calls };
}

const forYou: FeedFilters = { tab: "for-you", sport: null };

describe("readFeedPage", () => {
  it("reads only public_cards with public columns, never the cards table or price paid", async () => {
    const { admin, calls } = fakeAdmin(tables());
    await readFeedPage(forYou, 0, null, admin, [[uuid(3), 9]]);
    await readFeedPage({ tab: "following", sport: null }, 0, uuid(1), admin, []);
    assert.equal(calls.some((call) => call.table === "cards"), false);
    for (const call of calls.filter((c) => c.table === "public_cards")) assert.equal(call.select, FEED_COLUMNS);
    assert.doesNotMatch(FEED_COLUMNS, /purchase|price_cents|is_public|notes|paid/);
    const load = readFileSync(join(process.cwd(), "lib/catalog-feed/load.ts"), "utf8");
    assert.doesNotMatch(load, /from\("cards"\)/);
  });

  it("For You: a page of the newest plus a few popular cards, no test owners, and where the next page starts", async () => {
    const { admin } = fakeAdmin(tables());
    const likes: [string, number][] = Array.from({ length: 6 }, (_, i) => [uuid(30 - i), 10 - i]);
    const page = await readFeedPage(forYou, 0, null, admin, likes);
    assert.equal(page.nextOffset, FEED_PAGE_SIZE);
    const popular = page.cards.filter((c) => c.source === "popular");
    assert.ok(popular.length > 0 && popular.length <= FEED_POPULAR_PER_PAGE);
    assert.equal(new Set(page.cards.map((c) => c.id)).size, page.cards.length, "no repeats");
    assert.equal(page.cards.some((c) => c.owner.username === "qa_tester"), false);
  });

  it("filters by sport", async () => {
    const { admin } = fakeAdmin(tables());
    const page = await readFeedPage({ tab: "for-you", sport: "football" }, 0, null, admin, []);
    assert.ok(page.cards.length > 0);
    assert.ok(page.cards.every((c) => c.sport === "football"));
  });

  it("Following: only people the viewer follows, and nothing when signed out", async () => {
    const { admin } = fakeAdmin(tables());
    const page = await readFeedPage({ tab: "following", sport: null }, 0, uuid(1), admin, []);
    assert.ok(page.cards.length > 0);
    assert.ok(page.cards.every((c) => c.owner.id === uuid(901) && c.source === "following"));
    const out = await readFeedPage({ tab: "following", sport: null }, 0, null, admin, []);
    assert.deepEqual(out, { cards: [], nextOffset: null });
  });
});

describe("readCardEngagement", () => {
  it("counts hearts and comments per card from card_likes and card_comments, never from posts", async () => {
    const { admin, calls } = fakeAdmin(tables());
    const map = await readCardEngagement(admin, [uuid(3), uuid(4), uuid(5), uuid(6)]);
    assert.deepEqual(map.get(uuid(3)), { likeCount: 2, commentCount: 1 });
    assert.deepEqual(map.get(uuid(4)), { likeCount: 1, commentCount: 0 });
    assert.deepEqual(map.get(uuid(5)), { likeCount: 0, commentCount: 1 });
    assert.deepEqual(map.get(uuid(6)), { likeCount: 0, commentCount: 0 });
    const tablesRead = new Set(calls.map((call) => call.table));
    assert.deepEqual([...tablesRead].sort(), ["card_comments", "card_likes"]);
  });

  it("reads each table once for the whole page, not once per card", async () => {
    const { admin, calls } = fakeAdmin(tables());
    const ids = Array.from({ length: 12 }, (_, i) => uuid(i + 1));
    const map = await readCardEngagement(admin, ids);
    assert.deepEqual(map.get(uuid(3)), { likeCount: 2, commentCount: 1 });
    assert.equal(calls.filter((call) => call.table === "card_likes").length, 1);
    assert.equal(calls.filter((call) => call.table === "card_comments").length, 1);
    const likes = calls.find((call) => call.table === "card_likes")!;
    assert.deepEqual(likes.ops.find(([op]) => op === "in")?.[1], ["card_id", ids]);
  });

  it("falls back to exact counts per card when a page has more rows than one read returns", async () => {
    const { admin, calls } = fakeAdmin(tables());
    const map = await readCardEngagement(admin, [uuid(3), uuid(4)], 2);
    assert.deepEqual(map.get(uuid(3)), { likeCount: 2, commentCount: 1 });
    assert.deepEqual(map.get(uuid(4)), { likeCount: 1, commentCount: 0 });
    // One grouped read that hit the cap, then one exact count per card for likes.
    assert.equal(calls.filter((call) => call.table === "card_likes").length, 3);
  });

  it("feed cards carry those counts", async () => {
    const { admin } = fakeAdmin(tables());
    const page = await readFeedPage(forYou, 0, null, admin, [[uuid(3), 9]]);
    const three = page.cards.find((c) => c.id === uuid(3));
    assert.equal(three?.likeCount, 2);
    assert.equal(three?.commentCount, 1);
  });
});

describe("For You popular lane", () => {
  it("ranks cards by recent hearts in card_likes, most hearted first", async () => {
    const { admin, calls } = fakeAdmin(tables());
    const ranking = await readCardHeartRanking(admin);
    assert.deepEqual(ranking, [
      [uuid(3), 2],
      [uuid(4), 1],
    ]);
    assert.deepEqual([...new Set(calls.map((call) => call.table))], ["card_likes"]);
  });

  it("stays apart from the timeline: no posts, post likes or post_cards", () => {
    const load = readFileSync(join(process.cwd(), "lib/catalog-feed/load.ts"), "utf8");
    assert.doesNotMatch(load, /getCardLikes|readCardLikes|public-catalog\/load/);
    assert.doesNotMatch(load, /"posts"|"post_cards"|"likes"|"comments"|like_count/);
    assert.match(load, /getCardHeartRanking\(\)/);
  });
});

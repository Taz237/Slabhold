import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { FEED_COLUMNS, FEED_POPULAR_PER_PAGE, readCardEngagement, readFeedPage } from "./load";
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
    posts: [
      { id: "p1", like_count: 9, created_at: "2026-11-01", "card->>id": uuid(3), card_id: uuid(3), hidden_at: null },
      { id: "p2", like_count: 4, created_at: "2026-11-05", "card->>id": null, card_id: null, hidden_at: null },
      { id: "p3", like_count: 50, created_at: "2026-11-06", "card->>id": uuid(4), card_id: uuid(4), hidden_at: "2026-11-07" },
    ],
    post_cards: [{ post_id: "p2", card_id: uuid(3) }],
    comments: [{ post_id: "p2" }, { post_id: "p2" }, { post_id: "p1" }],
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
    const builder = {
      select: (columns: string) => ((call.select = columns), builder),
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
      then<T>(resolve: (value: { data: Row[]; error: null }) => T) {
        const out = window ? rows.slice(window[0], window[1] + 1) : rows.slice(0, limit);
        return Promise.resolve({ data: out, error: null }).then(resolve);
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
  it("adds likes across a card's visible posts and uses its newest post for comments", async () => {
    const { admin } = fakeAdmin(tables());
    const map = await readCardEngagement(admin, [uuid(3), uuid(4), uuid(5)]);
    assert.deepEqual(map.get(uuid(3)), { likeCount: 13, commentCount: 2, postId: "p2" });
    // A hidden post never counts.
    assert.equal(map.has(uuid(4)), false);
    assert.equal(map.has(uuid(5)), false);
  });
});

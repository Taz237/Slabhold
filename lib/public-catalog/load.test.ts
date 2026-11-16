import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CATALOG_COLUMNS, GRADED_OR, readCardLikes, readCatalogPage } from "./load";
import { CATALOG_PAGE_SIZE, DEFAULT_CATALOG_FILTERS, type CatalogFilters } from "./query";

type Row = Record<string, unknown>;
type Call = { table: string; select: string; ops: [string, unknown[]][] };

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function card(n: number, extra: Row = {}): Row {
  return {
    id: uuid(n),
    user_id: uuid(900 + (n % 3)),
    player: `Player ${n}`,
    year: 2020,
    year_label: "2023-24",
    set: "Prizm",
    set_name: "Prizm",
    grade: n % 2 ? "10" : "",
    grader: n % 2 ? "PSA" : "",
    condition_type: n % 2 ? "graded" : "raw",
    is_rookie: false,
    image_url: null,
    accent: "#7c5cff",
    sport: n % 2 ? "Basketball" : "Football",
    category: null,
    estimated_value: n % 4 === 0 ? 25 : null,
    created_at: `2026-10-${String(1 + (n % 28)).padStart(2, "0")}T12:00:${String(n % 60).padStart(2, "0")}Z`,
    ...extra,
  };
}

function tables(): Record<string, Row[]> {
  return {
    public_cards: Array.from({ length: 30 }, (_, i) => card(i + 1)),
    profiles: [
      { id: uuid(900), username: "ada" },
      { id: uuid(901), username: "ben" },
      { id: uuid(902), username: "qa_tester", is_test: true },
    ],
    posts: [
      { id: "p1", like_count: 9, card_id: uuid(3) },
      { id: "p2", like_count: 4, card_id: uuid(6) },
      { id: "p3", like_count: 2, card_id: null },
      { id: "p4", like_count: 0, card_id: uuid(9) },
    ],
    post_cards: [
      { post_id: "p3", card_id: uuid(6) },
      { post_id: "p3", card_id: uuid(12) },
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
    const builder = {
      select: (columns: string) => ((call.select = columns), builder),
      in: (col: string, values: unknown[]) => (
        call.ops.push(["in", [col, values]]), (rows = rows.filter((r) => values.includes(r[col]))), builder
      ),
      ilike: (col: string, value: string) => (
        call.ops.push(["ilike", [col, value]]),
        (rows = rows.filter((r) => String(r[col] ?? "").toLowerCase() === value.toLowerCase())),
        builder
      ),
      or: (filter: string) => (call.ops.push(["or", [filter]]), builder),
      gt: (col: string, value: number) => (
        call.ops.push(["gt", [col, value]]), (rows = rows.filter((r) => Number(r[col]) > value)), builder
      ),
      is: (col: string, value: unknown) => (call.ops.push(["is", [col, value]]), builder),
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

const filters = (partial: Partial<CatalogFilters> = {}): CatalogFilters => ({ ...DEFAULT_CATALOG_FILTERS, ...partial });

describe("readCatalogPage", () => {
  it("reads only the public_cards view, never the cards table", async () => {
    const { admin, calls } = fakeAdmin(tables());
    await readCatalogPage(filters(), 0, admin);
    await readCatalogPage(filters({ sort: "liked" }), 0, admin, [[uuid(3), 9]]);
    const tablesRead = new Set(calls.map((call) => call.table));
    assert.equal(tablesRead.has("cards"), false);
    assert.ok(tablesRead.has("public_cards"));
    for (const call of calls.filter((c) => c.table === "public_cards")) {
      assert.equal(call.select, CATALOG_COLUMNS);
    }
    // No price paid or private fields.
    assert.doesNotMatch(CATALOG_COLUMNS, /purchase|price_cents|is_public|notes/);
    const load = readFileSync(join(process.cwd(), "lib/public-catalog/load.ts"), "utf8");
    assert.doesNotMatch(load, /from\("cards"\)/);
  });

  it("pages newest first by offset and says where the next page starts", async () => {
    const { admin, calls } = fakeAdmin(tables());
    const page = await readCatalogPage(filters(), 0, admin);
    const read = calls.find((c) => c.table === "public_cards")!;
    assert.deepEqual(read.ops.filter(([op]) => op === "order").map(([, args]) => args[0]), ["created_at", "id"]);
    assert.deepEqual(read.ops.find(([op]) => op === "range")?.[1], [0, CATALOG_PAGE_SIZE - 1]);
    assert.equal(page.nextOffset, CATALOG_PAGE_SIZE);
    const dates = page.tiles.map((tile) => tile.id);
    assert.ok(dates.length > 0);
    const last = await readCatalogPage(filters(), CATALOG_PAGE_SIZE, admin);
    assert.equal(last.nextOffset, null, "fewer rows than a page is the end");
  });

  it("drops test owners' cards and links each tile to its owner's card page", async () => {
    const { admin } = fakeAdmin(tables());
    const page = await readCatalogPage(filters(), 0, admin);
    assert.ok(page.tiles.length > 0);
    for (const tile of page.tiles) {
      assert.match(tile.href, /^\/u\/(ada|ben)\/cards\//);
    }
  });

  it("never shows Pokemon or other TCG cards", async () => {
    const data = tables();
    data.public_cards.unshift(card(99, { user_id: uuid(900), sport: "Pokémon", created_at: "2026-12-01T00:00:00Z" }));
    const { admin } = fakeAdmin(data);
    const page = await readCatalogPage(filters(), 0, admin);
    assert.equal(page.tiles.some((tile) => tile.id === uuid(99)), false);
  });

  it("filters by sport and sends a quoted player-or-set search", async () => {
    const { admin, calls } = fakeAdmin(tables());
    const page = await readCatalogPage(filters({ sport: "basketball", q: "Prizm, (x)" }), 0, admin);
    const read = calls.find((c) => c.table === "public_cards")!;
    assert.deepEqual(read.ops.find(([op]) => op === "ilike")?.[1], ["sport", "basketball"]);
    const or = String(read.ops.find(([op]) => op === "or")?.[1][0]);
    assert.match(or, /^player\.ilike\."%Prizm x%",set_name\.ilike\."%Prizm x%",set\.ilike\."%Prizm x%"$/);
    assert.ok(page.tiles.every((tile) => tile.sport === "basketball"));
  });

  it("graded only keeps slabs, and combines with a search in one filter", async () => {
    const { admin, calls } = fakeAdmin(tables());
    const page = await readCatalogPage(filters({ sort: "graded" }), 0, admin);
    assert.ok(page.tiles.length > 0);
    assert.ok(page.tiles.every((tile) => tile.conditionType === "graded"));
    assert.equal(calls[0]!.ops.find(([op]) => op === "or")?.[1][0], GRADED_OR);

    const both = fakeAdmin(tables());
    await readCatalogPage(filters({ sort: "graded", q: "Prizm" }), 0, both.admin);
    const ors = both.calls[0]!.ops.filter(([op]) => op === "or");
    assert.equal(ors.length, 1);
    assert.match(String(ors[0]![1][0]), /^and\(or\(player\.ilike.*\),or\(condition_type\.eq\.graded,.*\)\)$/);
  });

  it("most liked ranks cards by likes and only lists liked cards", async () => {
    const { admin } = fakeAdmin(tables());
    const page = await readCatalogPage(filters({ sort: "liked" }), 0, admin, [
      [uuid(3), 9],
      [uuid(6), 6],
      [uuid(12), 2],
    ]);
    assert.deepEqual(
      page.tiles.map((tile) => tile.id),
      [uuid(3), uuid(6), uuid(12)],
    );
    assert.equal(page.nextOffset, null);
  });

  it("shows a value only when there is one", async () => {
    const { admin } = fakeAdmin(tables());
    const page = await readCatalogPage(filters(), 0, admin);
    const priced = page.tiles.filter((tile) => tile.priceLabel);
    assert.ok(priced.length > 0);
    assert.ok(priced.every((tile) => tile.priceLabel === "$25.00"));
    assert.ok(page.tiles.some((tile) => tile.priceLabel === ""));
    assert.equal(page.tiles.some((tile) => /no value/i.test(tile.priceLabel)), false);
  });

  it("returns an empty page with no database", async () => {
    assert.deepEqual(await readCatalogPage(filters(), 0, null), { tiles: [], nextOffset: null });
  });
});

describe("readCardLikes", () => {
  it("adds up likes per card from visible posts and their linked cards", async () => {
    const { admin, calls } = fakeAdmin(tables());
    const likes = new Map(await readCardLikes(admin));
    assert.equal(likes.get(uuid(3)), 9);
    assert.equal(likes.get(uuid(6)), 6);
    assert.equal(likes.get(uuid(12)), 2);
    assert.equal(likes.has(uuid(9)), false);
    const posts = calls.find((c) => c.table === "posts")!;
    assert.deepEqual(posts.ops.find(([op]) => op === "is")?.[1], ["hidden_at", null]);
  });
});

import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { readMovingToday } from "./load";

type Row = Record<string, unknown>;

const NOW = new Date("2026-10-29T17:00:00Z");
const SNAPSHOT = join(process.cwd(), "lib/moving-today/__fixtures__/load-snapshot.json");

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const day = (date: string, hour = 15) => `${date}T${String(hour).padStart(2, "0")}:00:00+00:00`;

function card(n: number, user: number, extra: Row = {}): Row {
  return {
    id: uuid(n),
    user_id: uuid(900 + user),
    player: `Player ${n}`,
    year: 2020 + (n % 5),
    year_label: null,
    set: "Prizm",
    set_name: null,
    grade: n % 2 ? "10" : "",
    grader: n % 2 ? "PSA" : "",
    condition_type: n % 2 ? "graded" : "raw",
    is_rookie: n % 3 === 0,
    image_url: n % 4 ? `https://example.supabase.co/storage/v1/object/public/card-photos/${n}.jpg` : null,
    accent: "#7c5cff",
    sport: n % 2 ? "basketball" : "football",
    created_at: day(`2026-10-${String(1 + n).padStart(2, "0")}`),
    estimated_value: 10 * n,
    ...extra,
  };
}

/** Public cards 1–90 (so ids need two IN chunks), private card 95, and card 96 that shares 95's key. */
function fixture(): Record<string, Row[]> {
  const publicCards = Array.from({ length: 90 }, (_, i) => card(i + 1, (i % 7) + 1));
  publicCards.push(card(96, 3));
  const cards = [...publicCards, card(95, 2)].map((row) => ({ id: row.id, user_id: row.user_id }));
  const sales: Row[] = [];
  const keyOf = (n: number) => (n === 95 || n === 96 ? "key-95" : `key-${n}`);
  for (let n = 1; n <= 90; n += 1) {
    if (n % 3 === 0) continue;
    const base = 20 + n;
    // Window sales in the last 30 days.
    sales.push({ query_key: keyOf(n), card_id: uuid(n), item_id: `w-${n}-a`, price: base * (n % 2 ? 1.6 : 0.6), sold_at: day("2026-10-28", 10 + (n % 10)) });
    if (n % 5 === 0) sales.push({ query_key: keyOf(n), card_id: uuid(n), item_id: `w-${n}-b`, price: base * 1.1, sold_at: day("2026-10-29", 13) });
    // Earlier history for the recent average.
    for (let k = 0; k < 3; k += 1) {
      sales.push({ query_key: keyOf(n), card_id: uuid(n), item_id: `h-${n}-${k}`, price: base + k, sold_at: day(`2026-0${7 + k}-1${k}`) });
    }
  }
  // History-only card id under a key that also has window sales.
  sales.push({ query_key: "key-1", card_id: uuid(2), item_id: "h-shared", price: 22, sold_at: day("2026-08-20") });
  // The private card's sale. Its key is covered by public card 96 through card_values.
  sales.push({ query_key: "key-95", card_id: uuid(95), item_id: "w-95", price: 300, sold_at: day("2026-10-27") });
  sales.push({ query_key: "key-95", card_id: uuid(95), item_id: "h-95", price: 100, sold_at: day("2026-08-01") });
  sales.push({ query_key: "key-4", card_id: uuid(4), item_id: "__empty__", price: 1, sold_at: day("2026-10-28") });
  return {
    sold_comps_cache: sales,
    public_cards: publicCards,
    cards,
    comp_flags: [{ card_id: uuid(1), user_id: uuid(902), item_id: "w-1-a" }, { card_id: uuid(10), user_id: uuid(904), item_id: "w-10-b" }],
    card_values: [{ card_id: uuid(96), query_key: "key-95" }, { card_id: uuid(95), query_key: "key-95" }],
    profiles: Array.from({ length: 7 }, (_, i) => ({ id: uuid(901 + i), username: `collector${i + 1}` })),
  };
}

/** Enough of the PostgREST builder for the loader. Each read takes `delay` ms and is counted. */
function fakeAdmin(tables: Record<string, Row[]>, delay = 4) {
  // depth: 1 + the deepest read that had finished when this one started.
  const stats = { reads: 0, inFlight: 0, maxInFlight: 0, settledDepth: 0, maxDepth: 0 };
  function query(table: string) {
    let rows = [...(tables[table] ?? [])];
    let limit = Infinity;
    const builder = {
      select: () => builder,
      gte: (col: string, value: string) => ((rows = rows.filter((r) => Date.parse(String(r[col])) >= Date.parse(value))), builder),
      lt: (col: string, value: string) => ((rows = rows.filter((r) => Date.parse(String(r[col])) < Date.parse(value))), builder),
      gt: (col: string, value: number) => ((rows = rows.filter((r) => Number(r[col]) > value)), builder),
      neq: (col: string, value: unknown) => ((rows = rows.filter((r) => r[col] !== value)), builder),
      not: (col: string) => ((rows = rows.filter((r) => r[col] != null)), builder),
      in: (col: string, values: unknown[]) => ((rows = rows.filter((r) => values.includes(r[col]))), builder),
      order: (col: string, opts?: { ascending?: boolean }) => {
        const dir = opts?.ascending === false ? -1 : 1;
        rows.sort((a, b) => (String(a[col]) < String(b[col]) ? -dir : String(a[col]) > String(b[col]) ? dir : 0));
        return builder;
      },
      limit: (n: number) => ((limit = n), builder),
      then<T>(resolve: (value: { data: Row[]; error: null }) => T) {
        stats.reads += 1;
        stats.inFlight += 1;
        stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
        const depth = stats.settledDepth + 1;
        stats.maxDepth = Math.max(stats.maxDepth, depth);
        return new Promise<{ data: Row[]; error: null }>((done) =>
          setTimeout(() => {
            stats.inFlight -= 1;
            stats.settledDepth = Math.max(stats.settledDepth, depth);
            done({ data: rows.slice(0, limit), error: null });
          }, delay),
        ).then(resolve);
      },
    };
    return builder;
  }
  return { admin: { from: query } as never, stats };
}

describe("readMovingToday", () => {
  it("returns the same payload as the sequential loader on the fixture", async () => {
    const { admin } = fakeAdmin(fixture());
    const payload = await readMovingToday(NOW, admin);
    assert.ok(payload.sales.length > 20, "the fixture has movers and public cards");
    const json = `${JSON.stringify(payload, null, 2)}\n`;
    if (!existsSync(SNAPSHOT)) writeFileSync(SNAPSHOT, json);
    assert.equal(json, readFileSync(SNAPSHOT, "utf8"));
  });

  it("runs independent reads together: five waves, not one per query", async () => {
    const { admin, stats } = fakeAdmin(fixture());
    await readMovingToday(NOW, admin);
    // Sales + newest, then history + sale cards, then history cards + alternates,
    // then alternate cards, then profiles.
    assert.equal(stats.maxDepth, 5, `${stats.reads} reads in ${stats.maxDepth} waves`);
    assert.ok(stats.maxInFlight >= 4, `max in flight ${stats.maxInFlight}`);
  });
});

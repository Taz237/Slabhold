import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SoldCompCard } from "@/lib/comps/types";
import {
  fallbackSales,
  mergeExactSales,
  newestBatchRows,
  POSTGREST_MAX_ROWS,
  PRICE_BATCH_READ_CONCURRENCY,
  readNewestBatches,
  SOLD_CACHE_ROW_LIMIT,
  type CachedCompRow,
  type SoldCacheClient,
} from "@/lib/value/price-batch";

const CARD: SoldCompCard = {
  id: "card-1",
  playerName: "J.J. McCarthy",
  year: 2024,
  setBrand: "Donruss",
  cardNumber: "303",
  parallel: "Optic Preview Pink",
  conditionType: "raw",
  grade: "Raw",
};

const TITLE = "2024 Donruss JJ McCarthy Optic Preview Pink Prizm RC #303";
const NEWEST = "2026-10-02T12:00:00.000Z";
const OLDER = "2026-09-01T12:00:00.000Z";

function row(partial: Partial<CachedCompRow> & Pick<CachedCompRow, "item_id" | "price">): CachedCompRow {
  return {
    title: TITLE,
    currency: "USD",
    sold_at: "2026-10-01T00:00:00.000Z",
    grader: null,
    grade: null,
    url: "",
    fetched_at: NEWEST,
    ...partial,
  };
}

describe("fallback sales batch", () => {
  it("keeps only the newest fetched_at batch", () => {
    const rows = [
      row({ item_id: "old", price: 9, fetched_at: OLDER, sold_at: "2026-08-01T00:00:00.000Z" }),
      row({ item_id: "new-a", price: 40, sold_at: "2026-10-01T00:00:00.000Z" }),
      row({ item_id: "new-b", price: 50, sold_at: "2026-10-02T00:00:00.000Z" }),
      row({ item_id: "__empty__", price: 0, fetched_at: NEWEST }),
    ];
    assert.deepEqual(
      newestBatchRows(rows).map((item) => item.item_id),
      ["new-a", "new-b"],
    );
    const sales = fallbackSales(CARD, rows, new Set());
    assert.deepEqual(
      sales.map((sale) => sale.price),
      [40, 50],
    );
  });

  it("drops the owner's flagged item and a sale that does not match the card", () => {
    const rows = [
      row({ item_id: "keep", price: 40 }),
      row({ item_id: "flagged", price: 44, sold_at: "2026-10-03T00:00:00.000Z" }),
      row({
        item_id: "graded",
        price: 80,
        title: `${TITLE} PSA 10`,
        grader: "PSA",
        grade: "10",
        sold_at: "2026-10-04T00:00:00.000Z",
      }),
      row({
        item_id: "other",
        price: 15,
        title: "2020 Topps Chrome Mike Trout PSA 10 #1",
        grader: "PSA",
        grade: "10",
      }),
    ];
    const sales = fallbackSales(CARD, rows, new Set(["flagged"]));
    assert.deepEqual(
      sales.map((sale) => sale.price),
      [40],
    );
    assert.equal(sales[0]?.itemId, "keep");
  });

  it("drops a flagged item from an identical copy and dedupes by item id", () => {
    const own = [row({ item_id: "own", price: 42, sold_at: "2026-10-01T00:00:00.000Z" })];
    const copy = [
      row({ item_id: "X", price: 44, sold_at: "2026-10-02T00:00:00.000Z" }),
      row({ item_id: "keep", price: 40, sold_at: "2026-10-03T00:00:00.000Z" }),
      row({ item_id: "own", price: 42, sold_at: "2026-10-01T00:00:00.000Z" }),
    ];
    const subjectFlags = new Set(["X"]);
    const sales = mergeExactSales(subjectFlags, [
      fallbackSales(CARD, own, subjectFlags),
      fallbackSales(CARD, copy, new Set()),
    ]);
    assert.equal(sales.some((sale) => sale.price === 44), false);
    assert.deepEqual(sales.map((sale) => sale.price), [42, 40]);
    assert.equal("itemId" in (sales[0] ?? {}), false);

    const sameDay = mergeExactSales(new Set(), [
      [
        { itemId: "a", price: 10, soldAt: "2026-10-01T00:00:00.000Z" },
        { itemId: "b", price: 10, soldAt: "2026-10-01T00:00:00.000Z" },
        { price: 10, soldAt: "2026-10-01T08:00:00.000Z" },
        { price: 10, soldAt: "2026-10-01T18:00:00.000Z" },
        { itemId: "tiny", price: 0.009, soldAt: "2026-10-04T00:00:00.000Z" },
      ],
    ]);
    assert.deepEqual(
      sameDay.map((sale) => sale.price),
      [10, 10, 10],
    );
  });
});

type CacheRow = CachedCompRow & { query_key: string };

function cacheClient(rows: CacheRow[]): {
  client: SoldCacheClient;
  inReads: string[][];
  peakReads: () => number;
} {
  const inReads: string[][] = [];
  let active = 0;
  let peak = 0;
  const client: SoldCacheClient = {
    from() {
      let onlyKeys: string[] | null = null;
      let limit: number | null = null;
      let orderCol: keyof CacheRow | null = null;
      let ascending = true;
      const builder = {
        select() {
          return builder;
        },
        in(column: string, values: readonly string[]) {
          if (column === "query_key") {
            onlyKeys = [...values];
            inReads.push(onlyKeys);
          }
          return builder;
        },
        order(column: string, options?: { ascending?: boolean }) {
          orderCol = column as keyof CacheRow;
          ascending = options?.ascending !== false;
          return builder;
        },
        limit(count: number) {
          limit = count;
          return builder;
        },
        then<T>(
          resolve: (value: { data: CacheRow[]; error: null }) => T,
          reject?: (reason: unknown) => T,
        ) {
          let out = rows.filter((row) => {
            if (onlyKeys && !onlyKeys.includes(row.query_key)) return false;
            return true;
          });
          if (orderCol) {
            const col = orderCol;
            out = [...out].sort((a, b) => {
              const av = String(a[col] ?? "");
              const bv = String(b[col] ?? "");
              const cmp = av < bv ? -1 : av > bv ? 1 : 0;
              return ascending ? cmp : -cmp;
            });
          }
          if (limit != null) out = out.slice(0, Math.min(limit, POSTGREST_MAX_ROWS));
          active += 1;
          peak = Math.max(peak, active);
          return Promise.resolve({ data: out, error: null }).then(
            (value) => {
              active -= 1;
              return resolve(value);
            },
            (reason) => {
              active -= 1;
              return reject?.(reason);
            },
          );
        },
      };
      return builder;
    },
  };
  return { client, inReads, peakReads: () => peak };
}

describe("newest batches under the shared cap", () => {
  it("keeps the card's own sales when 9 later similar batches fill the cap", async () => {
    const ownKey = "card-own";
    const copyKey = "card-copy";
    const ownAt = "2026-01-01T00:00:00.000Z";
    const later = "2026-10-02T00:00:00.000Z";
    const rows: CacheRow[] = [
      { query_key: ownKey, item_id: "own-1", price: 40, fetched_at: ownAt, title: "own" },
      { query_key: ownKey, item_id: "own-2", price: 55, fetched_at: ownAt, title: "own" },
      { query_key: copyKey, item_id: "copy-1", price: 41, fetched_at: ownAt, title: "copy" },
      { query_key: copyKey, item_id: "copy-2", price: 56, fetched_at: ownAt, title: "copy" },
    ];
    const similar: string[] = [];
    for (let card = 0; card < 9; card += 1) {
      const key = `similar-${card}`;
      similar.push(key);
      for (let sale = 0; sale < 60; sale += 1) {
        rows.push({
          query_key: key,
          item_id: `sim-${card}-${sale}`,
          price: 10 + sale,
          fetched_at: later,
          title: "similar",
        });
      }
    }

    const { client, inReads } = cacheClient(rows);
    const batches = await readNewestBatches(client, [ownKey, copyKey, ...similar], [ownKey, copyKey]);
    assert.deepEqual(
      batches.get(ownKey)?.map((row) => row.item_id).sort(),
      ["own-1", "own-2"],
    );
    assert.deepEqual(
      batches.get(copyKey)?.map((row) => row.item_id).sort(),
      ["copy-1", "copy-2"],
    );
    assert.ok(
      inReads.some(
        (keys) =>
          keys.includes(ownKey) &&
          keys.includes(copyKey) &&
          keys.every((key) => !key.startsWith("similar-")),
      ),
    );
  });

  it("keeps every own row when cousins fill the shared cap", async () => {
    const ownKey = "card-own";
    const ownAt = "2026-01-01T00:00:00.000Z";
    const later = "2026-10-02T00:00:00.000Z";
    const rows: CacheRow[] = [];
    for (let sale = 0; sale < 100; sale += 1) {
      rows.push({
        query_key: ownKey,
        item_id: `own-${sale}`,
        price: 10 + (sale % 40),
        fetched_at: ownAt,
        title: "own",
      });
    }
    const cousins: string[] = [];
    for (let card = 0; card < 8; card += 1) {
      const key = `cousin-${card}`;
      cousins.push(key);
      for (let sale = 0; sale < 60; sale += 1) {
        rows.push({
          query_key: key,
          item_id: `cousin-${card}-${sale}`,
          price: 10 + sale,
          fetched_at: later,
          title: "cousin",
        });
      }
    }

    const { client, inReads } = cacheClient(rows);
    const batches = await readNewestBatches(client, [ownKey, ...cousins], [ownKey]);
    const ids = batches.get(ownKey)?.map((row) => row.item_id) ?? [];
    assert.equal(ids.length, 100);
    for (let sale = 0; sale < 100; sale += 1) {
      assert.ok(ids.includes(`own-${sale}`));
    }
    assert.ok(
      inReads.some(
        (keys) => keys.includes(ownKey) && keys.every((key) => !key.startsWith("cousin-")),
      ),
    );
  });

  it("keeps every own row when many newer copies would fill a shared 480 cap", async () => {
    const ownKey = "card-own";
    const ownAt = "2026-01-01T00:00:00.000Z";
    const later = "2026-10-02T00:00:00.000Z";
    const rows: CacheRow[] = [];
    for (let sale = 0; sale < 100; sale += 1) {
      rows.push({
        query_key: ownKey,
        item_id: `own-${sale}`,
        price: 10 + (sale % 40),
        fetched_at: ownAt,
        title: "own",
      });
    }
    const copies: string[] = [];
    const copyCount = Math.ceil((POSTGREST_MAX_ROWS + 1) / 60);
    for (let card = 0; card < copyCount; card += 1) {
      const key = `copy-${card}`;
      copies.push(key);
      for (let sale = 0; sale < 60; sale += 1) {
        rows.push({
          query_key: key,
          item_id: `copy-${card}-${sale}`,
          price: 10 + sale,
          fetched_at: later,
          title: "copy",
        });
      }
    }

    const { client } = cacheClient(rows);
    const batches = await readNewestBatches(client, [ownKey, ...copies], [ownKey, ...copies]);
    const ids = batches.get(ownKey)?.map((row) => row.item_id) ?? [];
    assert.equal(ids.length, 100);
    for (let sale = 0; sale < 100; sale += 1) {
      assert.ok(ids.includes(`own-${sale}`));
    }
  });

  it("re-reads an exact key when its batch fills the page", async () => {
    const key = "card-own";
    const fetched = "2026-01-01T00:00:00.000Z";
    const count = SOLD_CACHE_ROW_LIMIT + 120;
    const rows: CacheRow[] = [];
    for (let sale = 0; sale < count; sale += 1) {
      rows.push({
        query_key: key,
        item_id: `own-${sale}`,
        price: 10 + (sale % 40),
        fetched_at: fetched,
        title: "own",
      });
    }

    const { client, inReads } = cacheClient(rows);
    const batches = await readNewestBatches(client, [key], [key]);
    const ids = batches.get(key)?.map((row) => row.item_id) ?? [];
    assert.equal(ids.length, count);
    assert.ok(ids.includes("own-0"));
    assert.ok(ids.includes(`own-${count - 1}`));
    assert.ok(inReads.filter((keys) => keys.length === 1 && keys[0] === key).length >= 2);
  });

  it("re-reads similar keys that the shared cap cut off", async () => {
    const ownKey = "card-own";
    const ownAt = "2026-01-01T00:00:00.000Z";
    const later = "2026-10-02T00:00:00.000Z";
    const rows: CacheRow[] = [
      { query_key: ownKey, item_id: "own-1", price: 40, fetched_at: ownAt, title: "own" },
      { query_key: ownKey, item_id: "own-2", price: 55, fetched_at: ownAt, title: "own" },
    ];
    const similar: string[] = [];
    for (let card = 0; card < 9; card += 1) {
      const key = `similar-${card}`;
      similar.push(key);
      for (let sale = 0; sale < 60; sale += 1) {
        rows.push({
          query_key: key,
          item_id: `sim-${card}-${sale}`,
          price: 10 + sale,
          fetched_at: later,
          title: "similar",
        });
      }
    }

    const { client } = cacheClient(rows);
    const batches = await readNewestBatches(client, [ownKey, ...similar], [ownKey]);
    assert.deepEqual(
      batches.get(ownKey)?.map((row) => row.item_id).sort(),
      ["own-1", "own-2"],
    );
    for (const key of similar) {
      assert.equal(batches.get(key)?.length, 60, key);
    }
  });

  it("reads exact-key chunks with a small concurrency limit", async () => {
    const keys: string[] = [];
    const rows: CacheRow[] = [];
    const chunkCount = PRICE_BATCH_READ_CONCURRENCY + 1;
    const keyCount = chunkCount * 2;
    for (let index = 0; index < keyCount; index += 1) {
      const key = `copy-${index}`;
      keys.push(key);
      rows.push({
        query_key: key,
        item_id: `row-${index}`,
        price: 20,
        fetched_at: "2026-10-02T00:00:00.000Z",
        title: "copy",
      });
    }

    const { client, peakReads } = cacheClient(rows);
    const batches = await readNewestBatches(client, keys, keys);
    assert.equal(batches.get(keys[0])?.length, 1);
    assert.equal(peakReads(), PRICE_BATCH_READ_CONCURRENCY);
    assert.ok(peakReads() < chunkCount);
  });
});

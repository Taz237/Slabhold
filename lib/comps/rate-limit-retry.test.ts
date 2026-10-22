import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RATE_LIMIT_BURST_ATTEMPTS,
  allowsAfterLostWrite,
  consumeBucketWithStore,
  lostWriteBackoffMs,
  type BucketRead,
  type BucketRow,
  type BucketStore,
} from "./rate-limit-loop";

const WINDOW = "2026-10-17T18:00:00.000Z";

function row(
  bucket: string,
  table: BucketRow["table"] = "comps_rate_limits",
): BucketRow {
  return {
    table,
    subjectColumn: table === "anon_rate_limits" ? "subject" : "user_id",
    subject: "user-1",
    bucket,
    windowStart: WINDOW,
  };
}

function yieldingCas() {
  let count: number | null = null;
  let conflicts = 0;
  const store: BucketStore = {
    async read() {
      await tick();
      return { count };
    },
    async insert(_target, next) {
      await tick();
      if (count != null) {
        conflicts += 1;
        return { ok: false, conflict: true };
      }
      count = next;
      return { ok: true };
    },
    async update(_target, from, to) {
      await tick();
      if (count !== from) {
        conflicts += 1;
        return { ok: false, conflict: true };
      }
      count = to;
      return { ok: true };
    },
  };
  return {
    store,
    conflicts: () => conflicts,
    current: () => count ?? 0,
  };
}

function tick(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function conflictStore(count: number | null) {
  let reads = 0;
  let writes = 0;
  const seen: string[] = [];
  const store: BucketStore = {
    async read(target) {
      reads += 1;
      seen.push(target.bucket);
      return { count };
    },
    async insert(target) {
      writes += 1;
      seen.push(target.bucket);
      return { ok: false, conflict: true };
    },
    async update(target) {
      writes += 1;
      seen.push(target.bucket);
      return { ok: false, conflict: true };
    },
  };
  return { store, stats: () => ({ reads, writes, seen }) };
}

describe("rate limit retry loop", () => {
  it("blocks want_match and trawl after the last lost write and allows the other buckets", async () => {
    const cases: { target: BucketRow; limit: number; count: number | null; allowed: boolean }[] = [
      { target: row("want_match"), limit: 30, count: null, allowed: false },
      { target: row("trawl"), limit: 5, count: 1, allowed: false },
      { target: row("requests"), limit: 20, count: 3, allowed: true },
      { target: row("card_values"), limit: 120, count: 4, allowed: true },
      {
        target: row("card_values", "anon_rate_limits"),
        limit: 60,
        count: null,
        allowed: true,
      },
    ];
    for (const item of cases) {
      const { store, stats } = conflictStore(item.count);
      const sleeps: number[] = [];
      const rolls = [0.1, 0.9, 0, 0.5, 0.25, 0.75, 0.4];
      let roll = 0;
      const allowed = await consumeBucketWithStore(store, item.target, item.limit, {
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        random: () => rolls[roll++] ?? 0,
      });
      const label = `${item.target.table}:${item.target.bucket}`;
      assert.equal(allowsAfterLostWrite(item.target.bucket), item.allowed, label);
      assert.equal(allowed, item.allowed, label);
      assert.equal(stats().reads, RATE_LIMIT_BURST_ATTEMPTS, label);
      assert.equal(stats().writes, RATE_LIMIT_BURST_ATTEMPTS, label);
      assert.equal(sleeps.length, RATE_LIMIT_BURST_ATTEMPTS - 1, label);
      assert.deepEqual(new Set(stats().seen), new Set([item.target.bucket]));
      for (let index = 0; index < sleeps.length; index += 1) {
        const expected = lostWriteBackoffMs(index + 1, () => rolls[index] ?? 0);
        assert.equal(sleeps[index], expected, label);
        assert.ok((sleeps[index] ?? 0) >= 4);
        assert.ok((sleeps[index] ?? 0) < 4 * (index + 1) + 8);
      }
    }
  });

  it("still blocks a bucket that is already at its limit", async () => {
    const cases = [
      { bucket: "want_match", limit: 30 },
      { bucket: "requests", limit: 20 },
      { bucket: "card_values", limit: 120 },
    ];
    for (const item of cases) {
      const { store, stats } = conflictStore(item.limit);
      const sleeps: number[] = [];
      const allowed = await consumeBucketWithStore(store, row(item.bucket), item.limit, {
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      });
      assert.equal(allowed, false, item.bucket);
      assert.equal(stats().reads, 1, item.bucket);
      assert.equal(stats().writes, 0, item.bucket);
      assert.equal(sleeps.length, 0, item.bucket);
    }
  });

  it("allows a read error and a non-conflict write error", async () => {
    const readError: BucketStore = {
      async read(): Promise<BucketRead> {
        return { count: null, error: "down" };
      },
      async insert() {
        throw new Error("unused");
      },
      async update() {
        throw new Error("unused");
      },
    };
    assert.equal(await consumeBucketWithStore(readError, row("want_match"), 30), true);

    let writes = 0;
    const writeError: BucketStore = {
      async read() {
        return { count: 1 };
      },
      async insert() {
        return { ok: true };
      },
      async update() {
        writes += 1;
        return { ok: false, conflict: false, error: "write failed" };
      },
    };
    const sleeps: number[] = [];
    assert.equal(
      await consumeBucketWithStore(writeError, row("requests"), 20, {
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      }),
      true,
    );
    assert.equal(writes, 1);
    assert.equal(sleeps.length, 0);
  });

  it("allows at most 30 of 40 parallel want_match calls", async () => {
    const { store, conflicts, current } = yieldingCas();
    const results = await Promise.all(
      Array.from({ length: 40 }, () =>
        consumeBucketWithStore(store, row("want_match"), 30, {
          sleep: async () => {
            await tick();
          },
          random: () => 0.5,
        }),
      ),
    );
    const allowed = results.filter(Boolean).length;
    assert.ok(conflicts() > 0);
    assert.ok(allowed >= 1);
    assert.ok(allowed <= 30, String(allowed));
    assert.ok(current() <= 30);
    assert.equal(allowed, current());
  });

  it("lets 10 parallel comps requests under the limit pass after lost writes", async () => {
    const { store, conflicts, current } = yieldingCas();
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        consumeBucketWithStore(store, row("requests"), 20, {
          sleep: async () => {
            await tick();
          },
          random: () => 0.5,
        }),
      ),
    );

    assert.equal(results.length, 10);
    assert.equal(
      results.every((allowed) => allowed),
      true,
    );
    assert.ok(conflicts() > 0);
    assert.equal(current(), 8);
  });

  it("blocks none of 20 parallel card value calls under the limit", async () => {
    const { store, conflicts, current } = yieldingCas();
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        consumeBucketWithStore(store, row("card_values"), 120, {
          sleep: async () => {
            await tick();
          },
          random: () => 0.5,
        }),
      ),
    );

    assert.equal(results.length, 20);
    assert.equal(
      results.every((allowed) => allowed),
      true,
    );
    assert.ok(conflicts() > 0);
    assert.ok(current() >= 1);
    assert.ok(current() <= 20);
  });
});

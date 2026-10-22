import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RATE_LIMIT_BURST_ATTEMPTS,
  consumeBucketWithStore,
  lostWriteBackoffMs,
  type BucketRead,
  type BucketRow,
  type BucketStore,
} from "./rate-limit-loop";

const WINDOW = "2026-10-17T18:00:00.000Z";

function row(bucket: string): BucketRow {
  return {
    table: "comps_rate_limits",
    subjectColumn: "user_id",
    subject: "user-1",
    bucket,
    windowStart: WINDOW,
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
  it("allows want_match and comps requests after the last lost write", async () => {
    const cases = [
      { bucket: "want_match", limit: 30, count: null },
      { bucket: "requests", limit: 20, count: 3 },
    ];
    for (const item of cases) {
      const { store, stats } = conflictStore(item.count);
      const sleeps: number[] = [];
      const rolls = [0.1, 0.9, 0, 0.5, 0.25, 0.75, 0.4];
      let roll = 0;
      const allowed = await consumeBucketWithStore(store, row(item.bucket), item.limit, {
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        random: () => rolls[roll++] ?? 0,
      });
      assert.equal(allowed, true, item.bucket);
      assert.equal(stats().reads, RATE_LIMIT_BURST_ATTEMPTS, item.bucket);
      assert.equal(stats().writes, RATE_LIMIT_BURST_ATTEMPTS, item.bucket);
      assert.equal(sleeps.length, RATE_LIMIT_BURST_ATTEMPTS - 1, item.bucket);
      assert.deepEqual(new Set(stats().seen), new Set([item.bucket]));
      for (let index = 0; index < sleeps.length; index += 1) {
        const expected = lostWriteBackoffMs(index + 1, () => rolls[index] ?? 0);
        assert.equal(sleeps[index], expected, item.bucket);
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

  it("does not block 20 parallel card value requests under the limit", async () => {
    let count: number | null = null;
    let conflicts = 0;
    const store: BucketStore = {
      async read(target) {
        assert.equal(target.bucket, "card_values");
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

    assert.equal(
      results.every((allowed) => allowed),
      true,
    );
    assert.equal(results.length, 20);
    assert.ok(conflicts > 0);
    assert.ok((count ?? 0) >= 1);
    assert.ok((count ?? 0) <= 20);
  });
});

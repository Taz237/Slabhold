import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { handleSubscribe } from "./handlers";
import {
  MAX_DEVICES,
  createSubscriptionWriter,
  sameSecret,
  type SubscriptionRowInput,
  type SubscriptionTable,
} from "./subscribe-writer";

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/shared-device";
const KEYS = { p256dh: "B".repeat(87), auth: "a".repeat(22) };

type Row = SubscriptionRowInput & { id: string; failure_count: number; created_at: string };

/** push_subscriptions in memory, unique on endpoint, with hooks to simulate races. */
class FakeTable implements SubscriptionTable {
  rows: Row[] = [];
  finds = 0;
  clock = Date.parse("2026-10-30T18:00:00.000Z");
  beforeDelete: (() => void) | null = null;
  private seq = 0;

  now = () => new Date((this.clock += 1000)).toISOString();

  seed(row: Partial<Row> & { user_id: string; endpoint: string }) {
    const full: Row = {
      id: `s${++this.seq}`,
      p256dh: KEYS.p256dh,
      auth: KEYS.auth,
      platform: "android",
      user_agent: null,
      failure_count: 0,
      created_at: this.now(),
      ...row,
    };
    this.rows.push(full);
    return full;
  }

  async find(endpoint: string) {
    this.finds += 1;
    const row = this.rows.find((item) => item.endpoint === endpoint);
    return { row: row ? { user_id: row.user_id, p256dh: row.p256dh, auth: row.auth } : null, error: null };
  }
  async insert(row: SubscriptionRowInput & { failure_count: 0; created_at: string }) {
    if (this.rows.some((item) => item.endpoint === row.endpoint)) return { error: "duplicate key", duplicate: true };
    this.rows.push({ ...row, id: `s${++this.seq}` });
    return { error: null };
  }
  async update(endpoint: string, userId: string, patch: Partial<Row>) {
    const row = this.rows.find((item) => item.endpoint === endpoint && item.user_id === userId);
    if (!row) return { error: null, count: 0 };
    Object.assign(row, patch);
    return { error: null, count: 1 };
  }
  async deleteOwned(endpoint: string, userId: string, auth: string) {
    this.beforeDelete?.();
    this.beforeDelete = null;
    const before = this.rows.length;
    this.rows = this.rows.filter((item) => !(item.endpoint === endpoint && item.user_id === userId && item.auth === auth));
    return { error: null, count: before - this.rows.length };
  }
  async idsNewestFirst(userId: string) {
    return this.rows
      .filter((item) => item.user_id === userId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((item) => item.id);
  }
  async deleteIds(ids: readonly string[]) {
    this.rows = this.rows.filter((item) => !ids.includes(item.id));
  }
  async remove(userId: string, endpoint: string) {
    this.rows = this.rows.filter((item) => !(item.user_id === userId && item.endpoint === endpoint));
    return { error: null };
  }
}

let table: FakeTable;

function subscribe(userId: string, keys = KEYS, endpoint = ENDPOINT) {
  return handleSubscribe({
    available: true,
    userId,
    body: { endpoint, keys, platform: "ios" },
    userAgent: "Mozilla/5.0",
    writer: createSubscriptionWriter(table),
  });
}

beforeEach(() => {
  table = new FakeTable();
});

describe("push subscribe writer", () => {
  it("inserts a new endpoint for the caller", async () => {
    const result = await subscribe("u1");
    assert.equal(result.status, 200);
    assert.equal(table.rows.length, 1);
    assert.equal(table.rows[0]!.user_id, "u1");
    assert.equal(table.rows[0]!.platform, "ios");
  });

  it("updates the caller's own endpoint in place", async () => {
    const row = table.seed({ user_id: "u1", endpoint: ENDPOINT, platform: "android", failure_count: 3 });
    const newKeys = { p256dh: "C".repeat(87), auth: "b".repeat(22) };
    assert.equal((await subscribe("u1", newKeys)).status, 200);
    assert.equal(table.rows.length, 1);
    assert.equal(table.rows[0]!.id, row.id);
    assert.equal(table.rows[0]!.p256dh, newKeys.p256dh);
    assert.equal(table.rows[0]!.auth, newKeys.auth);
    assert.equal(table.rows[0]!.platform, "ios");
    assert.equal(table.rows[0]!.user_agent, "Mozilla/5.0");
    assert.equal(table.rows[0]!.failure_count, 0);
  });

  it("moves a shared device to the new user when both keys match", async () => {
    table.seed({ user_id: "u1", endpoint: ENDPOINT });
    assert.equal((await subscribe("u2")).status, 200);
    assert.equal(table.rows.length, 1);
    assert.equal(table.rows[0]!.user_id, "u2");
  });

  for (const [label, keys] of [
    ["a different auth", { ...KEYS, auth: "z".repeat(22) }],
    ["a different p256dh", { ...KEYS, p256dh: "Z".repeat(87) }],
    ["a shorter auth", { ...KEYS, auth: "a".repeat(16) }],
  ] as const) {
    it(`refuses another user's endpoint with ${label}, and leaves the row alone`, async () => {
      const row = table.seed({ user_id: "u1", endpoint: ENDPOINT, platform: "android" });
      const snapshot = { ...row };
      const result = await subscribe("u2", keys);
      assert.equal(result.status, 409);
      assert.deepEqual(result.body, {
        error: "This device is linked to another account. Turn notifications off and on again.",
      });
      assert.deepEqual(table.rows, [snapshot]);
    });
  }

  it("re-reads once when the row changed between the read and the delete", async () => {
    table.seed({ user_id: "u1", endpoint: ENDPOINT });
    // u1's sign-out lands mid-move: the row is gone when we delete.
    table.beforeDelete = () => {
      table.rows = [];
    };
    assert.equal((await subscribe("u2")).status, 200);
    assert.equal(table.finds, 2);
    assert.equal(table.rows.length, 1);
    assert.equal(table.rows[0]!.user_id, "u2");
  });

  it("re-reads after a race and refuses when a third account now holds it with other keys", async () => {
    table.seed({ user_id: "u1", endpoint: ENDPOINT });
    table.beforeDelete = () => {
      table.rows = [];
      table.seed({ user_id: "u3", endpoint: ENDPOINT, auth: "q".repeat(22) });
    };
    assert.equal((await subscribe("u2")).status, 409);
    assert.equal(table.finds, 2);
    assert.equal(table.rows[0]!.user_id, "u3");
  });

  it("keeps the 10-device cap, dropping the oldest", async () => {
    for (let i = 0; i < MAX_DEVICES; i++) table.seed({ user_id: "u1", endpoint: `${ENDPOINT}-${i}` });
    const oldest = table.rows[0]!.id;
    table.seed({ user_id: "u2", endpoint: ENDPOINT });
    assert.equal((await subscribe("u1")).status, 200);
    const mine = table.rows.filter((row) => row.user_id === "u1");
    assert.equal(mine.length, MAX_DEVICES);
    assert.ok(!mine.some((row) => row.id === oldest));
    assert.ok(mine.some((row) => row.endpoint === ENDPOINT));
  });

  it("removes only the caller's own row", async () => {
    table.seed({ user_id: "u1", endpoint: ENDPOINT });
    const writer = createSubscriptionWriter(table);
    await writer.remove("u2", ENDPOINT);
    assert.equal(table.rows.length, 1);
    await writer.remove("u1", ENDPOINT);
    assert.equal(table.rows.length, 0);
  });

  it("compares secrets by value and length", () => {
    assert.equal(sameSecret("abc", "abc"), true);
    assert.equal(sameSecret("abc", "abd"), false);
    assert.equal(sameSecret("abc", "abcd"), false);
  });
});

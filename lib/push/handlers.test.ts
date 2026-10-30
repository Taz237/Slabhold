import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gateFlush, gateTest, handleSubscribe, handleUnsubscribe, type SubscriptionWriter } from "./handlers";

const body = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) },
  platform: "android",
};

function writer() {
  const rows = new Map<string, { user_id: string }>();
  const store: SubscriptionWriter = {
    async upsert(row) {
      rows.set(row.endpoint, row);
      return { error: null };
    },
    async remove(userId, endpoint) {
      if (rows.get(endpoint)?.user_id === userId) rows.delete(endpoint);
      return { error: null };
    },
  };
  return { rows, store };
}

const allow = async () => true;
const deny = async () => false;

describe("push routes", () => {
  it("no-ops everything while push is off", async () => {
    const { store } = writer();
    assert.deepEqual((await handleSubscribe({ available: false, userId: "u1", body, userAgent: null, writer: store })).body, {
      ok: true,
      available: false,
    });
    assert.equal((await gateFlush({ available: false, userId: "u1", consume: allow })).run, false);
    assert.equal((await gateTest({ available: false, userId: "u1", consume: allow })).run, false);
  });

  it("needs a signed-in user", async () => {
    const { store } = writer();
    assert.equal((await handleSubscribe({ available: true, userId: null, body, userAgent: null, writer: store })).status, 401);
    assert.equal((await gateFlush({ available: true, userId: null, consume: allow })).status, 401);
  });

  it("refuses endpoints outside the allowlist", async () => {
    const { store, rows } = writer();
    const result = await handleSubscribe({
      available: true,
      userId: "u1",
      body: { ...body, endpoint: "https://169.254.169.254/latest" },
      userAgent: null,
      writer: store,
    });
    assert.equal(result.status, 400);
    assert.equal(rows.size, 0);
  });

  it("moves a shared device's endpoint to the new user, and removes it on sign-out", async () => {
    const { store, rows } = writer();
    await handleSubscribe({ available: true, userId: "u1", body, userAgent: "x".repeat(400), writer: store });
    assert.equal(rows.get(body.endpoint)?.user_id, "u1");
    assert.equal((rows.get(body.endpoint) as { user_agent?: string }).user_agent?.length, 200);
    await handleSubscribe({ available: true, userId: "u2", body, userAgent: null, writer: store });
    assert.equal(rows.get(body.endpoint)?.user_id, "u2");
    // The old user can't remove the new user's device.
    await handleUnsubscribe({ available: true, userId: "u1", body: { endpoint: body.endpoint }, writer: store });
    assert.equal(rows.size, 1);
    await handleUnsubscribe({ available: true, userId: "u2", body: { endpoint: body.endpoint }, writer: store });
    assert.equal(rows.size, 0);
  });

  it("rate-limits flush and test per caller", async () => {
    assert.equal((await gateFlush({ available: true, userId: "u1", consume: allow })).status, 202);
    assert.equal((await gateFlush({ available: true, userId: "u1", consume: deny })).status, 429);
    assert.equal((await gateTest({ available: true, userId: "u1", consume: deny })).status, 429);
  });
});

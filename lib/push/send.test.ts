import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { singlePayload } from "./payload";
import { DM_TTL_SECONDS, SOCIAL_TTL_SECONDS, deliver, pushTopic, sendOptions, type WebPushSender } from "./send";

const config = { publicKey: "pub", privateKey: "priv", subject: "mailto:team@example.com" };
const subs = [
  { id: "s1", endpoint: "https://fcm.googleapis.com/fcm/send/1", p256dh: "k", auth: "a" },
];
const payload = singlePayload({
  kind: "like",
  actor: { id: "a1", displayName: "Jordan Hale", username: "jordanhale", avatarUrl: null },
  postId: "p1",
  text: "Prizm Luka",
  showPreviews: true,
  badge: 1,
  ts: 1,
});

function webPushError(statusCode: number) {
  return Object.assign(new Error(`status ${statusCode}`), { statusCode, headers: {} });
}

/** A mocked web-push that answers with the queued status codes in order. */
function fakeSender(answers: (number | "network")[]) {
  const calls: { endpoint: string; body: string; ttl: number; urgency: string }[] = [];
  const sender: WebPushSender = {
    async sendNotification(subscription, body, options) {
      calls.push({ endpoint: subscription.endpoint, body, ttl: options.TTL, urgency: options.urgency });
      const answer = answers.shift() ?? 201;
      if (answer === "network") throw new Error("socket hang up");
      if (answer >= 400) throw webPushError(answer);
      return { statusCode: answer };
    },
  };
  return { sender, calls };
}

const noSleep = async () => {};

describe("push send error handling", () => {
  it("delivers on 201", async () => {
    const { sender, calls } = fakeSender([201]);
    const result = await deliver({ sender, config, subscriptions: subs, payload, sleep: noSleep });
    assert.deepEqual(result, { delivered: ["s1"], gone: [], failed: [] });
    assert.equal(calls.length, 1);
    assert.equal(JSON.parse(calls[0]!.body).title, "Jordan Hale");
  });

  for (const status of [404, 410]) {
    it(`marks the subscription gone on ${status} without retrying`, async () => {
      const { sender, calls } = fakeSender([status]);
      const result = await deliver({ sender, config, subscriptions: subs, payload, sleep: noSleep });
      assert.deepEqual(result.gone, ["s1"]);
      assert.equal(calls.length, 1);
    });
  }

  for (const status of [429, 500, 503, "network"] as const) {
    it(`retries once after ${status}, then fails`, async () => {
      const waits: number[] = [];
      const { sender, calls } = fakeSender([status, status]);
      const result = await deliver({
        sender,
        config,
        subscriptions: subs,
        payload,
        sleep: async (ms) => {
          waits.push(ms);
        },
      });
      assert.deepEqual(result.failed, ["s1"]);
      assert.equal(calls.length, 2);
      assert.equal(waits.length, 1);
      assert.ok(waits[0]! > 0);
    });
  }

  it("succeeds when the one retry works", async () => {
    const { sender, calls } = fakeSender([503, 201]);
    const result = await deliver({ sender, config, subscriptions: subs, payload, sleep: noSleep });
    assert.deepEqual(result.delivered, ["s1"]);
    assert.equal(calls.length, 2);
  });

  it("resends a shorter body once after 413", async () => {
    const long = { ...payload, body: "x".repeat(500) };
    const { sender, calls } = fakeSender([413, 201]);
    const result = await deliver({ sender, config, subscriptions: subs, payload: long, sleep: noSleep });
    assert.deepEqual(result.delivered, ["s1"]);
    assert.ok(JSON.parse(calls[1]!.body).body.length <= 40);
  });

  it("does not retry other 4xx", async () => {
    const { sender, calls } = fakeSender([403]);
    const result = await deliver({ sender, config, subscriptions: subs, payload, sleep: noSleep });
    assert.deepEqual(result.failed, ["s1"]);
    assert.equal(calls.length, 1);
  });

  it("uses a day of TTL for social, four for DMs, and high urgency only for DMs", () => {
    const social = sendOptions(payload, config);
    assert.equal(social.TTL, SOCIAL_TTL_SECONDS);
    assert.equal(social.urgency, "normal");
    const dm = sendOptions({ ...payload, kind: "dm" }, config);
    assert.equal(dm.TTL, DM_TTL_SECONDS);
    assert.equal(dm.urgency, "high");
    assert.match(pushTopic("like:6f9a1c3e-1111-4222-8333-944455556666"), /^[A-Za-z0-9_-]{32}$/);
  });
});

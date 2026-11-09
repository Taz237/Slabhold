import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ApnsDevice, ApnsSender } from "./apns";
import { deliverToUser, processRow, type Dispatcher, type OutboxRow, type PushStore, type SendContext } from "./dispatch";
import { pushGroupKey } from "./group";
import { testPayload, type PushPayload } from "./payload";
import { DEFAULT_PREFS } from "./prefs";
import type { DeliveryResult, PushSubscriptionRow, WebPushSender } from "./send";

const ME = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const T0 = Date.parse("2026-11-06T18:00:00.000Z");
const config = { publicKey: "pub", privateKey: "priv", subject: "mailto:team@example.com" };
const WEB_SUB: PushSubscriptionRow = { id: "s1", endpoint: "https://fcm.googleapis.com/fcm/send/1", p256dh: "k", auth: "a" };
const IPHONE: ApnsDevice = { id: "i1", token: "ab".repeat(32) };

function followRow(): OutboxRow {
  return {
    id: "o1",
    recipientId: ME,
    actorId: ACTOR,
    kind: "follow",
    postId: null,
    notificationId: "n1",
    messageId: null,
    createdAt: new Date(T0).toISOString(),
    status: "pending",
    sentAt: null,
    attempts: 1,
    groupKey: pushGroupKey("follow", null, ACTOR),
  };
}

/**
 * A minimal store: one recipient with `web` subscriptions and `iphones`.
 * The context's subscriptionCount counts both, as the Supabase store does.
 */
function store(input: { web?: PushSubscriptionRow[]; iphones?: ApnsDevice[]; apnsError?: boolean; apns?: boolean }) {
  const marks: { ids: readonly string[]; status: string }[] = [];
  const records: { web: DeliveryResult[]; apns: DeliveryResult[] } = { web: [], apns: [] };
  let apnsReads = 0;
  const web = input.web ?? [];
  const iphones = input.iphones ?? [];
  const apnsOn = input.apns !== false;
  const readIphones = async () => {
    apnsReads += 1;
    if (input.apnsError) throw new Error('relation "push_apns_devices" does not exist');
    return iphones;
  };
  const value: PushStore = {
    async claimForActor() {
      return [];
    },
    async claimOverdue() {
      return [];
    },
    async context(): Promise<SendContext> {
      // Mirrors supabasePushStore: a table error counts as zero iPhones.
      const iphoneCount = apnsOn && web.length === 0 ? await readIphones().then((rows) => rows.length, () => 0) : 0;
      return {
        sourceExists: true,
        recipientExists: true,
        actor: { id: ACTOR, displayName: "Jordan Hale", username: "jordanhale", avatarUrl: null },
        post: null,
        text: null,
        messageKind: null,
        blocked: false,
        muted: false,
        prefs: DEFAULT_PREFS,
        subscriptionCount: web.length + iphoneCount,
        badge: 0,
      };
    },
    async groupState() {
      return { lastPushAt: null, sentLastMinute: 0, sentLastHour: 0, dmUnread: 0 };
    },
    async groupRows() {
      return [];
    },
    async mark(ids, status) {
      marks.push({ ids, status });
    },
    async subscriptions() {
      return web;
    },
    async recordDelivery(result) {
      records.web.push(result);
    },
    async actors() {
      return [];
    },
    async dueTails() {
      return [];
    },
    async takeLease() {
      return true;
    },
    async releaseLease() {},
    async prune() {},
    ...(apnsOn
      ? {
          apnsDevices: readIphones,
          async recordApnsDelivery(result: DeliveryResult) {
            records.apns.push(result);
          },
        }
      : {}),
  };
  return { value, marks, records, apnsReads: () => apnsReads };
}

function webSender(status = 201) {
  const calls: string[] = [];
  const sender: WebPushSender = {
    async sendNotification(subscription) {
      calls.push(subscription.endpoint);
      if (status >= 400) throw Object.assign(new Error("x"), { statusCode: status, headers: {} });
      return { statusCode: status };
    },
  };
  return { sender, calls };
}

function apnsSender(answer: "delivered" | "gone" | "failed" = "delivered") {
  const calls: { devices: readonly ApnsDevice[]; payload: PushPayload }[] = [];
  const sender: ApnsSender = {
    async send(devices, payload) {
      calls.push({ devices, payload });
      const ids = devices.map((device) => device.id);
      return { delivered: answer === "delivered" ? ids : [], gone: answer === "gone" ? ids : [], failed: answer === "failed" ? ids : [] };
    },
  };
  return { sender, calls };
}

function dispatcher(parts: Partial<Dispatcher> & { store: PushStore }): Dispatcher {
  return { sender: webSender().sender, config, now: () => T0 + 1000, sleep: async () => {}, ...parts };
}

describe("dispatch with the iPhone app (APNs)", () => {
  it("sends to an APNs-only recipient instead of skipping it as no_subscriptions", async () => {
    const s = store({ iphones: [IPHONE] });
    const apns = apnsSender();
    await processRow(dispatcher({ store: s.value, apns: apns.sender }), followRow());
    assert.equal(apns.calls.length, 1);
    assert.deepEqual(apns.calls[0]!.devices, [IPHONE]);
    assert.equal(apns.calls[0]!.payload.kind, "follow");
    assert.deepEqual(s.marks.at(-1), { ids: ["o1"], status: "sent" });
    assert.deepEqual(s.records.apns, [{ delivered: ["i1"], gone: [], failed: [] }]);
  });

  it("sends to web and iPhone together", async () => {
    const s = store({ web: [WEB_SUB], iphones: [IPHONE] });
    const web = webSender();
    const apns = apnsSender();
    await processRow(dispatcher({ store: s.value, sender: web.sender, apns: apns.sender }), followRow());
    assert.equal(web.calls.length, 1);
    assert.equal(apns.calls.length, 1);
    assert.deepEqual(s.marks.at(-1), { ids: ["o1"], status: "sent" });
  });

  it("counts as delivered when either channel delivers", async () => {
    const s = store({ web: [WEB_SUB], iphones: [IPHONE] });
    await processRow(dispatcher({ store: s.value, sender: webSender(500).sender, apns: apnsSender().sender }), followRow());
    assert.deepEqual(s.marks.at(-1), { ids: ["o1"], status: "sent" });
  });

  it("leaves web-only recipients exactly as before, with no APNs calls when APNs is off", async () => {
    const s = store({ web: [WEB_SUB], iphones: [IPHONE] });
    const web = webSender();
    await processRow(dispatcher({ store: s.value, sender: web.sender, apns: null }), followRow());
    assert.equal(web.calls.length, 1);
    assert.deepEqual(s.marks.at(-1), { ids: ["o1"], status: "sent" });
    assert.deepEqual(s.records.apns, []);
  });

  it("makes zero APNs calls or reads when APNs is off, and skips a recipient with only iPhones", async () => {
    const s = store({ iphones: [IPHONE], apns: false });
    const apns = apnsSender();
    await processRow(dispatcher({ store: s.value, apns: undefined }), followRow());
    assert.equal(apns.calls.length, 0);
    assert.equal(s.apnsReads(), 0);
    assert.deepEqual(s.marks.at(-1), { ids: ["o1"], status: "skipped" });
  });

  it("still sends web push when the APNs table errors", async () => {
    const s = store({ web: [WEB_SUB], apnsError: true });
    const web = webSender();
    const apns = apnsSender();
    await processRow(dispatcher({ store: s.value, sender: web.sender, apns: apns.sender }), followRow());
    assert.equal(web.calls.length, 1);
    assert.equal(apns.calls.length, 0);
    assert.deepEqual(s.marks.at(-1), { ids: ["o1"], status: "sent" });
  });

  it("skips (not fails) when the APNs table errors and there is no web subscription", async () => {
    const s = store({ apnsError: true });
    await processRow(dispatcher({ store: s.value, apns: apnsSender().sender }), followRow());
    assert.deepEqual(s.marks.at(-1), { ids: ["o1"], status: "skipped" });
  });

  it("sends APNs alone when VAPID is off", async () => {
    const s = store({ web: [WEB_SUB], iphones: [IPHONE] });
    const web = webSender();
    const apns = apnsSender();
    await processRow(dispatcher({ store: s.value, sender: web.sender, config: null, apns: apns.sender }), followRow());
    assert.equal(web.calls.length, 0);
    assert.equal(apns.calls.length, 1);
    assert.deepEqual(s.marks.at(-1), { ids: ["o1"], status: "sent" });
  });

  it("records gone iPhones so the store deletes them", async () => {
    const s = store({ iphones: [IPHONE] });
    await processRow(dispatcher({ store: s.value, apns: apnsSender("gone").sender }), followRow());
    assert.deepEqual(s.records.apns, [{ delivered: [], gone: ["i1"], failed: [] }]);
    assert.deepEqual(s.marks.at(-1), { ids: ["o1"], status: "skipped" });
  });

  it("marks failed when the only iPhone fails", async () => {
    const s = store({ iphones: [IPHONE] });
    await processRow(dispatcher({ store: s.value, apns: apnsSender("failed").sender }), followRow());
    assert.deepEqual(s.marks.at(-1), { ids: ["o1"], status: "failed" });
  });

  it("the Settings test reaches both lists, and reports no devices when both are empty", async () => {
    const both = store({ web: [WEB_SUB], iphones: [IPHONE] });
    const result = await deliverToUser(dispatcher({ store: both.value, apns: apnsSender().sender }), ME, testPayload(T0), T0);
    assert.deepEqual(result, { devices: 2, delivered: 2, gone: 0, failed: 0 });
    const none = store({});
    const empty = await deliverToUser(dispatcher({ store: none.value, apns: apnsSender().sender }), ME, testPayload(T0), T0);
    assert.equal(empty.devices, 0);
  });
});

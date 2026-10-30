import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  flushForActor,
  processRow,
  runTail,
  runTailsWhenDue,
  sweepTails,
  type GroupRow,
  type GroupState,
  type OutboxRow,
  type OutboxStatus,
  type PushStore,
  type SendContext,
} from "./dispatch";
import { pushGroupKey } from "./group";
import { DEFAULT_PREFS, type NotificationPrefs, type SourceKind } from "./prefs";
import type { PushActor, PushPayload } from "./payload";
import type { DeliveryResult, PushSubscriptionRow, WebPushSender } from "./send";

const ME = "11111111-1111-4111-8111-111111111111";
const POST = "22222222-2222-4222-8222-222222222222";
const T0 = Date.parse("2026-10-30T18:00:00.000Z");
const config = { publicKey: "pub", privateKey: "priv", subject: "mailto:team@example.com" };

const NAMES = ["Jordan Hale", "Maya Chen", "Sam Ortiz", "Lee Park", "Ava Brooks", "Noah Diaz", "Zoe Kim", "Eli Ross"];

/** An in-memory outbox with the same rules as the SQL functions. */
class FakeStore implements PushStore {
  now = T0;
  rows: OutboxRow[] = [];
  sources = new Set<string>();
  people = new Map<string, PushActor>();
  blocks = new Set<string>();
  mutes = new Set<string>();
  hiddenPosts = new Set<string>();
  deletedPosts = new Set<string>();
  prefs = new Map<string, NotificationPrefs>();
  subs = new Map<string, PushSubscriptionRow[]>();
  unreadDms = 0;
  leases = new Map<string, number>();
  removed: string[] = [];
  private seq = 0;

  constructor() {
    NAMES.forEach((name, index) => {
      const id = `a${index}`;
      this.people.set(id, { id, displayName: name, username: name.toLowerCase().replace(" ", ""), avatarUrl: null });
    });
    this.people.set(ME, { id: ME, displayName: "Me", username: "me", avatarUrl: null });
    this.subs.set(ME, [{ id: "s1", endpoint: "https://fcm.googleapis.com/fcm/send/1", p256dh: "k", auth: "a" }]);
  }

  add(kind: SourceKind, actorId: string, at = this.now, postId: string | null = kind === "follow" || kind === "dm" ? null : POST) {
    const id = `o${++this.seq}`;
    const sourceId = `src${this.seq}`;
    this.sources.add(sourceId);
    const row: OutboxRow = {
      id,
      recipientId: ME,
      actorId,
      kind,
      postId,
      notificationId: kind === "dm" ? null : sourceId,
      messageId: kind === "dm" ? sourceId : null,
      createdAt: new Date(at).toISOString(),
      status: "pending",
      sentAt: null,
      attempts: 0,
      groupKey: pushGroupKey(kind, postId, actorId),
    };
    this.rows.push(row);
    return row;
  }

  sourceOf(row: OutboxRow) {
    return (row.notificationId ?? row.messageId)!;
  }

  private valid(row: OutboxRow) {
    return (
      this.sources.has(this.sourceOf(row)) &&
      Boolean(row.actorId && this.people.has(row.actorId)) &&
      !this.blocks.has(`${row.actorId}|${row.recipientId}`) &&
      !this.blocks.has(`${row.recipientId}|${row.actorId}`) &&
      !this.mutes.has(`${row.recipientId}|${row.actorId}`)
    );
  }

  async claimForActor(actorId: string) {
    const claimed = this.rows.filter(
      (row) => row.status === "pending" && row.actorId === actorId && this.now - Date.parse(row.createdAt) < 10 * 60_000,
    );
    for (const row of claimed) row.attempts += 1;
    return claimed.map((row) => ({ ...row }));
  }
  async claimOverdue() {
    return [];
  }
  async context(row: OutboxRow): Promise<SendContext | null> {
    const post = row.postId && !this.deletedPosts.has(row.postId) ? { hidden: this.hiddenPosts.has(row.postId) } : null;
    return {
      sourceExists: this.sources.has(this.sourceOf(row)),
      recipientExists: true,
      actor: (row.actorId && this.people.get(row.actorId)) || null,
      post,
      text: row.kind === "dm" ? "Still have the Wemby?" : "Pulled a 2018 Prizm Luka silver",
      messageKind: row.kind === "dm" ? "text" : null,
      blocked: this.blocks.has(`${row.actorId}|${row.recipientId}`) || this.blocks.has(`${row.recipientId}|${row.actorId}`),
      muted: this.mutes.has(`${row.recipientId}|${row.actorId}`),
      prefs: this.prefs.get(row.recipientId) ?? DEFAULT_PREFS,
      subscriptionCount: this.subs.get(row.recipientId)?.length ?? 0,
      badge: 7,
    };
  }
  async groupState(recipientId: string, groupKey: string): Promise<GroupState> {
    const sent = this.rows.filter((row) => row.recipientId === recipientId && row.status === "sent" && row.sentAt);
    const inGroup = sent.filter((row) => row.groupKey === groupKey).map((row) => row.sentAt!).sort();
    const age = (row: OutboxRow) => this.now - Date.parse(row.sentAt!);
    return {
      lastPushAt: inGroup.at(-1) ?? null,
      sentLastMinute: sent.filter((row) => age(row) < 60_000).length,
      sentLastHour: sent.filter((row) => age(row) < 3_600_000).length,
      dmUnread: this.unreadDms,
    };
  }
  async groupRows(recipientId: string, groupKey: string): Promise<GroupRow[]> {
    return this.rows
      .filter((row) => row.recipientId === recipientId && row.groupKey === groupKey)
      .filter((row) => row.status === "sent" || row.status === "collapsed")
      .map((row) => ({ ...row, valid: this.valid(row) }));
  }
  async mark(ids: readonly string[], status: OutboxStatus, sentAt: string | null) {
    for (const row of this.rows) {
      if (ids.includes(row.id)) {
        row.status = status;
        row.sentAt = sentAt;
      }
    }
  }
  async subscriptions(recipientId: string) {
    return this.subs.get(recipientId) ?? [];
  }
  async recordDelivery(result: DeliveryResult) {
    this.removed.push(...result.gone);
    for (const [user, list] of this.subs) this.subs.set(user, list.filter((sub) => !result.gone.includes(sub.id)));
  }
  async actors(ids: readonly string[]) {
    return ids.map((id) => this.people.get(id)).filter((actor): actor is PushActor => Boolean(actor));
  }
  async dueTails() {
    const keys = new Map<string, { recipientId: string; groupKey: string }>();
    for (const row of this.rows) {
      if (row.status === "collapsed" && row.sentAt === null) {
        keys.set(`${row.recipientId}|${row.groupKey}`, { recipientId: row.recipientId, groupKey: row.groupKey });
      }
    }
    return [...keys.values()];
  }
  async takeLease(recipientId: string, groupKey: string, seconds: number) {
    const key = `${recipientId}|${groupKey}`;
    if ((this.leases.get(key) ?? 0) > this.now) return false;
    this.leases.set(key, this.now + seconds * 1000);
    return true;
  }
  async releaseLease(recipientId: string, groupKey: string) {
    this.leases.delete(`${recipientId}|${groupKey}`);
  }
  async prune() {}
}

let store: FakeStore;
let sent: PushPayload[];
let answer: number;

const sender: WebPushSender = {
  async sendNotification(_subscription, body) {
    if (answer >= 400) throw Object.assign(new Error("push service"), { statusCode: answer });
    sent.push(JSON.parse(body) as PushPayload);
    return { statusCode: answer };
  },
};

function dispatcher() {
  return { store, sender, config, now: () => store.now, sleep: async () => {} };
}

async function flushAll() {
  for (const actor of new Set(store.rows.filter((row) => row.status === "pending").map((row) => row.actorId!))) {
    await flushForActor(dispatcher(), actor);
  }
}

beforeEach(() => {
  store = new FakeStore();
  sent = [];
  answer = 201;
});

describe("push dispatch", () => {
  it("sends a single like at once", async () => {
    store.add("like", "a0");
    const { counts } = await flushForActor(dispatcher(), "a0");
    assert.equal(counts.sent, 1);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.title, "Jordan Hale");
    assert.equal(sent[0]!.body, "liked your post\nPulled a 2018 Prizm Luka silver");
    assert.equal(sent[0]!.badge, 7);
    assert.equal(sent[0]!.renotify, true);
    assert.equal(store.rows[0]!.status, "sent");
  });

  it("sends the first of five likes, collapses the rest, then one quiet summary", async () => {
    for (let i = 0; i < 5; i++) {
      store.now = T0 + i * 10_000;
      store.add("like", `a${i}`);
      await flushAll();
    }
    assert.equal(sent.length, 1);
    assert.deepEqual(store.rows.map((row) => row.status), ["sent", "collapsed", "collapsed", "collapsed", "collapsed"]);

    store.now = T0 + 40_000;
    assert.equal(await runTail(dispatcher(), ME, `like:${POST}`), "not_due");
    store.now = T0 + 60_000;
    assert.equal(await runTail(dispatcher(), ME, `like:${POST}`), "sent");
    assert.equal(sent.length, 2);
    const summary = sent[1]!;
    assert.equal(summary.title, "Slabhold");
    assert.equal(summary.body, "Ava Brooks and 4 others liked your post");
    assert.equal(summary.renotify, false);
    assert.equal(summary.tag, `like:${POST}`);
    assert.equal(summary.url, `/posts/${POST}`);
    // The summary ran once: a second tail has nothing left.
    assert.equal(await runTail(dispatcher(), ME, `like:${POST}`), "empty");
  });

  it("leaves unliked actors out of the summary count", async () => {
    const rows = [];
    for (let i = 0; i < 5; i++) {
      store.now = T0 + i * 5_000;
      rows.push(store.add("like", `a${i}`));
      await flushAll();
    }
    store.sources.delete(store.sourceOf(rows[2]!));
    store.sources.delete(store.sourceOf(rows[4]!));
    store.now = T0 + 61_000;
    await sweepTails(dispatcher());
    assert.equal(sent.at(-1)!.body, "Lee Park and 2 others liked your post");
  });

  it("sends nothing when every collapsed actor is gone", async () => {
    store.add("like", "a0");
    await flushAll();
    store.now += 5_000;
    const second = store.add("like", "a1");
    await flushAll();
    store.sources.delete(store.sourceOf(second));
    store.now = T0 + 65_000;
    assert.equal(await runTail(dispatcher(), ME, `like:${POST}`), "skipped");
    assert.equal(sent.length, 1);
  });

  it("collapses three DMs into '3 new messages from' the sender", async () => {
    for (let i = 0; i < 3; i++) {
      store.now = T0 + i * 3_000;
      store.add("dm", "a0");
      await flushAll();
    }
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.body, "Still have the Wemby?");
    assert.equal(sent[0]!.url, "/messages/jordanhale");
    store.unreadDms = 3;
    store.now = T0 + 60_000;
    await runTail(dispatcher(), ME, "dm:a0");
    assert.equal(sent[1]!.title, "Jordan Hale");
    assert.equal(sent[1]!.body, "3 new messages from Jordan Hale");
    assert.equal(sent[1]!.renotify, false);
  });

  it("skips a DM summary once the chat was read", async () => {
    store.add("dm", "a0");
    await flushAll();
    store.now += 2_000;
    store.add("dm", "a0");
    await flushAll();
    store.unreadDms = 0;
    store.now = T0 + 62_000;
    assert.equal(await runTail(dispatcher(), ME, "dm:a0"), "skipped");
    assert.equal(sent.length, 1);
  });

  it("runs the trailing summary from the flush's after() once the window closes", async () => {
    store.add("like", "a0");
    await flushAll();
    store.now += 20_000;
    store.add("like", "a1");
    const { tails } = await flushForActor(dispatcher(), "a1");
    assert.equal(tails.length, 1);
    assert.equal(tails[0]!.dueAt, T0 + 60_000);
    const waits: number[] = [];
    await runTailsWhenDue(
      {
        ...dispatcher(),
        sleep: async (ms) => {
          waits.push(ms);
          store.now += ms;
        },
      },
      tails,
      50_000,
    );
    assert.deepEqual(waits, [40_000]);
    assert.equal(sent.at(-1)!.body, "Maya Chen and Jordan Hale liked your post");
  });
});

describe("push safety at send time", () => {
  const cases: [string, () => void][] = [
    ["self", () => store.add("like", ME)],
    ["blocked by the recipient", () => (store.blocks.add(`${ME}|a0`), store.add("like", "a0"))],
    ["blocked by the actor", () => (store.blocks.add(`a0|${ME}`), store.add("like", "a0"))],
    ["muted", () => (store.mutes.add(`${ME}|a0`), store.add("like", "a0"))],
    ["hidden post", () => (store.hiddenPosts.add(POST), store.add("like", "a0"))],
    ["deleted post", () => (store.deletedPosts.add(POST), store.add("like", "a0"))],
    ["deleted source row (unlike)", () => store.sources.delete(store.sourceOf(store.add("like", "a0")))],
    ["deleted source row (unfollow)", () => store.sources.delete(store.sourceOf(store.add("follow", "a0")))],
    ["deleted message", () => store.sources.delete(store.sourceOf(store.add("dm", "a0")))],
    ["deleted actor", () => (store.people.delete("a0"), store.add("like", "a0"))],
    ["type turned off", () => (store.prefs.set(ME, { ...DEFAULT_PREFS, like: false }), store.add("like", "a0"))],
    [
      "quiet hours",
      () => (
        store.prefs.set(ME, { ...DEFAULT_PREFS, quietEnabled: true, quietStart: "13:00", quietEnd: "15:00" }),
        store.add("like", "a0")
      ),
    ],
    ["no subscriptions", () => (store.subs.set(ME, []), store.add("like", "a0"))],
    ["stale row", () => store.add("like", "a0", T0 - 11 * 60_000)],
  ];

  for (const [label, setup] of cases) {
    it(`skips: ${label}`, async () => {
      setup();
      const row = store.rows[0]!;
      await processRow(dispatcher(), row);
      assert.equal(sent.length, 0);
      assert.equal(store.rows[0]!.status, "skipped");
    });
  }

  it("still pushes a different type when one is off", async () => {
    store.prefs.set(ME, { ...DEFAULT_PREFS, like: false });
    store.add("follow", "a0");
    await flushAll();
    assert.equal(sent[0]!.body, "followed you");
    assert.equal(sent[0]!.url, "/u/jordanhale");
  });
});

describe("push rate limits per recipient", () => {
  it("sends six in a minute and collapses the seventh into a later summary", async () => {
    for (let i = 0; i < 7; i++) {
      store.now = T0 + i * 1_000;
      store.add("like", `a${i}`, store.now, `post-${i}`);
      await flushAll();
    }
    assert.equal(sent.length, 6);
    assert.equal(store.rows[6]!.status, "collapsed");
    // Never dropped: it goes out once the minute has passed.
    store.now = T0 + 61_000;
    await sweepTails(dispatcher());
    assert.equal(sent.length, 7);
    assert.equal(sent[6]!.title, "Zoe Kim");
    assert.equal(sent[6]!.renotify, false);
  });
});

describe("push delivery bookkeeping", () => {
  it("deletes a subscription on 410 and marks the row skipped", async () => {
    answer = 410;
    store.add("like", "a0");
    await flushAll();
    assert.deepEqual(store.removed, ["s1"]);
    assert.equal(store.rows[0]!.status, "skipped");
  });

  it("marks the row failed after a 5xx and its retry", async () => {
    answer = 502;
    store.add("like", "a0");
    await flushAll();
    assert.equal(store.rows[0]!.status, "failed");
    assert.deepEqual(store.removed, []);
  });

  it("does not send a lead while another sender holds the group", async () => {
    await store.takeLease(ME, `like:${POST}`, 30);
    store.add("like", "a0");
    await flushAll();
    assert.equal(sent.length, 0);
    assert.equal(store.rows[0]!.status, "collapsed");
  });
});

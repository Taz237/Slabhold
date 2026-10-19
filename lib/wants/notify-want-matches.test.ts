import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { money } from "@/lib/format";
import { fairLowFromPrices } from "./effective-target";
import {
  notifyWantMatches,
  type WantAlertDb,
  type WantAlertInsert,
  type WantMatchEvent,
  type WantNotificationInsert,
  type WantRow,
} from "./notify-want-matches";

const NOW = new Date("2026-10-17T18:00:00.000Z");

function want(partial: Partial<WantRow> = {}): WantRow {
  return {
    id: "want-1",
    userId: "wanter",
    cardKey: "jordan|2020|select|47|base|psa 10",
    targetPrice: 35,
    createdAt: "2026-10-01T00:00:00.000Z",
    sourceCardId: "card-1",
    ...partial,
  };
}

function sale(partial: Partial<WantMatchEvent> = {}): WantMatchEvent {
  return {
    sourceType: "sale",
    sourceId: "item-31",
    cardKey: "jordan|2020|select|47|base|psa 10",
    cardId: "card-1",
    actorId: null,
    actorUsername: null,
    label: "Jordan Love PSA 10",
    href: "/cards/card-1",
    soldAt: "2026-10-16T12:00:00.000Z",
    price: 31,
    now: NOW,
    ...partial,
  };
}

function memoryDb(seed?: { wants?: WantRow[]; alerts?: WantAlertInsert[] }) {
  const wants = seed?.wants ?? [want()];
  const alerts: WantAlertInsert[] = [...(seed?.alerts ?? [])];
  const notifications: WantNotificationInsert[] = [];
  const db: WantAlertDb = {
    async wantsForKey(cardKey) {
      return wants.filter((row) => row.cardKey === cardKey);
    },
    async alertsToday(userId, sinceIso) {
      return alerts.filter((row) => row.userId === userId && row.createdAt >= sinceIso).length;
    },
    async insertAlert(row) {
      const exists = alerts.some(
        (item) =>
          item.wantId === row.wantId &&
          item.sourceType === row.sourceType &&
          item.sourceId === row.sourceId &&
          (item.cardId ?? "") === (row.cardId ?? ""),
      );
      if (exists) return false;
      alerts.push(row);
      return true;
    },
    async insertNotification(row) {
      notifications.push(row);
    },
    async deleteAlert(wantId, sourceType, sourceId, cardId) {
      const index = alerts.findIndex(
        (item) =>
          item.wantId === wantId &&
          item.sourceType === sourceType &&
          item.sourceId === sourceId &&
          (item.cardId ?? "") === (cardId ?? ""),
      );
      if (index >= 0) alerts.splice(index, 1);
    },
  };
  return { db, alerts, notifications };
}

describe("notifyWantMatches", () => {
  it("notifies a sale under the target", async () => {
    const { db, notifications } = memoryDb();
    const count = await notifyWantMatches(sale(), db);
    assert.equal(count, 1);
    assert.equal(notifications.length, 1);
    assert.equal(
      notifications[0]?.preview,
      "Jordan Love PSA 10 sold for $31.00, at or under your $35.00 target",
    );
    assert.equal(notifications[0]?.metadata?.source, "sale");
    assert.equal(notifications[0]?.metadata?.sale_price, 31);
    assert.equal(notifications[0]?.metadata?.target, 35);
    assert.equal(money(31), "$31.00");
  });

  it("alerts when the sale equals the target", async () => {
    const { db, notifications } = memoryDb();
    const count = await notifyWantMatches(sale({ price: 35, sourceId: "item-35" }), db);
    assert.equal(count, 1);
    assert.match(notifications[0]?.preview ?? "", /at or under your \$35\.00 target/);
  });

  it("uses the fair-price low when the target is empty", async () => {
    const { db, notifications } = memoryDb({
      wants: [want({ targetPrice: null })],
    });
    const under = await notifyWantMatches(sale({ price: 20, fairLow: 25, sourceId: "low" }), db);
    const over = await notifyWantMatches(sale({ price: 30, fairLow: 25, sourceId: "high" }), db);
    assert.equal(under, 1);
    assert.equal(over, 0);
    assert.equal(notifications[0]?.preview, "Jordan Love PSA 10 sold for $20.00, at or under your $25.00 target");
    assert.equal(fairLowFromPrices([]), null);
  });

  it("does not alert an empty target when there are no comps", async () => {
    const { db, notifications } = memoryDb({
      wants: [want({ targetPrice: null })],
    });
    const count = await notifyWantMatches(sale({ price: 10, fairLow: null, sourceId: "none" }), db);
    assert.equal(count, 0);
    assert.equal(notifications.length, 0);
  });

  it("does not alert a sale from before the want was created", async () => {
    const { db, notifications } = memoryDb();
    const count = await notifyWantMatches(
      sale({ soldAt: "2026-09-01T00:00:00.000Z", sourceId: "old" }),
      db,
    );
    assert.equal(count, 0);
    assert.equal(notifications.length, 0);
  });

  it("does not notify a sale over the target", async () => {
    const { db, notifications, alerts } = memoryDb();
    const count = await notifyWantMatches(sale({ price: 40, sourceId: "item-40" }), db);
    assert.equal(count, 0);
    assert.equal(notifications.length, 0);
    assert.equal(alerts.length, 0);
  });

  it("does not notify the same source twice", async () => {
    const { db, notifications } = memoryDb();
    await notifyWantMatches(sale(), db);
    const again = await notifyWantMatches(sale(), db);
    assert.equal(again, 0);
    assert.equal(notifications.length, 1);
  });

  it("does not notify you about your own post or listing", async () => {
    const { db, notifications } = memoryDb({
      wants: [want({ userId: "me" })],
    });
    const post = await notifyWantMatches(
      sale({
        sourceType: "post",
        sourceId: "post-1",
        actorId: "me",
        actorUsername: "me",
        price: null,
        soldAt: null,
      }),
      db,
    );
    const listing = await notifyWantMatches(
      sale({
        sourceType: "listing",
        sourceId: "card-9",
        actorId: "me",
        actorUsername: "me",
        price: null,
        soldAt: null,
      }),
      db,
    );
    assert.equal(post, 0);
    assert.equal(listing, 0);
    assert.equal(notifications.length, 0);
  });

  it("mail day alerts only followers with a matching want", async () => {
    function mail(partial: Partial<WantMatchEvent> = {}): WantMatchEvent {
      return sale({
        sourceType: "post",
        sourceId: "post-1",
        actorId: "poster",
        actorUsername: "poster",
        price: null,
        soldAt: null,
        mailDay: true,
        followersOnly: true,
        cardIsPublic: true,
        cardValue: 30,
        ...partial,
      });
    }

    const followed = memoryDb();
    followed.db.isFollower = async (userId, actorId) => userId === "wanter" && actorId === "poster";
    const count = await notifyWantMatches(mail(), followed.db);
    assert.equal(count, 1);
    assert.equal(
      followed.notifications[0]?.preview,
      "@poster just got a Jordan Love PSA 10 you want, below your $35.00 target",
    );
    assert.equal(followed.notifications[0]?.metadata?.flag, "below");
    assert.equal(followed.notifications[0]?.metadata?.source, "mail_day");

    const stranger = memoryDb();
    stranger.db.isFollower = async () => false;
    assert.equal(await notifyWantMatches(mail({ sourceId: "post-2" }), stranger.db), 0);

    const privateCard = memoryDb();
    privateCard.db.isFollower = async () => true;
    const privateCount = await notifyWantMatches(
      mail({ sourceId: "post-private", cardIsPublic: false, cardValue: 30 }),
      privateCard.db,
    );
    assert.equal(privateCount, 1);
    assert.equal(
      privateCard.notifications[0]?.preview,
      "@poster just got a Jordan Love PSA 10 you want",
    );
    assert.equal(privateCard.notifications[0]?.metadata?.flag, undefined);
    assert.equal(privateCard.notifications[0]?.metadata?.value, undefined);

    const at = memoryDb();
    at.db.isFollower = async () => true;
    await notifyWantMatches(mail({ sourceId: "post-at", cardValue: 35 }), at.db);
    assert.match(at.notifications[0]?.preview ?? "", /at your \$35\.00 target/);
    const above = memoryDb();
    above.db.isFollower = async () => true;
    await notifyWantMatches(mail({ sourceId: "post-above", cardValue: 40 }), above.db);
    assert.match(above.notifications[0]?.preview ?? "", /above your \$35\.00 target/);
  });

  it("alerts once per matching card and skips a re-run", async () => {
    const db = memoryDb({
      wants: [
        want({ id: "want-a", cardKey: "card-a" }),
        want({ id: "want-b", cardKey: "card-b" }),
      ],
    });
    db.db.isFollower = async () => true;
    function mail(cardId: string, cardKey: string): WantMatchEvent {
      return sale({
        sourceType: "post",
        sourceId: "post-1",
        cardId,
        cardKey,
        actorId: "poster",
        actorUsername: "poster",
        price: null,
        soldAt: null,
        mailDay: true,
        followersOnly: true,
        cardIsPublic: true,
        cardValue: 30,
      });
    }
    assert.equal(await notifyWantMatches(mail("card-a", "card-a"), db.db), 1);
    assert.equal(await notifyWantMatches(mail("card-b", "card-b"), db.db), 1);
    assert.equal(await notifyWantMatches(mail("card-a", "card-a"), db.db), 0);
    assert.equal(db.notifications.length, 2);
    assert.deepEqual(
      db.alerts.map((row) => row.cardId),
      ["card-a", "card-b"],
    );

    const own = memoryDb({ wants: [want({ userId: "poster", cardKey: "card-a" })] });
    own.db.isFollower = async () => true;
    assert.equal(
      await notifyWantMatches(mail("card-a", "card-a"), own.db),
      0,
    );
  });

  it("does not notify a blocked or muted actor", async () => {
    const blocked = memoryDb();
    blocked.db.safety = {
      async isBlocked() {
        return true;
      },
    };
    const blockedCount = await notifyWantMatches(
      sale({
        sourceType: "post",
        sourceId: "post-blocked",
        actorId: "seller",
        actorUsername: "seller",
        price: null,
        soldAt: null,
      }),
      blocked.db,
    );
    assert.equal(blockedCount, 0);
    assert.equal(blocked.notifications.length, 0);
    assert.equal(blocked.alerts.length, 0);

    const muted = memoryDb();
    muted.db.isFollower = async () => true;
    muted.db.safety = {
      async isBlocked() {
        return false;
      },
      async isMuted() {
        return true;
      },
    };
    const mutedCount = await notifyWantMatches(
      sale({
        sourceType: "post",
        sourceId: "post-muted",
        actorId: "seller",
        actorUsername: "seller",
        price: null,
        soldAt: null,
        mailDay: true,
        followersOnly: true,
      }),
      muted.db,
    );
    assert.equal(mutedCount, 0);
    assert.equal(muted.notifications.length, 0);

    const clear = memoryDb();
    clear.db.safety = {
      async isBlocked() {
        return false;
      },
    };
    const clearCount = await notifyWantMatches(
      sale({
        sourceType: "listing",
        sourceId: "card-clear",
        actorId: "seller",
        actorUsername: "seller",
        price: null,
        soldAt: null,
      }),
      clear.db,
    );
    assert.equal(clearCount, 1);
    assert.equal(clear.notifications.length, 1);
  });

  it("holds the daily cap at 20", async () => {
    const existing = Array.from({ length: 20 }, (_, index) => ({
      wantId: "want-1",
      userId: "wanter",
      sourceType: "sale" as const,
      sourceId: `old-${index}`,
      createdAt: "2026-10-17T16:00:00.000Z",
    }));
    const { db, notifications, alerts } = memoryDb({ alerts: existing });
    const count = await notifyWantMatches(sale({ sourceId: "item-new" }), db);
    assert.equal(count, 0);
    assert.equal(notifications.length, 0);
    assert.equal(alerts.length, 20);
  });
});

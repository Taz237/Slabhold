import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
          item.sourceId === row.sourceId,
      );
      if (exists) return false;
      alerts.push(row);
      return true;
    },
    async insertNotification(row) {
      notifications.push(row);
    },
    async deleteAlert(wantId, sourceType, sourceId) {
      const index = alerts.findIndex(
        (item) =>
          item.wantId === wantId && item.sourceType === sourceType && item.sourceId === sourceId,
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
      "Jordan Love PSA 10 sold for $31.00, under your $35.00 target",
    );
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

  it("does not notify a blocked actor", async () => {
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

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { routeAccess } from "@/lib/auth/route-access";
import { alignedRetryAfterSeconds } from "@/lib/comps/rate-window";
import { cardIdentityKey } from "@/lib/social/card-identity";
import { missingCheckForPath, pathIsMissing } from "@/lib/social/missing-route";
import { cardPageAccessDecision } from "@/lib/value/card-page-access";
import { postWantMatch, WANT_MATCH_RATE_LIMIT_MESSAGE } from "./match-request";
import {
  notifyWantMatches,
  WANT_ACTOR_CARD_COOLDOWN_MS,
  type WantAlertDb,
  type WantAlertInsert,
  type WantMatchEvent,
  type WantNotificationInsert,
  type WantRow,
  type WantSourceType,
} from "./notify-want-matches";
import { ownedCardWantEvent } from "./owned-card";

const NOW = new Date("2026-10-17T18:00:00.000Z");
const ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const WANTER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CARD = "ba95893e-89fe-4735-be3f-1509b6b6f3b9";
const COPY = "ca95893e-89fe-4735-be3f-1509b6b6f3b9";
const LATER = "da95893e-89fe-4735-be3f-1509b6b6f3b9";

const IDENTITY = {
  playerName: "Jordan Love",
  year: 2020,
  yearLabel: "2020",
  setBrand: "Select",
  cardNumber: "47",
  parallel: "Base",
  grade: "PSA 10",
  conditionType: "graded" as const,
};

const KEY = cardIdentityKey(IDENTITY);

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function tick(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function memoryDb(options?: { pause?: boolean; fixedCreatedAt?: string; wants?: WantRow[] }) {
  const wants: WantRow[] = options?.wants ?? [
    {
      id: "want-1",
      userId: WANTER,
      cardKey: KEY,
      targetPrice: 35,
      createdAt: "2026-10-01T00:00:00.000Z",
      sourceCardId: CARD,
    },
  ];
  const alerts: WantAlertInsert[] = [];
  const notifications: (WantNotificationInsert & { id: string; createdAt: string })[] = [];
  let noteSeq = 0;
  const pause = async () => {
    if (options?.pause) await tick();
  };
  const db: WantAlertDb = {
    async wantsForKey(cardKey) {
      await pause();
      return wants.filter((row) => row.cardKey === cardKey);
    },
    async alertsToday(userId, sinceIso) {
      await pause();
      return alerts.filter((row) => row.userId === userId && row.createdAt >= sinceIso).length;
    },
    async insertAlert(row) {
      await pause();
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
      await pause();
      noteSeq += 1;
      const id = `n-${String(noteSeq).padStart(4, "0")}`;
      const createdAt = options?.fixedCreatedAt ?? new Date(NOW.getTime() + noteSeq).toISOString();
      notifications.push({ ...row, id, createdAt });
      return { id, createdAt };
    },
    async deleteNotification(id) {
      await pause();
      const index = notifications.findIndex((row) => row.id === id);
      if (index >= 0) notifications.splice(index, 1);
    },
    async actorCardAlerts(query) {
      await pause();
      return notifications
        .filter(
          (row) =>
            row.recipientId === query.userId &&
            row.actorId === query.actorId &&
            row.createdAt >= query.sinceIso,
        )
        .map((row) => ({ id: row.id, createdAt: row.createdAt, metadata: row.metadata ?? null }));
    },
    async deleteAlert(wantId, sourceType, sourceId, cardId) {
      await pause();
      const index = alerts.findIndex(
        (item) =>
          item.wantId === wantId &&
          item.sourceType === sourceType &&
          item.sourceId === sourceId &&
          (item.cardId ?? "") === (cardId ?? ""),
      );
      if (index >= 0) alerts.splice(index, 1);
    },
    async isFollower(userId, actorId) {
      await pause();
      return userId === WANTER && (actorId === ACTOR || actorId === OTHER);
    },
  };
  return { db, alerts, notifications };
}

function cardEvent(cardId: string, now: Date, actorId = ACTOR): WantMatchEvent {
  const event = ownedCardWantEvent({
    actorId,
    card: { ...IDENTITY, id: cardId, isPublic: true, category: "pc" },
    username: "ada",
    band: { median: 30, low: 25 },
  });
  if (!event) throw new Error("expected a card alert");
  return { ...event, now };
}

function actorEvent(
  sourceType: Exclude<WantSourceType, "sale" | "card">,
  sourceId: string,
  actorId: string,
): WantMatchEvent {
  return {
    sourceType,
    sourceId,
    cardKey: KEY,
    cardId: sourceId,
    actorId,
    actorUsername: "ada",
    label: "Jordan Love PSA 10",
    href: sourceType === "post" ? `/posts/${sourceId}` : `/u/ada/cards/${sourceId}`,
    now: NOW,
  };
}

function sale(sourceId: string): WantMatchEvent {
  return {
    sourceType: "sale",
    sourceId,
    cardKey: KEY,
    cardId: CARD,
    actorId: null,
    actorUsername: null,
    label: "Jordan Love PSA 10",
    href: `/cards/${CARD}`,
    soldAt: "2026-10-16T12:00:00.000Z",
    price: 31,
    now: NOW,
  };
}

function matchRequest(sourceType: "card" | "listing" | "post", sourceId = CARD) {
  return new Request("https://slabhold.app/api/wants/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceType, sourceId }),
  });
}

describe("want alert spam", () => {
  it("does not send a second alert when a deleted card is re-added within 24 hours", async () => {
    const { db, notifications } = memoryDb();
    assert.equal(await notifyWantMatches(cardEvent(CARD, NOW), db), 1);
    const readded = await notifyWantMatches(
      cardEvent(COPY, new Date(NOW.getTime() + 60_000)),
      db,
    );
    assert.equal(readded, 0);
    assert.equal(notifications.length, 1);

    const afterWindow = await notifyWantMatches(
      cardEvent(LATER, new Date(NOW.getTime() + WANT_ACTOR_CARD_COOLDOWN_MS + 1000)),
      db,
    );
    assert.equal(afterWindow, 1);
    assert.equal(notifications.length, 2);
  });

  it("does not multi-alert copies of a card, listing, or post", async () => {
    const cards = memoryDb();
    assert.equal(await notifyWantMatches(cardEvent(CARD, NOW), cards.db), 1);
    assert.equal(await notifyWantMatches(cardEvent(COPY, NOW), cards.db), 0);
    assert.equal(await notifyWantMatches(actorEvent("listing", LATER, ACTOR), cards.db), 1);
    assert.equal(await notifyWantMatches(cardEvent(LATER, NOW, OTHER), cards.db), 1);
    assert.equal(cards.notifications.length, 3);

    const listings = memoryDb();
    assert.equal(await notifyWantMatches(actorEvent("listing", CARD, ACTOR), listings.db), 1);
    assert.equal(await notifyWantMatches(actorEvent("listing", COPY, ACTOR), listings.db), 0);
    assert.equal(listings.notifications.length, 1);

    const posts = memoryDb();
    assert.equal(await notifyWantMatches(actorEvent("post", CARD, ACTOR), posts.db), 1);
    assert.equal(await notifyWantMatches(actorEvent("post", COPY, ACTOR), posts.db), 0);
    assert.equal(posts.notifications.length, 1);

    function mail(cardId: string): WantMatchEvent {
      return {
        ...actorEvent("post", "post-1", ACTOR),
        cardId,
        mailDay: true,
        followersOnly: true,
        cardIsPublic: true,
        cardValue: 30,
      };
    }
    const mailDay = memoryDb();
    assert.equal(await notifyWantMatches(mail(CARD), mailDay.db), 1);
    assert.equal(await notifyWantMatches(mail(COPY), mailDay.db), 0);
    assert.equal(mailDay.notifications.length, 1);
  });

  it("sends a listing alert after a card alert for the same card", async () => {
    const { db, notifications } = memoryDb();
    assert.equal(await notifyWantMatches(cardEvent(CARD, NOW), db), 1);
    assert.equal(await notifyWantMatches(actorEvent("post", "post-1", ACTOR), db), 1);
    assert.equal(await notifyWantMatches(actorEvent("listing", COPY, ACTOR), db), 1);
    assert.deepEqual(
      notifications.map((row) => row.metadata?.source),
      ["card", "post", "listing"],
    );
  });

  it("keeps one notification when ten listing copies run together", async () => {
    const { db, notifications, alerts } = memoryDb({ pause: true });
    const counts = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        notifyWantMatches(actorEvent("listing", `copy-${index}`, ACTOR), db),
      ),
    );
    assert.equal(
      counts.reduce((sum, count) => sum + count, 0),
      1,
    );
    assert.equal(notifications.length, 1);
    assert.equal(alerts.length, 1);
  });

  it("keeps the lower id when two inserts share created_at", async () => {
    const fixed = "2026-10-17T18:00:00.000Z";
    const { db, notifications, alerts } = memoryDb({ pause: true, fixedCreatedAt: fixed });
    const counts = await Promise.all([
      notifyWantMatches(actorEvent("listing", "copy-a", ACTOR), db),
      notifyWantMatches(actorEvent("listing", "copy-b", ACTOR), db),
    ]);
    assert.equal(
      counts.reduce((sum, count) => sum + count, 0),
      1,
    );
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0]?.id, "n-0001");
    assert.equal(notifications[0]?.createdAt, fixed);
    assert.equal(alerts.length, 1);
  });

  it("keeps and counts the alert when the re-check read fails", async () => {
    const { db, notifications, alerts } = memoryDb();
    let reads = 0;
    const original = db.actorCardAlerts.bind(db);
    db.actorCardAlerts = async (query) => {
      reads += 1;
      if (reads > 1) throw new Error("re-check failed");
      return original(query);
    };
    assert.equal(await notifyWantMatches(actorEvent("listing", CARD, ACTOR), db), 1);
    assert.equal(notifications.length, 1);
    assert.equal(alerts.length, 1);
    assert.equal(reads, 2);
  });

  it("removes the alert row when notification cleanup throws and still alerts the next wanter", async () => {
    const wanterB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const { db, notifications, alerts } = memoryDb({
      wants: [
        {
          id: "want-1",
          userId: WANTER,
          cardKey: KEY,
          targetPrice: 35,
          createdAt: "2026-10-01T00:00:00.000Z",
          sourceCardId: CARD,
        },
        {
          id: "want-2",
          userId: wanterB,
          cardKey: KEY,
          targetPrice: 35,
          createdAt: "2026-10-01T00:00:00.000Z",
          sourceCardId: CARD,
        },
      ],
    });
    const originalAlerts = db.actorCardAlerts.bind(db);
    const originalDeleteNotification = db.deleteNotification.bind(db);
    let deletedAlerts = 0;
    db.actorCardAlerts = async (query) => {
      const rows = await originalAlerts(query);
      if (query.userId === WANTER && rows.length > 0) {
        return [
          {
            id: "n-0000",
            createdAt: "2026-10-17T17:00:00.000Z",
            metadata: rows[0]?.metadata ?? null,
          },
          ...rows,
        ];
      }
      return rows;
    };
    db.deleteNotification = async (id) => {
      const note = notifications.find((row) => row.id === id);
      if (note?.recipientId === WANTER) throw new Error("delete notification failed");
      await originalDeleteNotification(id);
    };
    const originalDeleteAlert = db.deleteAlert.bind(db);
    db.deleteAlert = async (wantId, sourceType, sourceId, cardId) => {
      deletedAlerts += 1;
      await originalDeleteAlert(wantId, sourceType, sourceId, cardId);
    };

    assert.equal(await notifyWantMatches(actorEvent("listing", CARD, ACTOR), db), 1);
    assert.equal(alerts.filter((row) => row.userId === WANTER).length, 0);
    assert.equal(deletedAlerts, 1);
    assert.equal(notifications.filter((row) => row.recipientId === wanterB).length, 1);
    assert.equal(alerts.filter((row) => row.userId === wanterB).length, 1);
  });

  it("still alerts the next wanter when alert cleanup throws", async () => {
    const wanterB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const { db, notifications } = memoryDb({
      wants: [
        {
          id: "want-1",
          userId: WANTER,
          cardKey: KEY,
          targetPrice: 35,
          createdAt: "2026-10-01T00:00:00.000Z",
          sourceCardId: CARD,
        },
        {
          id: "want-2",
          userId: wanterB,
          cardKey: KEY,
          targetPrice: 35,
          createdAt: "2026-10-01T00:00:00.000Z",
          sourceCardId: CARD,
        },
      ],
    });
    const originalInsert = db.insertNotification.bind(db);
    db.insertNotification = async (row) => {
      if (row.recipientId === WANTER) throw new Error("insert failed");
      return originalInsert(row);
    };
    db.deleteAlert = async (wantId) => {
      if (wantId === "want-1") throw new Error("delete alert failed");
    };

    assert.equal(await notifyWantMatches(actorEvent("listing", CARD, ACTOR), db), 1);
    assert.equal(notifications.filter((row) => row.recipientId === wanterB).length, 1);
  });

  it("still sends price-drop alerts", async () => {
    const { db, alerts, notifications } = memoryDb();
    assert.equal(await notifyWantMatches(cardEvent(CARD, NOW), db), 1);
    for (let index = 0; index < 19; index += 1) {
      assert.equal(await notifyWantMatches(cardEvent(`copy-${index}`, NOW), db), 0);
    }
    assert.equal(notifications.length, 1);
    assert.equal(await notifyWantMatches(sale("item-1"), db), 1);
    assert.equal(await notifyWantMatches(sale("item-2"), db), 1);
    assert.equal(notifications.filter((row) => row.metadata?.source === "sale").length, 2);
    assert.equal(alerts.length, 3);
  });

  it("returns 429 when want match requests pass the limit", async () => {
    const rate = read("lib/comps/rate-limit.ts");
    const route = read("app/api/wants/match/route.ts");
    const limitMatch = rate.match(/export const WANT_MATCH_LIMIT = (\d+)/);
    assert.ok(limitMatch);
    const limit = Number(limitMatch[1]);
    assert.equal(limit, 30);
    const windowSource = read("lib/comps/rate-window.ts");
    const matchRequestSource = read("lib/wants/match-request.ts");
    assert.match(windowSource, /export const WANT_MATCH_WINDOW_MS = 10 \* 60 \* 1000/);
    assert.equal(rate.includes("const WANT_MATCH_WINDOW_MS ="), false);
    assert.match(rate, /WANT_MATCH_WINDOW_MS/);
    assert.equal(matchRequestSource.includes("const WANT_MATCH_WINDOW_MS ="), false);
    assert.match(matchRequestSource, /WANT_MATCH_WINDOW_MS/);
    assert.match(rate, /const WANT_MATCH_BUCKET = "want_match"/);
    assert.match(rate, /function consumeWantMatchLimit[\s\S]*WANT_MATCH_BUCKET/);
    assert.match(rate, /function consumeWantMatchLimit[\s\S]*consumeRateLimit\(/);
    assert.match(route, /consumeWantMatchLimit/);
    assert.equal(route.includes("consumeRequestLimit"), false);

    const counts = new Map<string, number>();
    const calls: string[] = [];
    const deps = {
      getUserId: async () => WANTER,
      consumeLimit: async (userId: string) => {
        const current = counts.get(userId) ?? 0;
        if (current >= limit) return false;
        counts.set(userId, current + 1);
        return true;
      },
      notify: async (userId: string) => {
        calls.push(userId);
        return 0;
      },
    };

    for (let index = 0; index < limit; index += 1) {
      const res = await postWantMatch(matchRequest(index % 2 === 0 ? "card" : "listing"), deps);
      assert.equal(res.status, 200, `request ${index}`);
    }
    const windowMs = 10 * 60 * 1000;
    for (let extra = 0; extra < 3; extra += 1) {
      const before = Date.now();
      const blocked = await postWantMatch(matchRequest("post"), deps);
      const after = Date.now();
      assert.equal(blocked.status, 429);
      const retryAfter = Number(blocked.headers.get("Retry-After"));
      const earliest = alignedRetryAfterSeconds(windowMs, after);
      const latest = alignedRetryAfterSeconds(windowMs, before);
      assert.ok(retryAfter === earliest || retryAfter === latest, String(retryAfter));
      assert.deepEqual(await blocked.json(), { error: WANT_MATCH_RATE_LIMIT_MESSAGE });
    }
    const at = Date.parse("2026-10-17T18:03:00.000Z");
    assert.equal(alignedRetryAfterSeconds(windowMs, at), 420);
    assert.equal(calls.length, limit);

    const other = await postWantMatch(matchRequest("card"), {
      ...deps,
      getUserId: async () => OTHER,
    });
    assert.equal(other.status, 200);
    assert.equal(calls.length, limit + 1);
  });

  it("links an owned card with no username to a page the wanter can open", async () => {
    const event = ownedCardWantEvent({
      actorId: ACTOR,
      card: { ...IDENTITY, id: CARD, isPublic: true, category: "pc" },
      username: null,
      band: { median: 30, low: 25 },
    });
    assert.ok(event);
    assert.equal(event.href, `/cards/${CARD}/posts`);
    assert.notEqual(event.href, `/cards/${CARD}`);
    assert.equal(routeAccess(event.href), "public");
    assert.equal(routeAccess(`/cards/${CARD}`), "account");
    assert.equal(
      cardPageAccessDecision({ cardId: CARD, userId: WANTER, owned: false }),
      "notFound",
    );
    assert.equal(missingCheckForPath(event.href)?.kind, "card-posts");
    assert.equal(
      await pathIsMissing({
        pathname: event.href,
        supabaseUrl: "https://example.supabase.co",
        anonKey: "anon-key",
        cookies: [],
        fetchImpl: async () =>
          new Response(JSON.stringify([{ id: CARD }]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      }),
      false,
    );

    const named = ownedCardWantEvent({
      actorId: ACTOR,
      card: { ...IDENTITY, id: CARD, isPublic: true, category: "pc" },
      username: "@ada",
      band: null,
    });
    assert.equal(named?.href, `/u/ada/cards/${CARD}`);
    assert.equal(routeAccess(named?.href ?? ""), "public");

    const { db, notifications } = memoryDb();
    assert.equal(await notifyWantMatches({ ...event, now: NOW }, db), 1);
    assert.equal(notifications[0]?.href, `/cards/${CARD}/posts`);
    assert.equal(routeAccess(notifications[0]?.href ?? ""), "public");

    const owned = read("lib/wants/owned-card.ts");
    const dispatch = read("lib/wants/dispatch.ts");
    assert.match(owned, /wanterCardHref\(card\.id, username\)/);
    assert.doesNotMatch(owned, /`\/cards\/\$\{card\.id\}`/);
    assert.match(dispatch, /wanterCardHref\(card\.id, username\)/);
  });
});

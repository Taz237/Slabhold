import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { cardIdentityKey } from "@/lib/social/card-identity";
import { isPublicForSaleListing } from "./listing";
import {
  notifyWantMatches,
  type WantAlertDb,
  type WantAlertInsert,
  type WantMatchEvent,
  type WantNotificationInsert,
  type WantRow,
} from "./notify-want-matches";
import { ownedCardWantEvent, storedWantSourceType } from "./owned-card";

const NOW = new Date("2026-10-17T18:00:00.000Z");
const ACTOR = "owner";
const CARD = {
  id: "card-1",
  playerName: "Jordan Love",
  year: 2020,
  yearLabel: "2020",
  setBrand: "Select",
  cardNumber: "47",
  parallel: "Base",
  grade: "PSA 10",
  conditionType: "graded" as const,
  sellPrice: null,
  sellDate: null,
};

function card(partial: { isPublic: boolean; category: "pc" | "flipping" }) {
  return { ...CARD, ...partial };
}

function memoryDb() {
  const key = cardIdentityKey(CARD);
  const wants: WantRow[] = [
    {
      id: "want-1",
      userId: "wanter",
      cardKey: key,
      targetPrice: 35,
      createdAt: "2026-10-01T00:00:00.000Z",
      sourceCardId: CARD.id,
    },
  ];
  const alerts: WantAlertInsert[] = [];
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
    async deleteAlert() {
      return undefined;
    },
    async isFollower(userId, actorId) {
      return userId === "wanter" && actorId === ACTOR;
    },
  };
  return { db, notifications };
}

function listingEvent(sourceId: string): WantMatchEvent {
  return {
    sourceType: "listing",
    sourceId,
    cardKey: cardIdentityKey(CARD),
    cardId: sourceId,
    actorId: ACTOR,
    actorUsername: "ada",
    label: "Jordan Love PSA 10",
    href: `/u/ada/cards/${sourceId}`,
    now: NOW,
  };
}

/** What Add card asks the server to send. */
async function alertsForNewCard(
  next: ReturnType<typeof card>,
  db: WantAlertDb,
): Promise<number> {
  let count = 0;
  if (next.isPublic) {
    const event = ownedCardWantEvent({
      actorId: ACTOR,
      card: next,
      username: "ada",
      band: { median: 30, low: 25 },
    });
    if (event) count += await notifyWantMatches({ ...event, now: NOW }, db);
  }
  if (isPublicForSaleListing(next)) {
    count += await notifyWantMatches(listingEvent(next.id), db);
  }
  return count;
}

describe("owned card want alerts", () => {
  it("alerts followers when a public card is added", async () => {
    const { db, notifications } = memoryDb();
    const count = await alertsForNewCard(card({ isPublic: true, category: "pc" }), db);
    assert.equal(count, 1);
    assert.equal(notifications.length, 1);
    assert.equal(
      notifications[0]?.preview,
      "@ada just got a Jordan Love PSA 10 you want, below your $35.00 target",
    );
    assert.equal(notifications[0]?.href, "/u/ada/cards/card-1");
    assert.equal(notifications[0]?.metadata?.source, "card");
    assert.equal(notifications[0]?.metadata?.flag, "below");

    const stranger = memoryDb();
    stranger.db.isFollower = async () => false;
    assert.equal(
      await alertsForNewCard(card({ isPublic: true, category: "pc" }), stranger.db),
      0,
    );
    assert.equal(stranger.notifications.length, 0);
  });

  it("alerts no one for a private card", async () => {
    const { db, notifications } = memoryDb();
    const count = await alertsForNewCard(card({ isPublic: false, category: "pc" }), db);
    assert.equal(count, 0);
    assert.equal(notifications.length, 0);
    assert.equal(
      ownedCardWantEvent({
        actorId: ACTOR,
        card: card({ isPublic: false, category: "flipping" }),
        username: "ada",
        band: { median: 30, low: 25 },
      }),
      null,
    );
  });

  it("sends one alert when the new card is a public listing", async () => {
    const { db, notifications } = memoryDb();
    const listing = card({ isPublic: true, category: "flipping" });
    assert.equal(isPublicForSaleListing(listing), true);
    assert.equal(
      ownedCardWantEvent({
        actorId: ACTOR,
        card: listing,
        username: "ada",
        band: { median: 30, low: 25 },
      }),
      null,
    );
    const count = await alertsForNewCard(listing, db);
    assert.equal(count, 1);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0]?.metadata?.source, "listing");
  });

  it("stores a card alert as a post so the source check still holds", () => {
    assert.equal(storedWantSourceType("card"), "post");
    assert.equal(storedWantSourceType("listing"), "listing");
    assert.equal(storedWantSourceType("sale"), "sale");
    const db = readFileSync(join(process.cwd(), "lib/wants/want-db.ts"), "utf8");
    assert.match(db, /storedWantSourceType\(row\.sourceType\)/);
    assert.match(db, /storedWantSourceType\(sourceType\)/);

    const dispatch = readFileSync(join(process.cwd(), "lib/wants/dispatch.ts"), "utf8");
    const fn = dispatch.slice(dispatch.indexOf("export async function notifyOwnedCard"));
    assert.match(fn, /data\.user_id !== actorId\) return null/);
    assert.match(fn, /identityBand\(card, actorId\)/);
    assert.match(fn, /ownedCardWantEvent/);
    assert.match(fn, /notifyWantMatches\(event, db\)/);

    const route = readFileSync(join(process.cwd(), "app/api/wants/match/route.ts"), "utf8");
    assert.match(route, /sourceType !== "card"/);
    assert.match(route, /notifyOwnedCard\(userId, sourceId\)/);

    const provider = readFileSync(join(process.cwd(), "components/collection-provider.tsx"), "utf8");
    const addCard = provider.slice(
      provider.indexOf("const addCard = useCallback("),
      provider.indexOf("const updateCard = useCallback("),
    );
    assert.match(addCard, /if \(card\.isPublic\) pingWantMatch\("card", card\.id\)/);
    assert.match(addCard, /if \(isPublicForSaleListing\(card\)\) pingWantMatch\("listing", card\.id\)/);
    assert.doesNotMatch(
      provider.slice(provider.indexOf("const updateCard = useCallback(")),
      /pingWantMatch\("card"/,
    );
  });
});

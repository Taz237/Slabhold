import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectionDayChange,
  collectionTodayDismissKey,
  hasValuedMedians,
  shouldShowCollectionToday,
  topCollectionMovers,
} from "./today";

describe("collection today", () => {
  it("calculates the change from the previous snapshot day", () => {
    const change = collectionDayChange([
      { date: "2026-10-17", value: 112 },
      { date: "2026-10-15", value: 80 },
      { date: "2026-10-16", value: 100 },
    ]);
    assert.ok(change);
    assert.equal(change.latest, 112);
    assert.equal(change.previous, 100);
    assert.equal(change.delta, 12);
    assert.equal(change.latestDate, "2026-10-17");
    assert.equal(change.previousDate, "2026-10-16");
  });

  it("orders the top gainers and losers by dollar change", () => {
    const rows = [
      { cardId: "a", date: "2026-10-16", median: 10 },
      { cardId: "a", date: "2026-10-17", median: 40 },
      { cardId: "b", date: "2026-10-16", median: 10 },
      { cardId: "b", date: "2026-10-17", median: 25 },
      { cardId: "c", date: "2026-10-16", median: 10 },
      { cardId: "c", date: "2026-10-17", median: 20 },
      { cardId: "d", date: "2026-10-16", median: 5 },
      { cardId: "d", date: "2026-10-17", median: 6 },
      { cardId: "e", date: "2026-10-16", median: 50 },
      { cardId: "e", date: "2026-10-17", median: 10 },
      { cardId: "f", date: "2026-10-16", median: 20 },
      { cardId: "f", date: "2026-10-17", median: 5 },
      { cardId: "g", date: "2026-10-16", median: 10 },
      { cardId: "g", date: "2026-10-17", median: 8 },
      { cardId: "h", date: "2026-10-16", median: 9 },
      { cardId: "h", date: "2026-10-17", median: 1 },
    ];
    const { gainers, losers } = topCollectionMovers(rows, "2026-10-17", "2026-10-16");
    assert.deepEqual(
      gainers.map((row) => row.cardId),
      ["a", "b", "c"],
    );
    assert.deepEqual(
      losers.map((row) => row.cardId),
      ["e", "f", "h"],
    );
    assert.equal(gainers[0]?.delta, 30);
    assert.equal(losers[0]?.delta, -40);
  });

  it("hides when there are fewer than 2 snapshot days or no valued cards", () => {
    assert.equal(collectionDayChange([{ date: "2026-10-17", value: 10 }]), null);
    assert.equal(shouldShowCollectionToday(1, true), false);
    assert.equal(shouldShowCollectionToday(2, false), false);
    assert.equal(shouldShowCollectionToday(2, hasValuedMedians([null, null])), false);
    assert.equal(shouldShowCollectionToday(2, hasValuedMedians([null, 12])), true);
  });

  it("keys dismiss on the New York date", () => {
    assert.equal(
      collectionTodayDismissKey(new Date("2026-10-17T03:30:00.000Z")),
      "slabhold.collection-today.dismissed.2026-10-16",
    );
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addedMarkers,
  bestCard,
  collectionPoints,
  topMovers,
  type MoverCard,
} from "./value-series";

const TODAY = "2026-10-30";

describe("collectionPoints", () => {
  it("puts today's live value on top of saved days and adds what was added each day", () => {
    const points = collectionPoints(
      [
        { snapshot_date: "2026-10-28", value: 41 },
        { snapshot_date: "2026-10-29", value: 200 },
        { snapshot_date: TODAY, value: 260 },
      ],
      { today: TODAY, live: 285, markers: new Map([["2026-10-29", "+ Jordan Love PSA 10"]]) },
    );
    assert.deepEqual(points, [
      { date: "2026-10-28", value: 41, marker: null },
      { date: "2026-10-29", value: 200, marker: "+ Jordan Love PSA 10" },
      { date: TODAY, value: 285, marker: null },
    ]);
  });

  it("keeps the saved value for today when the live read is not ready", () => {
    const points = collectionPoints([{ snapshot_date: TODAY, value: 260 }], { today: TODAY, live: null });
    assert.deepEqual(points, [{ date: TODAY, value: 260, marker: null }]);
  });
});

describe("addedMarkers", () => {
  it("names the card added that day, or the first and a count", () => {
    const markers = addedMarkers([
      { playerName: "Jordan Love", grade: "PSA 10", createdAt: "2026-10-24T15:00:00Z" },
      { playerName: "Jaxson Dart", grade: "", createdAt: "2026-10-26T15:00:00Z" },
      { playerName: "Cam Ward", grade: "BGS 9.5", createdAt: "2026-10-26T16:00:00Z" },
      { playerName: "Travis Hunter", grade: "Raw", createdAt: "2026-10-26T17:00:00Z" },
    ]);
    assert.equal(markers.get("2026-10-24"), "+ Jordan Love PSA 10");
    assert.equal(markers.get("2026-10-26"), "+ Jaxson Dart and 2 more");
  });

  it("uses the New York day, like the snapshots", () => {
    const markers = addedMarkers([{ playerName: "A", grade: "", createdAt: "2026-10-25T02:00:00Z" }]);
    assert.equal(markers.get("2026-10-24"), "+ A");
  });
});

function card(id: string, paid: number | null, value: number | null, extra: Partial<MoverCard> = {}): MoverCard {
  return { id, playerName: id, paid, value, sold: false, ...extra };
}

describe("bestCard", () => {
  it("is the held card with the biggest gain over what was paid", () => {
    const best = bestCard([card("a", 10, 30), card("b", 10, 90), card("c", null, 500), card("d", 10, 400, { sold: true })]);
    assert.equal(best?.card.id, "b");
    assert.equal(best?.gain, 80);
    assert.equal(best?.pct, 800);
  });

  it("is null without a card that has both a price paid and a value", () => {
    assert.equal(bestCard([card("a", null, 30), card("b", 10, null)]), null);
  });
});

describe("topMovers", () => {
  it("ranks by the biggest % move over the saved history, up or down, three at most", () => {
    const history = new Map([
      ["a", [{ date: "2026-10-01", value: 100 }, { date: TODAY, value: 110 }]],
      ["b", [{ date: "2026-10-01", value: 100 }, { date: TODAY, value: 50 }]],
      ["c", [{ date: "2026-10-01", value: 100 }, { date: TODAY, value: 130 }]],
      ["d", [{ date: "2026-10-01", value: 100 }, { date: TODAY, value: 101 }]],
    ]);
    const movers = topMovers([card("a", 1, 110), card("b", 1, 50), card("c", 1, 130), card("d", 1, 101)], history);
    assert.deepEqual(movers.rows.map((row) => row.card.id), ["b", "c", "a"]);
    assert.equal(movers.basis, "history");
    assert.equal(Math.round(movers.rows[0].pct), -50);
  });

  it("falls back to the gain since you paid when no card has history yet", () => {
    const movers = topMovers([card("a", 10, 20), card("b", 10, 11), card("c", null, 40)], new Map());
    assert.equal(movers.basis, "paid");
    assert.deepEqual(movers.rows.map((row) => row.card.id), ["a", "b"]);
    assert.equal(movers.rows[0].pct, 100);
  });

  it("is empty with nothing to compare", () => {
    assert.deepEqual(topMovers([card("a", null, 20)], new Map()).rows, []);
  });
});

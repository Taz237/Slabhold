import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cardDaysForCollection,
  indexPoints,
  marketMove,
  performanceSeries,
  type CardDay,
} from "@/lib/collection/performance";

function day(cardId: string, date: string, value: number): CardDay {
  return { cardId, date, value };
}

describe("performanceSeries + marketMove", () => {
  it("adding a card does not change the return", () => {
    const series = performanceSeries([
      day("a", "2026-10-01", 40),
      day("a", "2026-10-02", 40),
      // A $1,000 card lands on day 3. Card a has not moved.
      day("a", "2026-10-03", 40),
      day("b", "2026-10-03", 1000),
      day("a", "2026-10-04", 40),
      day("b", "2026-10-04", 1000),
    ]);
    assert.equal(series.length, 4);
    assert.equal(series[3].value, 1040);
    assert.deepEqual(series[2].added, ["b"]);
    assert.deepEqual(series[0].added, []);
    const move = marketMove(series);
    assert.ok(move);
    assert.equal(move.delta, 0);
    assert.equal(move.pct, 0);
  });

  it("a price rise does change the return", () => {
    const series = performanceSeries([
      day("a", "2026-10-01", 100),
      day("a", "2026-10-02", 110),
    ]);
    const move = marketMove(series);
    assert.ok(move);
    assert.equal(move.delta, 10);
    assert.ok(Math.abs((move.pct ?? 0) - 10) < 1e-9);
  });

  it("chains days, so a later add is measured only from its own baseline", () => {
    const series = performanceSeries([
      day("a", "2026-10-01", 100),
      day("a", "2026-10-02", 110), // +10%
      day("a", "2026-10-03", 110),
      day("b", "2026-10-03", 900), // added: baseline, not a gain
      day("a", "2026-10-04", 110),
      day("b", "2026-10-04", 1000), // +100 on a base of 1010
    ]);
    const move = marketMove(series);
    assert.ok(move);
    assert.equal(move.delta, 110);
    const expected = (1.1 * (1110 / 1010) - 1) * 100;
    assert.ok(Math.abs((move.pct ?? 0) - expected) < 1e-9);
  });

  it("a removal does not count as a loss", () => {
    const series = performanceSeries([
      day("a", "2026-10-01", 50),
      day("b", "2026-10-01", 500),
      day("a", "2026-10-02", 50),
      day("b", "2026-10-02", 500),
      // b is sold or deleted: no more rows.
      day("a", "2026-10-03", 50),
    ]);
    assert.equal(series[2].value, 50);
    const move = marketMove(series);
    assert.ok(move);
    assert.equal(move.delta, 0);
    assert.equal(move.pct, 0);
  });

  it("carries a card across a day with no row instead of treating it as removed and re-added", () => {
    const series = performanceSeries([
      day("a", "2026-10-01", 100),
      day("b", "2026-10-01", 10),
      day("b", "2026-10-02", 10), // a has no row today
      day("a", "2026-10-03", 120),
      day("b", "2026-10-03", 10),
    ]);
    assert.deepEqual(series[2].added, []);
    const move = marketMove(series);
    assert.ok(move);
    assert.equal(move.delta, 20);
  });

  it("empty history has no points and no move", () => {
    assert.deepEqual(performanceSeries([]), []);
    assert.equal(marketMove([]), null);
  });

  it("one day of history is not enough", () => {
    const series = performanceSeries([day("a", "2026-10-01", 100), day("b", "2026-10-01", 5)]);
    assert.equal(series.length, 1);
    assert.equal(series[0].value, 105);
    assert.equal(marketMove(series), null);
  });

  it("never shows a % from a base under $1", () => {
    const series = performanceSeries([
      day("a", "2026-10-01", 0.01),
      day("a", "2026-10-02", 0.5),
    ]);
    assert.equal(marketMove(series), null);
  });

  it("skips a near-zero day but counts later days on a real base", () => {
    const series = performanceSeries([
      day("a", "2026-10-01", 0.01),
      day("a", "2026-10-02", 0.5), // would be +4,900%: skipped
      day("b", "2026-10-02", 200),
      day("a", "2026-10-03", 0.5),
      day("b", "2026-10-03", 210),
    ]);
    const move = marketMove(series);
    assert.ok(move);
    assert.ok(Math.abs((move.pct ?? 0) - (10 / 200.5) * 100) < 1e-9);
    assert.ok(move.pct! < 10);
  });

  it("measures a sub-range from its own start", () => {
    const series = performanceSeries([
      day("a", "2026-10-01", 100),
      day("a", "2026-10-02", 200),
      day("a", "2026-10-03", 220),
    ]);
    const move = marketMove(series.slice(1));
    assert.ok(move);
    assert.equal(move.delta, 20);
    assert.ok(Math.abs((move.pct ?? 0) - 10) < 1e-9);
  });

  it("is flat when prices did not move", () => {
    const series = performanceSeries([day("a", "2026-10-01", 30), day("a", "2026-10-02", 30)]);
    assert.deepEqual(marketMove(series), { delta: 0, pct: 0, up: true });
  });
});

describe("indexPoints", () => {
  it("starts the range at 0% and never jumps on an add", () => {
    const series = performanceSeries([
      day("a", "2026-10-01", 100),
      day("a", "2026-10-02", 105),
      day("a", "2026-10-03", 105),
      day("b", "2026-10-03", 5000),
    ]);
    const points = indexPoints(series);
    assert.deepEqual(
      points.map((point) => Math.round(point.value * 1000) / 1000),
      [0, 5, 5],
    );
    assert.equal(points[2].dollars, 5105);
  });

  it("is empty for no history", () => {
    assert.deepEqual(indexPoints([]), []);
  });
});

describe("cardDaysForCollection", () => {
  const cards = [
    { id: "held", sold: false, soldOn: null, live: 120 },
    { id: "sold", sold: true, soldOn: "2026-10-02", live: null },
    { id: "novalue", sold: false, soldOn: null, live: null },
  ];

  it("keeps the collection's cards, drops a sold card from its sale day, and ends on live values", () => {
    const rows = cardDaysForCollection(
      [
        { cardId: "held", date: "2026-10-01", value: 100, held: null },
        { cardId: "sold", date: "2026-10-01", value: 50, held: null },
        { cardId: "sold", date: "2026-10-02", value: 50, held: null },
        { cardId: "gone", date: "2026-10-01", value: 999, held: null },
        { cardId: "held", date: "2026-10-03", value: 110, held: true },
        { cardId: "novalue", date: "2026-10-03", value: 7, held: false },
      ],
      cards,
      { today: "2026-10-03", live: true },
    );
    assert.deepEqual(rows, [
      { cardId: "held", date: "2026-10-01", value: 100 },
      { cardId: "sold", date: "2026-10-01", value: 50 },
      { cardId: "held", date: "2026-10-03", value: 120 },
    ]);
  });

  it("leaves today's saved rows alone until live values load", () => {
    const rows = cardDaysForCollection(
      [{ cardId: "held", date: "2026-10-03", value: 110, held: null }],
      cards,
      { today: "2026-10-03", live: false },
    );
    assert.deepEqual(rows, [{ cardId: "held", date: "2026-10-03", value: 110 }]);
  });
});

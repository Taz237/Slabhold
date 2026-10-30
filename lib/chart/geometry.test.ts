import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { athIndex, dateTicks, nearestIndex, toDayMs, xScale, yScale } from "./geometry";

describe("scrub mapping", () => {
  const xs = [0, 10, 30, 60, 100];

  it("maps a finger x to the nearest point", () => {
    assert.equal(nearestIndex(xs, -50), 0);
    assert.equal(nearestIndex(xs, 4), 0);
    assert.equal(nearestIndex(xs, 6), 1);
    assert.equal(nearestIndex(xs, 21), 2);
    assert.equal(nearestIndex(xs, 46), 3);
    assert.equal(nearestIndex(xs, 99), 4);
    assert.equal(nearestIndex(xs, 500), 4);
  });

  it("returns -1 with no points", () => {
    assert.equal(nearestIndex([], 5), -1);
  });

  it("maps time and value to pixels, with high values near the top", () => {
    const x = xScale(1000, 2000, 10, 210);
    assert.equal(x(1000), 10);
    assert.equal(x(1500), 110);
    assert.equal(x(2000), 210);
    const flat = xScale(5, 5, 0, 100);
    assert.equal(flat(5), 50);
    const y = yScale([0, 100], 10, 110);
    assert.equal(y(100), 10);
    assert.equal(y(0), 110);
  });
});

describe("dateTicks", () => {
  it("gives 3 or 4 short labels that never repeat", () => {
    const start = toDayMs("2026-10-01");
    const end = toDayMs("2026-10-30");
    const ticks = dateTicks(start, end, 4);
    assert.ok(ticks.length >= 3 && ticks.length <= 4);
    assert.equal(ticks[0].label, "Oct 1");
    assert.equal(ticks[ticks.length - 1].label, "Oct 30");
    assert.equal(new Set(ticks.map((tick) => tick.label)).size, ticks.length);
  });

  it("uses month and year on long ranges", () => {
    const ticks = dateTicks(toDayMs("2025-01-01"), toDayMs("2026-10-30"), 4);
    assert.match(ticks[0].label, /^Jan '25$/);
  });

  it("collapses a one-day range to one label", () => {
    const day = toDayMs("2026-10-30");
    assert.equal(dateTicks(day, day, 4).length, 1);
  });
});

describe("athIndex", () => {
  it("finds the highest point, preferring the latest tie", () => {
    assert.equal(athIndex([{ value: 1 }, { value: 5 }, { value: 3 }, { value: 5 }]), 3);
    assert.equal(athIndex([]), -1);
  });
});

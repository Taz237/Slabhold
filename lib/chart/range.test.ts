import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDays,
  availableRanges,
  changeText,
  chartSummary,
  pickRange,
  pointsInRange,
  rangeChange,
  readStoredRange,
  writeStoredRange,
  type DatedValue,
} from "./range";

function series(start: string, count: number, valueAt: (index: number) => number): DatedValue[] {
  return Array.from({ length: count }, (_, index) => ({ date: addDays(start, index), value: valueAt(index) }));
}

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value),
  };
}

const TODAY = "2026-10-30";

describe("availableRanges", () => {
  it("hides every range without at least two points", () => {
    assert.deepEqual(availableRanges([], TODAY), []);
    assert.deepEqual(availableRanges(series(TODAY, 1, () => 5), TODAY), []);
  });

  it("shows only All while history is shorter than a week", () => {
    assert.deepEqual(availableRanges(series("2026-10-27", 4, () => 5), TODAY), ["all"]);
  });

  it("adds each fixed range once history reaches past its window", () => {
    assert.deepEqual(availableRanges(series("2026-10-10", 21, () => 5), TODAY), ["7d", "all"]);
    assert.deepEqual(availableRanges(series("2026-07-01", 122, () => 5), TODAY), ["7d", "30d", "90d", "all"]);
    assert.deepEqual(availableRanges(series("2025-01-01", 668, () => 5), TODAY), ["7d", "30d", "90d", "1y", "all"]);
  });
});

describe("pointsInRange", () => {
  it("carries the last value before the window to the window start", () => {
    const points = [
      { date: "2026-09-01", value: 41 },
      { date: "2026-10-20", value: 200 },
      { date: TODAY, value: 285 },
    ];
    const out = pointsInRange(points, "30d", TODAY);
    assert.deepEqual(out, [
      { date: "2026-10-01", value: 41 },
      { date: "2026-10-20", value: 200 },
      { date: TODAY, value: 285 },
    ]);
  });

  it("returns everything for All", () => {
    const points = series("2026-01-01", 10, (index) => index);
    assert.equal(pointsInRange(points, "all", TODAY).length, 10);
  });
});

describe("rangeChange", () => {
  it("measures first to last of the selected range, and the color always agrees with the sign", () => {
    const up = rangeChange([
      { value: 41 },
      { value: 285 },
    ]);
    assert.ok(up);
    assert.equal(up.delta, 244);
    assert.equal(up.up, true);
    assert.equal(Math.round(up.pct ?? 0), 595);

    const down = rangeChange([{ value: 130.58 }, { value: 100 }]);
    assert.ok(down);
    assert.equal(down.up, false);
    assert.ok(down.delta < 0 && (down.pct ?? 0) < 0);
  });

  it("calls a flat range up (green), and leaves % out when it starts at $0", () => {
    const flat = rangeChange([{ value: 50 }, { value: 50 }]);
    assert.equal(flat?.up, true);
    const fromZero = rangeChange([{ value: 0 }, { value: 50 }]);
    assert.equal(fromZero?.pct, null);
  });

  it("needs two points", () => {
    assert.equal(rangeChange([{ value: 1 }]), null);
  });
});

describe("changeText", () => {
  it("reads like the header: amount, percent, then the range", () => {
    const change = rangeChange([{ value: 41 }, { value: 285 }]);
    assert.equal(changeText(change!, "30d", "2026-10-01"), "+$244.00 (+595%) past 30 days");
    const small = rangeChange([{ value: 100 }, { value: 104.2 }]);
    assert.equal(changeText(small!, "7d", "2026-10-24"), "+$4.20 (+4.2%) past 7 days");
    const down = rangeChange([{ value: 100 }, { value: 76.6 }]);
    assert.equal(changeText(down!, "1y", "2025-10-31"), "−$23.40 (−23.4%) past year");
    assert.equal(changeText(down!, "all", "2026-10-03"), "−$23.40 (−23.4%) since Oct 3");
  });
});

describe("chartSummary", () => {
  it("names the value, the direction and the range for screen readers", () => {
    const change = rangeChange([{ value: 41 }, { value: 285 }]);
    assert.equal(
      chartSummary("Collection value", 285, change, "30d", "2026-10-01"),
      "Collection value $285.00, up 595% past 30 days",
    );
    assert.equal(chartSummary("Collection value", 285, null, "30d", ""), "Collection value $285.00");
  });
});

describe("remembered range", () => {
  it("reads back the last choice per chart and falls back when it is hidden", () => {
    const storage = memoryStorage();
    writeStoredRange(storage, "collection", "90d");
    assert.equal(readStoredRange(storage, "collection"), "90d");
    assert.equal(readStoredRange(storage, "other"), null);
    assert.equal(pickRange(["7d", "30d", "90d", "all"], "90d"), "90d");
    assert.equal(pickRange(["7d", "all"], "90d"), "all");
    assert.equal(pickRange(["7d", "30d", "all"], null), "30d");
    assert.equal(pickRange([], null), "all");
  });

  it("ignores junk and blocked storage", () => {
    const storage = memoryStorage();
    storage.setItem("slabhold:chart-range:collection", "5y");
    assert.equal(readStoredRange(storage, "collection"), null);
    const blocked = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    assert.equal(readStoredRange(blocked, "collection"), null);
    writeStoredRange(blocked, "collection", "7d");
    assert.equal(readStoredRange(null, "collection"), null);
  });
});

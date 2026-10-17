import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDaysToYmd,
  compactCurrency,
  distinctHistoryDays,
  formatTrackingSince,
  historyBadge,
  isHistoryRangeEnabled,
  pointsInHistoryRange,
  valueAxisDomain,
} from "./chart-range";

function series(start: string, count: number, valueAt: (index: number) => number) {
  return Array.from({ length: count }, (_, index) => ({
    date: addDaysToYmd(start, index),
    value: valueAt(index),
  }));
}

describe("collection chart ranges", () => {
  it("with 2 days shows tracking since the first day and disables 30D and All", () => {
    const points = series("2026-10-16", 2, (index) => 100 + index);
    const days = distinctHistoryDays(points.map((point) => point.date));
    assert.equal(days, 2);
    assert.equal(isHistoryRangeEnabled("7d", days), true);
    assert.equal(isHistoryRangeEnabled("30d", days), false);
    assert.equal(isHistoryRangeEnabled("all", days), false);
    assert.equal(formatTrackingSince("2026-10-16"), "Tracking since Oct 16");
    assert.equal(pointsInHistoryRange(points, "7d", "2026-10-17").length, 2);
  });

  it("with 8 days enables 7D and 30D and badges each range from its first point", () => {
    const points = series("2026-10-09", 8, (index) => (index === 0 ? 100 : 150));
    const days = distinctHistoryDays(points.map((point) => point.date));
    assert.equal(days, 8);
    assert.equal(isHistoryRangeEnabled("7d", days), true);
    assert.equal(isHistoryRangeEnabled("30d", days), true);
    assert.equal(isHistoryRangeEnabled("all", days), false);

    const today = "2026-10-16";
    const weekPoints = pointsInHistoryRange(points, "7d", today);
    assert.equal(weekPoints[0]?.date, "2026-10-10");
    assert.equal(weekPoints[0]?.value, 150);
    const week = historyBadge(points, "7d", today);
    const month = historyBadge(points, "30d", today);
    assert.equal(week?.delta, 0);
    assert.equal(month?.delta, 50);
    assert.notEqual(week?.delta, month?.delta);
  });

  it("formats compact currency and keeps the axis off zero", () => {
    assert.equal(compactCurrency(350), "$350");
    assert.equal(compactCurrency(1200), "$1.2K");
    const [low, high] = valueAxisDomain([350, 360]);
    assert.ok(low > 0);
    assert.ok(low < 350);
    assert.ok(high > 360);
  });
});

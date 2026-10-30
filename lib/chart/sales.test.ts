import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { quantile, salesFromComps, saleTrend, splitOutliers, vsDaysAgo, type ChartSale } from "./sales";

function sale(id: string, price: number, date: string): ChartSale {
  return { id, price, date, grade: "PSA 10", source: "eBay" };
}

describe("quantile", () => {
  it("reads quartiles off sorted prices", () => {
    assert.equal(quantile([1, 2, 3, 4, 5], 0.5), 3);
    assert.equal(quantile([1, 2, 3, 4], 0.25), 1.75);
    assert.equal(quantile([], 0.5), null);
  });
});

describe("splitOutliers", () => {
  it("drops sales far outside the middle 50% from the trend", () => {
    const sales = [
      sale("a", 34, "2026-10-01"),
      sale("b", 36, "2026-10-03"),
      sale("c", 33, "2026-10-05"),
      sale("d", 35, "2026-10-07"),
      sale("e", 37, "2026-10-09"),
      sale("f", 140, "2026-10-11"),
      sale("g", 34, "2026-10-13"),
      sale("h", 2, "2026-10-15"),
    ];
    const split = splitOutliers(sales);
    assert.deepEqual(
      split.outliers.map((item) => item.id).sort(),
      ["f", "h"],
    );
    assert.equal(split.inliers.length, 6);
    assert.ok(split.p25 != null && split.p75 != null && split.p25 <= split.p75);
  });

  it("keeps every sale when there are too few to judge", () => {
    const sales = [sale("a", 10, "2026-10-01"), sale("b", 100, "2026-10-02"), sale("c", 30, "2026-10-03")];
    assert.equal(splitOutliers(sales).outliers.length, 0);
  });

  it("does not flag anything when all sales are the same price", () => {
    const sales = ["a", "b", "c", "d", "e"].map((id, index) => sale(id, 20, `2026-10-0${index + 1}`));
    assert.equal(splitOutliers(sales).outliers.length, 0);
  });
});

describe("saleTrend", () => {
  it("is one point per day, in date order, smoothed by a rolling median", () => {
    const trend = saleTrend([
      sale("a", 30, "2026-10-01"),
      sale("b", 40, "2026-10-03"),
      sale("c", 34, "2026-10-03"),
      sale("d", 60, "2026-10-05"),
      sale("e", 36, "2026-10-07"),
    ]);
    assert.deepEqual(
      trend.map((point) => point.date),
      ["2026-10-01", "2026-10-03", "2026-10-05", "2026-10-07"],
    );
    // The 60 spike is pulled toward its neighbours.
    assert.ok(trend[2].value < 60);
    assert.ok(trend.every((point) => point.value >= 30 && point.value <= 60));
  });

  it("is empty for no sales", () => {
    assert.deepEqual(saleTrend([]), []);
  });
});

describe("vsDaysAgo", () => {
  it("compares now with the trend 30 days ago", () => {
    const trend = [
      { date: "2026-09-20", value: 100 },
      { date: "2026-10-30", value: 110 },
    ];
    const pct = vsDaysAgo(trend, 104.2, 30, "2026-10-30");
    assert.ok(pct != null);
    // 30 days ago sits 1/4 of the way from Sep 20 to Oct 30: 102.5.
    assert.equal(Math.round(pct * 10) / 10, 1.7);
  });

  it("is null when the trend does not reach back that far", () => {
    assert.equal(vsDaysAgo([{ date: "2026-10-20", value: 1 }, { date: "2026-10-30", value: 2 }], 2, 30, "2026-10-30"), null);
  });
});

describe("salesFromComps", () => {
  it("keeps the row id so a row and its dot match, and drops the em dash grade", () => {
    const sales = salesFromComps([
      { id: "r1", soldPrice: 36, soldDate: "2026-10-09", condition: "PSA 10", platform: "eBay" },
      { id: "r2", soldPrice: 30, soldDate: "2026-10-08", condition: "—", platform: "eBay" },
      { id: "r3", soldPrice: 0, soldDate: "2026-10-08", condition: "", platform: "eBay" },
      { id: "r4", soldPrice: 20, soldDate: "", condition: "", platform: "eBay" },
    ]);
    assert.deepEqual(sales, [
      { id: "r1", price: 36, date: "2026-10-09", grade: "PSA 10", source: "eBay" },
      { id: "r2", price: 30, date: "2026-10-08", grade: null, source: "eBay" },
    ]);
  });
});

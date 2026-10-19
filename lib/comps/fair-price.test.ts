import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { money } from "@/lib/format";
import { NOT_ENOUGH_SALES_LABEL } from "@/lib/value/format";
import { fairPriceCheck, fairPriceShareBody } from "./fair-price";

describe("fairPriceCheck", () => {
  // Sorted: 2.50, 3.00, 3.50, 4.00 → p25=2.875, p75=3.625
  const sales = [2.5, 3, 3.5, 4];

  it("needs at least 3 matched sales", () => {
    assert.deepEqual(fairPriceCheck(3, [2.5, 4]), {
      status: "not_enough",
      label: NOT_ENOUGH_SALES_LABEL,
    });
    assert.deepEqual(fairPriceCheck(3, []), {
      status: "not_enough",
      label: NOT_ENOUGH_SALES_LABEL,
    });
  });

  it("is Fair inside the middle-50% band, including the edges", () => {
    const ready = fairPriceCheck(3, sales);
    assert.equal(ready.status, "ready");
    if (ready.status !== "ready") return;
    assert.equal(ready.verdict, "Fair");

    const atLow = fairPriceCheck(ready.low, sales);
    assert.equal(atLow.status, "ready");
    if (atLow.status === "ready") assert.equal(atLow.verdict, "Fair");

    const atHigh = fairPriceCheck(ready.high, sales);
    assert.equal(atHigh.status, "ready");
    if (atHigh.status === "ready") assert.equal(atHigh.verdict, "Fair");
  });

  it("is Below under the 25th percentile and Above over the 75th", () => {
    const band = fairPriceCheck(3, sales);
    assert.equal(band.status, "ready");
    if (band.status !== "ready") return;

    const below = fairPriceCheck(band.low - 0.01, sales);
    assert.equal(below.status, "ready");
    if (below.status === "ready") {
      assert.equal(below.verdict, "Below");
      assert.match(below.summaryLabel, /^Below: recent sales \$/);
    }

    const above = fairPriceCheck(band.high + 0.01, sales);
    assert.equal(above.status, "ready");
    if (above.status === "ready") {
      assert.equal(above.verdict, "Above");
      assert.equal(
        above.summaryLabel,
        `Above: recent sales ${money(band.low)} to ${money(band.high)}`,
      );
    }
  });

  it("builds share copy with the $35.00 formatter", () => {
    const result = fairPriceCheck(5, sales);
    assert.equal(result.status, "ready");
    if (result.status !== "ready") return;
    const body = fairPriceShareBody({
      price: 5,
      yearLabel: "2025",
      setBrand: "Prizm",
      playerName: "Jaxson Dart",
      cardNumber: "332",
      grade: "Raw",
      result,
    });
    assert.match(body, /^Price check: \$5\.00 for 2025 Prizm Jaxson Dart #332 Raw/);
    assert.match(body, /Slabhold says Above \(recent \$/);
  });
});

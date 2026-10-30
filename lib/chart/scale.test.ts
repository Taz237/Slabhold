import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { axisLabels, niceStep, valueScale } from "./scale";

describe("niceStep", () => {
  it("rounds to 1, 2, 2.5 or 5 times a power of ten", () => {
    assert.equal(niceStep(300, 2), 200);
    assert.equal(niceStep(10, 2), 5);
    assert.equal(niceStep(0.9, 3), 0.5);
    assert.equal(niceStep(1, 0), 1);
  });
});

describe("valueScale", () => {
  it("gives three quiet ticks with short labels", () => {
    const scale = valueScale([150, 210, 285]);
    assert.ok(scale.ticks.length >= 2 && scale.ticks.length <= 3, String(scale.ticks));
    for (const tick of scale.ticks) {
      assert.ok(tick >= scale.domain[0] && tick <= scale.domain[1]);
      assert.equal(tick % 25, 0);
    }
    const labels = axisLabels(scale.ticks);
    assert.equal(new Set(labels).size, labels.length);
    assert.ok(labels.every((label) => /^\$\d+$/.test(label)), labels.join(","));
  });

  it("pads about 10% so the line never touches the top or bottom", () => {
    const [low, high] = valueScale([100, 200]).domain;
    assert.ok(low <= 90 && low >= 80, String(low));
    assert.ok(high >= 210 && high <= 220, String(high));
  });

  it("does not start at $0 when values sit well above it", () => {
    const [low] = valueScale([250, 285]).domain;
    assert.ok(low > 200, String(low));
  });

  it("starts at $0 when values are near $0", () => {
    const [low] = valueScale([4, 120, 285]).domain;
    assert.equal(low, 0);
  });

  it("never goes below $0 for positive values", () => {
    const [low] = valueScale([10, 400]).domain;
    assert.ok(low >= 0);
  });

  it("handles a flat line and a single value", () => {
    const flat = valueScale([36, 36, 36]);
    assert.ok(flat.domain[0] < 36 && flat.domain[1] > 36);
    assert.ok(flat.ticks.length >= 1);
    const empty = valueScale([]);
    assert.deepEqual(empty.domain, [0, 1]);
  });

  it("uses K labels for big numbers and cents for tiny spans", () => {
    const big = valueScale([12_000, 18_000]);
    const labels = axisLabels(big.ticks);
    assert.ok(labels.every((label) => /K$/.test(label)), labels.join(","));
    const tiny = valueScale([1.1, 1.3]);
    const tinyLabels = axisLabels(tiny.ticks);
    assert.equal(new Set(tinyLabels).size, tinyLabels.length);
    assert.ok(tinyLabels.every((label) => /\.\d\d$/.test(label)), tinyLabels.join(","));
  });

  it("never rounds a half-dollar tick into a wrong label", () => {
    assert.deepEqual(axisLabels([35, 37.5]), ["$35.00", "$37.50"]);
    assert.deepEqual(axisLabels([12_500, 15_000]), ["$12.5K", "$15K"]);
    assert.deepEqual(axisLabels([0, 150, 300]), ["$0", "$150", "$300"]);
  });
});

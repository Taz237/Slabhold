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

  it("always shows exactly 3 round labels inside the padded range, never just $0 and a top value", () => {
    const wide = valueScale([28, 285]);
    assert.deepEqual(wide.ticks, [50, 150, 250]);
    assert.deepEqual(axisLabels(wide.ticks), ["$50", "$150", "$250"]);
    for (const values of [[28, 285], [150, 210, 285], [36, 36], [1.1, 1.3], [12_000, 18_000], [4, 120, 285], [995, 1012], [0.5, 0.9]]) {
      const { domain, ticks } = valueScale(values);
      assert.equal(ticks.length, 3, `${values}: ${ticks}`);
      assert.ok(ticks[0] > domain[0] && ticks[2] < domain[1], `${values}: ${ticks} in ${domain}`);
      assert.ok(Math.abs(ticks[1] - ticks[0] - (ticks[2] - ticks[1])) < 1e-9, `${values}: evenly spaced`);
      assert.ok(!ticks.includes(0), `${values}: ${ticks}`);
      const labels = axisLabels(ticks);
      assert.equal(new Set(labels).size, 3, labels.join(","));
    }
  });

  it("keeps labels distinct for a tight range near $1K", () => {
    const { ticks } = valueScale([995, 1012]);
    assert.deepEqual(axisLabels(ticks), ["$1,000", "$1,005", "$1,010"]);
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

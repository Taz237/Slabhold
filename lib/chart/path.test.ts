import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { areaPath, downsample, linePath, monotonePath, resampleY, smoothStepPath } from "./path";

function numbers(path: string): number[] {
  return (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
}

describe("monotonePath", () => {
  it("is empty below one point and a dot-free move for one point", () => {
    assert.equal(monotonePath([]), "");
    assert.match(monotonePath([{ x: 5, y: 5 }]), /^M5 5/);
  });

  it("never overshoots: every control point stays inside its segment's y range", () => {
    const pts = [
      { x: 0, y: 50 },
      { x: 10, y: 10 },
      { x: 20, y: 12 },
      { x: 30, y: 80 },
      { x: 40, y: 79 },
    ];
    const path = monotonePath(pts);
    const segments = path.split("C").slice(1);
    assert.equal(segments.length, pts.length - 1);
    segments.forEach((segment, index) => {
      const [, c1y, , c2y] = numbers(segment);
      const lo = Math.min(pts[index].y, pts[index + 1].y);
      const hi = Math.max(pts[index].y, pts[index + 1].y);
      assert.ok(c1y >= lo - 1e-6 && c1y <= hi + 1e-6, `c1 ${c1y} in ${lo}-${hi}`);
      assert.ok(c2y >= lo - 1e-6 && c2y <= hi + 1e-6, `c2 ${c2y} in ${lo}-${hi}`);
    });
  });

  it("draws two points as a straight-ish segment", () => {
    const path = monotonePath([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]);
    assert.match(path, /^M0 0C/);
    assert.match(path, /10 10$/);
  });
});

describe("smoothStepPath", () => {
  it("holds flat, then eases up into the next value instead of a cliff", () => {
    const path = smoothStepPath([
      { x: 0, y: 50 },
      { x: 100, y: 10 },
    ]);
    assert.match(path, /^M0 50L/);
    assert.match(path, /C/);
    const flatEnd = numbers(path.split("L")[1])[0];
    assert.ok(flatEnd > 50 && flatEnd < 100, String(flatEnd));
    assert.match(path, /100 10$/);
  });

  it("draws tiny daily drift as straight segments, easing only at a real jump", () => {
    // 0.5px wiggles on a 100px range, then one 99px jump.
    const path = smoothStepPath([
      { x: 0, y: 100 },
      { x: 10, y: 100.5 },
      { x: 20, y: 100 },
      { x: 30, y: 100.5 },
      { x: 40, y: 1 },
    ]);
    assert.equal((path.match(/C/g) ?? []).length, 1);
    assert.match(path, /^M0 100L10 100\.5L20 100L30 100\.5L/);
  });
});

describe("areaPath", () => {
  it("closes the line down to the baseline", () => {
    const line = linePath([
      { x: 0, y: 5 },
      { x: 10, y: 2 },
    ]);
    assert.equal(areaPath(line, 0, 10, 20), `${line}L10 20L0 20Z`);
    assert.equal(areaPath("", 0, 10, 20), "");
  });
});

describe("resampleY", () => {
  it("samples evenly across the x range with linear steps", () => {
    const ys = resampleY(
      [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
      0,
      10,
      3,
    );
    assert.deepEqual(ys, [0, 5, 10]);
  });
});

describe("downsample", () => {
  it("keeps at most the target, always with the first, last, high and marked points", () => {
    const points = Array.from({ length: 500 }, (_, index) => ({
      t: index,
      value: index === 321 ? 9999 : Math.sin(index / 10) * 100,
      marker: index === 77 ? "+ Jordan Love PSA 10" : null,
    }));
    const out = downsample(points, 120);
    assert.ok(out.length <= 122, String(out.length));
    assert.equal(out[0].t, 0);
    assert.equal(out[out.length - 1].t, 499);
    assert.ok(out.some((point) => point.t === 321));
    assert.ok(out.some((point) => point.t === 77));
    for (let i = 1; i < out.length; i++) assert.ok(out[i].t > out[i - 1].t);
  });

  it("returns short series untouched", () => {
    const points = [{ t: 1, value: 2 }];
    assert.equal(downsample(points, 120), points);
  });
});

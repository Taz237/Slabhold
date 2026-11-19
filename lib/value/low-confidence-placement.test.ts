import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { lowConfidencePlacement, type LowConfidenceState } from "@/lib/value/low-confidence-placement";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/** A rough estimate with 3 live sales and the chart up. */
const base: LowConfidenceState = {
  salesCount: 3,
  live: true,
  estimate: true,
  showChart: true,
};

const cases: [string, Partial<LowConfidenceState>, "chart" | "caption" | null][] = [
  ["chart shown", {}, "chart"],
  ["chart chunk loading", { showChart: false }, "caption"],
  ["chart chunk failed", { showChart: false }, "caption"],
  ["chart hidden (collapsed or blocked)", { showChart: false }, "caption"],
  ["non-estimate read under 5 sales", { estimate: false }, "caption"],
  ["5+ sales", { salesCount: 6, estimate: false }, null],
  ["5+ sales, chart loading", { salesCount: 6, estimate: false, showChart: false }, null],
  ["no sales", { salesCount: 0, estimate: false }, null],
  ["not live, chart hidden", { live: false, showChart: false }, null],
  ["not live, non-estimate", { live: false, estimate: false }, null],
];

describe("lowConfidencePlacement", () => {
  for (const [name, patch, want] of cases) {
    it(`${name} → ${want ?? "nowhere"}`, () => {
      assert.equal(lowConfidencePlacement({ ...base, ...patch }), want);
    });
  }

  it("always says a live rough estimate is rough, in exactly one place", () => {
    for (const salesCount of [0, 1, 4, 5, 9]) {
      for (const flags of Array.from({ length: 8 }, (_, n) => n)) {
        const state: LowConfidenceState = {
          salesCount,
          live: Boolean(flags & 1),
          estimate: Boolean(flags & 2),
          showChart: Boolean(flags & 4),
        };
        const at = lowConfidencePlacement(state);
        if (state.estimate && state.live && salesCount >= 1 && salesCount < 5) {
          assert.ok(at === "chart" || at === "caption", JSON.stringify(state));
        }
      }
    }
  });
});

describe("card-detail wiring", () => {
  const src = read("components/card-detail.tsx");

  it("decides the place with the helper and the real chart and loading state", () => {
    assert.match(src, /from "@\/lib\/value\/low-confidence-placement"/);
    const call = src.match(/const roughPlace = lowConfidencePlacement\(\{([\s\S]*?)\}\);/);
    assert.ok(call, "roughPlace comes from lowConfidencePlacement");
    const args = call[1];
    assert.match(args, /salesCount/);
    assert.match(args, /live: usingLive/);
    assert.match(args, /showChart/);
    assert.match(src, /const roughShown = roughPlace === "chart";/);
    assert.match(src, /const roughInList = roughPlace === "caption";/);
  });

  it("feeds the two places from that one answer, so it never shows twice", () => {
    const value = src.slice(src.indexOf("<CardValueView\n"), src.indexOf("/>", src.indexOf("<CardValueView\n")));
    assert.match(value, /rough=\{roughShown\}/);
    assert.match(src, /roughInList \? \(\s*<p data-rough-value=""[^>]*>\{ROUGH_VALUE_NOTE\}<\/p>/);
  });

  it("lets the caller's flag decide the value line's rough note", () => {
    const value = read("components/card-page/card-value.tsx");
    assert.match(value, /rough\?: boolean/);
    assert.match(value, /const isRough = rough \?\?/);
  });

  it("keeps the helper out of comps matching code", () => {
    const helper = read("lib/value/low-confidence-placement.ts");
    assert.doesNotMatch(helper, /^import /m);
  });
});

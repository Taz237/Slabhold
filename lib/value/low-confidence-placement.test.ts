import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  LOW_CONFIDENCE_NOTE,
  lowConfidenceNote,
  lowConfidencePlacement,
  type LowConfidenceState,
} from "@/lib/value/low-confidence-placement";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/** A low-confidence estimate with 3 live sales, the chart up and nothing tapped. */
const base: LowConfidenceState = {
  salesCount: 3,
  live: true,
  estimate: true,
  showChart: true,
  saleSelected: false,
};

const cases: [string, Partial<LowConfidenceState>, "chart" | "caption" | null][] = [
  ["chart shown, no sale selected", {}, "chart"],
  ["a sale selected", { saleSelected: true }, "caption"],
  ["chart chunk loading", { showChart: false }, "caption"],
  ["chart chunk failed", { showChart: false }, "caption"],
  ["chart hidden (collapsed or blocked)", { showChart: false }, "caption"],
  ["non-estimate read under 5 sales", { estimate: false }, "caption"],
  ["non-estimate read, sale selected", { estimate: false, saleSelected: true }, "caption"],
  ["5+ sales", { salesCount: 6, estimate: false }, null],
  ["5+ sales, chart loading", { salesCount: 6, estimate: false, showChart: false }, null],
  ["no sales", { salesCount: 0, estimate: false }, null],
  ["not live, chart hidden", { live: false, showChart: false }, null],
  ["not live, non-estimate", { live: false, estimate: false }, null],
];

describe("lowConfidencePlacement", () => {
  for (const [name, patch, want] of cases) {
    it(`${name} → ${want ?? "nowhere"}`, () => {
      const state = { ...base, ...patch };
      const got = lowConfidencePlacement(state);
      assert.equal(got, want);
      // The caption note agrees with the placement, given whether the chart tag is up.
      const note = lowConfidenceNote(state.salesCount, state.live, got === "chart");
      assert.equal(note, got === "caption" ? LOW_CONFIDENCE_NOTE : "");
    });
  }

  it("never places it twice: the caption skips its note whenever the chart tag is up", () => {
    for (const salesCount of [0, 1, 4, 5, 9]) {
      for (const flags of Array.from({ length: 32 }, (_, n) => n)) {
        const state: LowConfidenceState = {
          salesCount,
          live: Boolean(flags & 1),
          estimate: Boolean(flags & 2),
          showChart: Boolean(flags & 4),
          saleSelected: Boolean(flags & 16),
        };
        const at = lowConfidencePlacement(state);
        const shown = Number(at === "chart") + Number(lowConfidenceNote(salesCount, state.live, at === "chart") !== "");
        assert.ok(shown <= 1, JSON.stringify(state));
        if (state.estimate && state.live && salesCount >= 1 && salesCount < 5) {
          assert.equal(shown, 1, `a live low-confidence estimate always says so: ${JSON.stringify(state)}`);
        }
      }
    }
  });
});

describe("card-detail wiring", () => {
  const src = read("components/card-detail.tsx");

  it("decides the chart tag with the helper and the real chart, sale and loading state", () => {
    assert.match(src, /from "@\/lib\/value\/low-confidence-placement"/);
    const call = src.match(/const estimateTagShown =\s*lowConfidencePlacement\(\{([\s\S]*?)\}\) === "chart";/);
    assert.ok(call, "estimateTagShown comes from lowConfidencePlacement");
    const args = call[1];
    assert.match(args, /salesCount/);
    assert.match(args, /live: usingLive/);
    assert.match(args, /showChart/);
    assert.match(args, /saleSelected: saleId != null/);
  });

  it("feeds that one flag to both the SalesChart tag and the Recent sales caption", () => {
    const chart = src.slice(src.indexOf("<SalesChart\n"), src.indexOf("/>", src.indexOf("<SalesChart\n")));
    assert.match(chart, /lowConfidence=\{estimateTagShown\}/);
    assert.match(src, /Recent sold prices\s*\{lowConfidenceNote\(salesCount, usingLive, estimateTagShown\)\}/);
  });

  it("lets the SalesChart prop decide its amber tag", () => {
    const chart = read("components/sales-chart.tsx");
    assert.match(chart, /lowConfidence\?: boolean/);
    assert.match(chart, /lowConfidenceProp \?\?/);
  });

  it("keeps the helper out of comps matching code", () => {
    const helper = read("lib/value/low-confidence-placement.ts");
    assert.doesNotMatch(helper, /^import /m);
  });
});

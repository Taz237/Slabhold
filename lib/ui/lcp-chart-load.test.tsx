import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("public card chart", () => {
  it("loads the value section with the card-detail dynamic import and a pending read of the same shape", () => {
    const view = read("components/public-card-view.tsx");
    const detail = read("components/card-detail.tsx");
    assert.match(view, /import\("@\/components\/card-page\/card-value"\)/);
    assert.doesNotMatch(view, /from "@\/components\/card-page\/card-value"/);
    assert.doesNotMatch(view, /from "@\/components\/card-page\/sale-plot"/);
    assert.match(detail, /import\("@\/components\/card-page\/card-value"\)/);
    assert.match(view, /<CardValueView\n/);
    assert.match(view, /setCardValueView\(\(\) => mod\.CardValue\)/);
    // While the chunk loads: the same head and plot box, so nothing shifts.
    assert.match(view, /<ValuePending headline=/);
    assert.match(detail, /<SalesChartPending/);
    assert.match(read("components/card-detail-shell.tsx"), /<ValuePending\n/);
  });

  it("offers a retry when the chart chunk fails", () => {
    const view = read("components/public-card-view.tsx");
    assert.match(view, /showChart && chartFailed \? \(\n\s+<ValuePending/);
    assert.match(view, /setChartAttempt\(\(attempt\) => attempt \+ 1\)/);
    assert.match(view, /Couldn't load the sales graph/);
    assert.match(view, />Recent sales</);
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("public card chart", () => {
  it("loads SalesChart with the card-detail dynamic import and the same pending panel", () => {
    const view = read("components/public-card-view.tsx");
    const detail = read("components/card-detail.tsx");
    assert.match(view, /import\("@\/components\/sales-chart"\)/);
    assert.doesNotMatch(view, /from "@\/components\/sales-chart"/);
    assert.match(detail, /import\("@\/components\/sales-chart"\)/);
    assert.match(view, /<SalesChart\n/);
    assert.match(view, /setSalesChart\(\(\) => mod\.SalesChart\)/);
    // While the chunk loads: the owner page's pending panel, so nothing shifts.
    assert.match(view, /<SalesChartPending \/>/);
    assert.match(detail, /<SalesChartPending/);
  });

  it("offers a retry when the chart chunk fails", () => {
    const view = read("components/public-card-view.tsx");
    assert.match(view, /showChart && chartFailed \? \(\n\s+<SalesChartPlaceholder/);
    assert.match(view, /setChartAttempt\(\(attempt\) => attempt \+ 1\)/);
    assert.match(view, /Couldn't load the sales graph/);
    assert.match(view, />Recent sales</);
  });
});

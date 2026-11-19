import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { soldFreshnessLabel } from "@/lib/comps/freshness";

const NOW = Date.parse("2026-10-01T12:00:00Z");
const SEVEN_HOURS_AGO = new Date(NOW - 7 * 60 * 60 * 1000).toISOString();
const COMPS = [
  { soldDate: "2026-09-12T15:00:00Z" },
  { soldDate: "2026-09-30T18:00:00Z" },
];

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("soldFreshnessLabel", () => {
  it("names the newest sale and when we checked", () => {
    assert.equal(
      soldFreshnessLabel(COMPS, SEVEN_HOURS_AGO, NOW),
      "Newest sale Sep 30 · checked 7 hours ago",
    );
  });

  it("drops the newest sale when there are no comps", () => {
    assert.equal(soldFreshnessLabel([], SEVEN_HOURS_AGO, NOW), "checked 7 hours ago");
  });

  it("drops checked when fetchedAt is missing or invalid", () => {
    assert.equal(soldFreshnessLabel(COMPS, null, NOW), "Newest sale Sep 30");
    assert.equal(soldFreshnessLabel(COMPS, undefined, NOW), "Newest sale Sep 30");
    assert.equal(soldFreshnessLabel(COMPS, "not a date", NOW), "Newest sale Sep 30");
  });

  it("skips undated sales and never prints unknown", () => {
    assert.equal(
      soldFreshnessLabel([{ soldDate: "" }, { soldDate: "junk" }], null, NOW),
      "",
    );
    assert.equal(
      soldFreshnessLabel([{ soldDate: "junk" }, ...COMPS], "junk", NOW),
      "Newest sale Sep 30",
    );
  });
});

describe("card page sold freshness", () => {
  it("keeps the freshness label, now behind the value section's ⓘ", () => {
    const value = source("components/card-page/card-value.tsx");
    assert.match(value, /soldFreshnessLabel\(allSales\.map\(\(sale\) => \(\{ soldDate: sale\.date \}\)\), fetchedAt\)/);
    assert.doesNotMatch(value, /Updated|formatRelativeTime/);
    // The old wrapper component went with the old sold list header.
    assert.equal(existsSync(join(process.cwd(), "components/sold-freshness.tsx")), false);
  });

  for (const path of ["components/card-detail.tsx", "components/public-card-view.tsx"]) {
    it(`${path} hands the value section when we last checked`, () => {
      const text = source(path);
      assert.match(text, /fetchedAt=\{sold\.data\?\.fetchedAt \?\? null\}/);
      assert.doesNotMatch(text, /Updated|formatRelativeTime/);
      // The type `unknown` is fine. The word on screen is not.
      assert.doesNotMatch(text, /["'`]unknown|\bunknown["'`]/);
    });
  }
});

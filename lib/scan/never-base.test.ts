import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ProductRecord } from "@/lib/cards/product-data";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import { rankScanMatches } from "./match";
import { scanReadFrom } from "./session";

/** Never a silent Base: the version is read off the card (its color, its serial) or asked, from real parallels only. */

const PRODUCTS: ProductRecord[] = [
  {
    sport: "Basketball",
    yearLabel: "2024-25",
    product: "Topps Chrome",
    manufacturer: "Topps",
    parallels: [
      { subset: "Base", name: "Base", serialRun: null },
      { subset: "Base", name: "Green Refractor", serialRun: 97 },
      { subset: "Base", name: "Purple Refractor", serialRun: 97 },
      { subset: "Base", name: "Gold Refractor", serialRun: 50 },
    ],
  },
];

function top(front: string[], border: string | null, products: ProductRecord[] = PRODUCTS) {
  const read = scanReadFrom({ lines: front, backLines: null, kind: "card", image: null, border }, SCAN_DIRECTORY);
  return rankScanMatches(read, [], { directory: SCAN_DIRECTORY, products, soldTitles: [] }).matches[0];
}

const FRONT = ["2024-25 TOPPS CHROME", "VICTOR WEMBANYAMA", "#1", "15/97"];

describe("never a silent Base", () => {
  it("a 15/97 card whose photo border is green: Green Refractor /97, likely, from the card", () => {
    const match = top(FRONT, "green");
    assert.equal(match?.serialRun, 97);
    assert.equal(match?.serialNo, "15");
    assert.equal(match?.parallel, "Green Refractor");
    assert.equal(match?.sureness.parallel, "likely");
    assert.equal(match?.parallelSource, "card");
  });

  it("no color read, or one no /97 parallel has: left open with the real /97 choices, never Base", () => {
    for (const border of [null, "orange"]) {
      const match = top(FRONT, border);
      assert.equal(match?.parallel, "", String(border));
      assert.deepEqual(match?.parallelOptions.map((option) => option.name), ["Green Refractor", "Purple Refractor"]);
    }
  });

  it("an unnumbered card is never colored by its border alone: open", () => {
    const match = top(["2024-25 TOPPS CHROME", "VICTOR WEMBANYAMA", "#1"], "green");
    assert.equal(match?.parallel, "");
  });

  it("a set we have no list for offers no made-up Base, Silver, Refractor, Gold", () => {
    const match = top(["2024-25 UPPER DECK", "VICTOR WEMBANYAMA", "#1"], null, []);
    assert.equal(match?.parallel, "");
    assert.deepEqual(match?.parallelOptions, []);
  });
});

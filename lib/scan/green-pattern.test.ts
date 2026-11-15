import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadChecklistsFor } from "@/lib/cards/checklist-load";
import { loadProductData } from "@/lib/cards/product-data";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import { rankScanMatches, scanCardKey, type ScanMatch } from "./match";
import { scanReadFrom } from "./session";

/**
 * hc-044: 2025 Bowman #BP-142 Santiago Suarez, Green Pattern Border 43/99. The 2025 odds sheet names
 * Green Pattern Border but prints no runs, so the /99 quick picks come from 2024's list, which
 * spells it "Green Pattern". The chip must read as this year's parallel, on its own beside Green Border.
 */

async function suarez(titles: string[] = []): Promise<ScanMatch> {
  const read = scanReadFrom({ lines: ["SANTIAGO SUAREZ", "RAYS", "1st BOWMAN", "43/99"], backLines: ["BP-142", "2025 BOWMAN BASEBALL"], image: null, kind: "card" }, SCAN_DIRECTORY);
  const key = scanCardKey(read, SCAN_DIRECTORY);
  return rankScanMatches(read, [], { directory: SCAN_DIRECTORY, products: await loadProductData(), soldTitles: titles.map((title) => ({ title })), checklists: key ? await loadChecklistsFor(key) : [] }).matches[0];
}

describe("Suarez Green Pattern Border /99", () => {
  it("the scan alone: open, with Green Pattern Border and Green Border as their own /99 chips", async () => {
    const match = await suarez();
    assert.equal(match.parallel, "");
    const names = match.parallelOptions.map((option) => option.name);
    assert.ok(names.includes("Green Pattern Border"), names.join(", "));
    assert.ok(names.includes("Green Border"), names.join(", "));
    assert.ok(!names.includes("Green Pattern"), "last year's spelling never shows beside this year's");
    for (const option of match.parallelOptions) assert.equal(option.serialRun, 99);
  });

  it("with its sold titles: Green Pattern Border, never plain Green Border", async () => {
    const match = await suarez([
      "Santiago Suarez 2025 Bowman 1st Green Pattern Parallel /99 Prospect #BP-142 Rays",
      "2025 Bowman #BP-142 Santiago Suarez Prospects Green Pattern Border #/99 #BP-142",
    ]);
    assert.equal(match.parallel, "Green Pattern Border");
    assert.equal(match.serialRun, 99);
  });
});

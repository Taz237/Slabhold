import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadChecklistsFor } from "@/lib/cards/checklist-load";
import { loadProductData, type ProductRecord } from "@/lib/cards/product-data";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import { rankScanMatches, scanChecklistKey, type ScanMatch } from "./match";
import { scanReadFrom } from "./session";

/**
 * PSA prints the first year of a season ("2025 PANINI PRIZM" on a 2025-26 basketball card). For a
 * player our list doesn't know, the sport is open, and with it the season and the checklist. When
 * the label names a parallel only one sport's list for that year and set has, that is the sport.
 * Labels are modeled.
 */
async function slab(lines: string[], products?: readonly ProductRecord[]): Promise<ScanMatch> {
  const read = scanReadFrom({ lines, backLines: [], kind: "slab", image: null, alternates: null, backAlternates: null, cert: null }, SCAN_DIRECTORY);
  const key = scanChecklistKey(read, SCAN_DIRECTORY);
  const checklists = key ? await loadChecklistsFor(key) : [];
  const top = rankScanMatches(read, [], { directory: SCAN_DIRECTORY, products: products ?? (await loadProductData()), soldTitles: [], checklists }).matches[0];
  assert.ok(top);
  return top;
}

describe("the sport from the label's parallel", () => {
  it("Philon, 2025 PANINI PRIZM #103 ORANGE PULSAR: basketball, so 2025-26, and the list's /175", async () => {
    const top = await slab(["2025 PANINI PRIZM #103", "LABARON PHILON", "ORANGE PULSAR PRIZM", "GEM MT 10", "PSA", "10234571"]);
    assert.equal(top.sport, "Basketball");
    assert.equal(top.yearLabel, "2025-26");
    // A slab never looks its player up: our list spells him "Labaron Philon Jr.", so he stays open, never someone else.
    assert.ok(top.playerName === "" || /^Labaron Philon/.test(top.playerName), top.playerName);
    assert.equal(top.parallel, "Orange Pulsar");
    assert.equal(top.serialRun, 175);
  });

  it("a parallel both sports' lists have settles nothing: the year stays as printed", async () => {
    const both: ProductRecord[] = [
      { sport: "Football", yearLabel: "2025", product: "Panini Prizm", manufacturer: "Panini", parallels: [{ subset: "Base", name: "Silver", serialRun: null }] },
      { sport: "Basketball", yearLabel: "2025-26", product: "Panini Prizm", manufacturer: "Panini", parallels: [{ subset: "Base", name: "Silver", serialRun: null }] },
    ];
    const top = await slab(["2025 PANINI PRIZM #103", "FIXTURE PLAYER", "SILVER PRIZM", "GEM MT 10", "PSA", "10234572"], both);
    assert.notEqual(top.yearLabel, "2025-26");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checklistProductFrom } from "@/lib/cards/checklist-import";
import { loadChecklistsFor } from "@/lib/cards/checklist-load";
import type { ChecklistProduct } from "@/lib/cards/checklists";
import { loadProductData } from "@/lib/cards/product-data";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import { rankScanMatches, scanChecklistKey, type ScanMatch } from "./match";
import { scanReadFrom } from "./session";

/**
 * A slab label's name our player list has only under another spelling ("LABARON PHILON" for our
 * "Labaron Philon Jr.") is a near match, and nothing on a slab backed it, so the player stayed open.
 * The checklist for the label's year, set and card # backs it now: the name is that player once the
 * checklist puts someone with that name at that number. No agreeing row, and it stays open.
 * Labels are modeled.
 */

const PHILON = ["2025 PANINI PRIZM #103", "LABARON PHILON", "ORANGE PULSAR PRIZM", "GEM MT 10", "PSA", "10234571"];

const readOf = (lines: string[]) => scanReadFrom({ lines, backLines: [], kind: "slab", image: null, alternates: null, backAlternates: null, cert: null }, SCAN_DIRECTORY);

async function top(lines: string[], checklists?: readonly ChecklistProduct[]): Promise<ScanMatch> {
  const read = readOf(lines);
  const key = scanChecklistKey(read, SCAN_DIRECTORY);
  const loaded = checklists ?? (key ? await loadChecklistsFor(key) : []);
  const match = rankScanMatches(read, [], { directory: SCAN_DIRECTORY, products: await loadProductData(), soldTitles: [], checklists: loaded }).matches[0];
  assert.ok(match);
  return match;
}

const prizm = (rows: [string, string, string][]) =>
  checklistProductFrom(
    { sport: "Basketball", yearLabel: "2025-26", product: "Panini Prizm", source: "fixture", read: "2026-11-17" },
    [{ name: "Base", cards: rows.map(([number, player, team]) => ({ number, player, team })) }],
  );

describe("a slab's name, backed by the checklist", () => {
  it("a slab with a year, set and card # asks for that year and set's checklists", () => {
    const key = scanChecklistKey(readOf(PHILON), SCAN_DIRECTORY);
    assert.ok(key);
    assert.deepEqual(key.years, ["2025"]);
    assert.equal(key.setBrand, "Panini Prizm");
  });

  it("Philon #103 Orange Pulsar (hc-080): the store's checklist has him at #103, so the player shows, with #103 and /175", async () => {
    const match = await top(PHILON);
    assert.match(match.playerName, /^Labaron Philon/i);
    assert.equal(match.cardNumber, "103");
    assert.equal(match.yearLabel, "2025-26");
    assert.equal(match.parallel, "Orange Pulsar");
    assert.equal(match.serialRun, 175);
    // A lookup, not something the label alone settled: the collector confirms it.
    assert.notEqual(match.sureness.player, "sure");
  });

  it("the checklist has someone else at that #: the player stays open, never swapped", async () => {
    const match = await top(PHILON, [prizm([["103", "Mark Sears", "Alabama Crimson Tide"]])]);
    assert.equal(match.playerName, "");
    assert.equal(match.cardNumber, "103");
  });

  it("no checklist for the set: the player stays open, as before", async () => {
    const match = await top(PHILON, []);
    assert.equal(match.playerName, "");
  });
});

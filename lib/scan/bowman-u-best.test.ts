import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadChecklistsFor } from "@/lib/cards/checklist-load";
import { loadProductData } from "@/lib/cards/product-data";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import { rankScanMatches, scanChecklistKey } from "./match";
import { readRawCardText } from "./raw-text";
import { scanReadFrom } from "./session";
import { readSlabLabel } from "./slab-label";

/**
 * Bowman U Best (Bowman University Best) is its own product, now with its own checklist. Printed in
 * full ("BOWMAN UNIVERSITY BEST", "BOWMAN U BEST", "BOWMAN'S BEST UNIVERSITY") it is that set. It is
 * never Bowman's Best or Bowman, and Bowman U Now stays open. OCR lines are modeled.
 */

const setsOf = (lines: string[]) => readRawCardText(lines, SCAN_DIRECTORY).setNames;

describe("Bowman U Best", () => {
  it("a card that prints the product in full is Bowman U Best", () => {
    assert.equal(setsOf(["No. 69", "2025-26 BOWMAN UNIVERSITY BEST BASKETBALL"])[0], "Bowman U Best");
    assert.equal(setsOf(["2025 BOWMAN U BEST FOOTBALL"])[0], "Bowman U Best");
    assert.equal(setsOf(["2025 BOWMAN'S BEST UNIVERSITY"])[0], "Bowman U Best");
  });

  it("Bowman U Now and plain Bowman's Best are unchanged", () => {
    assert.ok(!setsOf(["2025 BOWMAN U NOW"]).some((name) => /^bowman/i.test(name)));
    assert.equal(setsOf(["2024 BOWMAN'S BEST BASEBALL"])[0], "Bowman's Best");
  });

  it("a slab label that prints it is Bowman U Best, never Bowman or Bowman's Best", () => {
    for (const line of ["2025 BOWMAN UNIVERSITY BEST #69", "2025 BOWMAN U BEST #69", "2025 BOWMAN'S BEST UNIVERSITY #69", "2025 BOWMAN'S BEST U #69"]) {
      assert.equal(readSlabLabel([line, "CAMERON BOOZER", "GEM MT 10", "PSA", "12345678"]).setName, "Bowman U Best", line);
    }
    assert.equal(readSlabLabel(["2024 BOWMAN'S BEST #1", "JACKSON HOLLIDAY", "GEM MT 10", "PSA", "12345678"]).setName, "Bowman's Best");
  });

  it("Cameron Boozer #69 (hc-016): the set and the store's checklist agree", async () => {
    const read = scanReadFrom(
      { lines: ["CAMERON BOOZER", "DUKE"], backLines: ["No. 69", "2025-26 BOWMAN UNIVERSITY BEST BASKETBALL"], kind: "card", image: null, alternates: null, backAlternates: null, cert: null },
      SCAN_DIRECTORY,
    );
    const key = scanChecklistKey(read, SCAN_DIRECTORY);
    const checklists = key ? await loadChecklistsFor(key) : [];
    const top = rankScanMatches(read, [], { directory: SCAN_DIRECTORY, products: await loadProductData(), soldTitles: [], checklists }).matches[0];
    assert.equal(top?.setBrand, "Bowman U Best");
    assert.equal(top?.playerName, "Cameron Boozer");
    assert.equal(top?.cardNumber, "69");
    assert.equal(top?.yearLabel, "2025-26");
  });
});

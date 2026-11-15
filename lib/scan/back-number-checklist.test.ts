import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadChecklistsFor } from "@/lib/cards/checklist-load";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import { rankScanMatches, scanChecklistKey, scanCardKey, type ScanMatch } from "./match";
import { scanReadFrom } from "./session";

/**
 * Fleer, Upper Deck, O-Pee-Chee and Panini backs print the card # bare ("57"), the same way a
 * jersey number or an age prints, so a bare number alone is never the card #. With the checklist
 * for the year and set the card read, it can be: when the checklist has the player the card names
 * at that number, the number is his card #. A jersey number the checklist doesn't put him at
 * stays out. Uses the store's 2020 Panini Select football checklist (Jordan Love: #47, #147, #247,
 * #347 and inserts at #11 and #20).
 */

const FRONT = ["JORDAN LOVE", "PACKERS", "SELECT"];
const backWith = (lone: string) => [lone, "JORDAN LOVE", "QUARTERBACK", "© 2020 Panini America, Inc."];

async function top(front: string[], back: string[]): Promise<ScanMatch | undefined> {
  const read = scanReadFrom({ lines: front, backLines: back, image: null, kind: "card" }, SCAN_DIRECTORY);
  const key = scanChecklistKey(read, SCAN_DIRECTORY);
  const checklists = key ? await loadChecklistsFor(key) : [];
  return rankScanMatches(read, [], { directory: SCAN_DIRECTORY, products: null, soldTitles: [], checklists }).matches[0];
}

describe("a bare number on the back, checked against the checklist", () => {
  it("the checklist key needs no card #: the year and set the card read are enough to load it", () => {
    const read = scanReadFrom({ lines: FRONT, backLines: backWith("47"), image: null, kind: "card" }, SCAN_DIRECTORY);
    assert.equal(scanCardKey(read, SCAN_DIRECTORY), null, "the lookup key still needs a #");
    const key = scanChecklistKey(read, SCAN_DIRECTORY);
    assert.ok(key);
    assert.equal(key.setBrand, "Panini Select");
    assert.ok(key.years.includes("2020"));
  });

  it("47, where the checklist has Jordan Love: #47, sure", async () => {
    const match = (await top(FRONT, backWith("47")))!;
    assert.equal(match.playerName, "Jordan Love");
    assert.equal(match.cardNumber, "47");
    assert.equal(match.sureness.number, "sure");
  });

  it("10, his jersey: the checklist has someone else there, so the # stays open", async () => {
    assert.equal((await top(FRONT, backWith("10")))?.cardNumber, "");
  });

  it("no player read: a bare number never names a card #", async () => {
    assert.equal((await top(["PACKERS", "SELECT"], ["47", "QUARTERBACK", "© 2020 Panini America, Inc."]))?.cardNumber ?? "", "");
  });

  it("two bare numbers that are both his (47 and 11): open, never a pick", async () => {
    const match = await top(FRONT, ["47", "JORDAN LOVE", "11", "QUARTERBACK", "© 2020 Panini America, Inc."]);
    assert.equal(match?.cardNumber, "");
  });
});

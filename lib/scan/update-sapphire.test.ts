import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SETS } from "@/lib/card-options";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import { rankScanMatches, type ScanMatch } from "./match";
import { sapphireOf, sapphireOptionFor } from "./sapphire";
import { scanReadFrom } from "./session";

/**
 * Topps Chrome Update Sapphire (hc-047: 2025 #USC150 Jacob Wilson). The sheet dropped the set:
 * Topps Chrome Update Sapphire wasn't a set we knew, so the card showed no set at all.
 * Sapphire is named only when the card prints SAPPHIRE or most sold titles for the same player,
 * card # and run say it. Never from the card's look. Made-up sales.
 */

const FRONT = ["JACOB WILSON", "ATHLETICS"];
const BACK = ["USC150", "JACOB WILSON", "SHORTSTOP", "© 2025 THE TOPPS COMPANY, INC."];
const SAPPHIRE = "2025 Topps Chrome Update Sapphire Jacob Wilson RC #USC150 Athletics";
const PLAIN = "2025 Topps Chrome Update Jacob Wilson RC #USC150 Athletics Refractor";

function top(titles: string[], back: string[] = BACK, border: string | null = null): ScanMatch {
  const read = scanReadFrom({ lines: FRONT, backLines: back, image: null, kind: "card", border }, SCAN_DIRECTORY);
  return rankScanMatches(read, [], { directory: SCAN_DIRECTORY, products: null, soldTitles: titles.map((title) => ({ title })) }).matches[0];
}

describe("Topps Chrome Update Sapphire", () => {
  it("is a set we know, and the Sapphire Edition of Topps Chrome Update from 2020", () => {
    assert.ok(SETS.includes("Topps Chrome Update Sapphire"));
    assert.equal(sapphireOf("Topps Chrome Update"), "Topps Chrome Update Sapphire");
    assert.equal(sapphireOptionFor("Topps Chrome Update", "2025"), "Topps Chrome Update Sapphire");
    assert.equal(sapphireOptionFor("Topps Chrome Update", "2019"), null);
  });

  it("the back prints SAPPHIRE: named", () => {
    assert.equal(top([], [...BACK, "2025 TOPPS CHROME UPDATE SAPPHIRE EDITION"]).setBrand, "Topps Chrome Update Sapphire");
  });

  it("most sold titles for #USC150 say Sapphire: named", () => {
    const match = top([SAPPHIRE, SAPPHIRE, PLAIN]);
    assert.equal(match.cardNumber, "USC150");
    assert.equal(match.setBrand, "Topps Chrome Update Sapphire");
  });

  it("titles split, nothing printed: plain Topps Chrome Update, never a guess", () => {
    const match = top([SAPPHIRE, PLAIN, PLAIN]);
    assert.notEqual(match.setBrand, "Topps Chrome Update Sapphire");
  });

  it("a blue border is never Sapphire", () => {
    const match = top([PLAIN, PLAIN], BACK, "blue");
    assert.notEqual(match.setBrand, "Topps Chrome Update Sapphire");
    assert.doesNotMatch(match.parallel, /sapphire/i);
  });
});

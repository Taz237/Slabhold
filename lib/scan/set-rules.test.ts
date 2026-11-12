import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import { COMP_COPY } from "./comp";
import { CONFIRM_COPY } from "./confirm";
import { HUB_COPY } from "./entry";
import { rankScanMatches } from "./match";
import { readRawCardText } from "./raw-text";
import { scanReadFrom } from "./session";

/** Topps legal text never names the set, and a product name beats its bare maker. Empty catalog, no titles. */

const FRONT_NO_LOGO = ["3B", "PHILADELPHIA PHILLIES", "137/299", "AIDAN MILLER"];

function top(front: string[], back: string[] | null) {
  const read = scanReadFrom({ lines: front, backLines: back, image: null, kind: "card" }, INDEXED_DIRECTORY);
  return rankScanMatches(read, [], { directory: INDEXED_DIRECTORY, products: null, soldTitles: [] }).matches[0];
}

describe("Topps legal text on a back never names the set", () => {
  for (const line of [
    "TOPPS.COM",
    "WWW.TOPPS.COM",
    "TOPPS®",
    "MLB TOPPS",
    "TOPPS MLB",
    "OFFICIALLY LICENSED TOPPS",
    "TOPPS CERTIFIED",
    "PRINTED IN USA TOPPS",
    "TOPPS 2024",
    "2024 TOPPS",
    "© 2024 THE TOPPS COMPANY, INC.",
  ]) {
    it(`${line}: set open, #BP-27`, () => {
      const match = top(FRONT_NO_LOGO, ["AIDAN MILLER", line, "BP-27"]);
      assert.equal(match?.playerName, "Aidan Miller");
      assert.equal(match?.setBrand, "", "no set word: open, never Topps");
      assert.equal(match?.cardNumber, "BP-27");
    });
  }
});

describe("a product name beats its bare maker", () => {
  it("BOWMAN TOPPS and 2024 TOPPS BOWMAN on a back are Bowman", () => {
    assert.equal(top(FRONT_NO_LOGO, ["AIDAN MILLER", "BOWMAN TOPPS", "BP-27"])?.setBrand, "Bowman");
    assert.equal(top(FRONT_NO_LOGO, ["AIDAN MILLER", "2024 TOPPS BOWMAN", "BP-27"])?.setBrand, "Bowman");
  });

  it("on a front too: BOWMAN TOPPS is Bowman", () => {
    assert.equal(top(["BOWMAN TOPPS", "AIDAN MILLER"], null)?.setBrand, "Bowman");
  });

  it("a product on the back still counts: TOPPS CHROME, BOWMAN CHROME", () => {
    assert.deepEqual(readRawCardText(["TOPPS CHROME"], INDEXED_DIRECTORY, { side: "back" }).setNames.slice(0, 1), ["Topps Chrome"]);
    assert.deepEqual(readRawCardText(["BOWMAN CHROME"], INDEXED_DIRECTORY, { side: "back" }).setNames.slice(0, 1), ["Bowman Chrome"]);
  });
});

describe("fronts are read as printed", () => {
  it("Topps Now, Topps Chrome and a 2024 TOPPS front stay Topps", () => {
    assert.equal(top(["TOPPS NOW", "JAYLEN BROWN", "CELTICS"], null)?.setBrand, "Topps Now");
    assert.equal(readRawCardText(["TOPPS CHROME", "VJ EDGECOMBE"], INDEXED_DIRECTORY, { side: "front" }).setNames[0], "Topps Chrome");
    assert.equal(top(["2024 TOPPS", "AARON JUDGE"], null)?.setBrand, "Topps");
  });
});

describe("a position is never a card #", () => {
  for (const line of ["SS-3B", "SS - 3B", "3B-SS", "LF-CF"]) {
    it(line, () => {
      assert.equal(readRawCardText(["AIDAN MILLER", line], INDEXED_DIRECTORY, { side: "back" }).cardNumber, "");
      assert.equal(readRawCardText(["AIDAN MILLER", line, "BP-27"], INDEXED_DIRECTORY, { side: "back" }).cardNumber, "BP-27");
    });
  }

  it("SP-15 is still a card #", () => {
    assert.equal(readRawCardText(["SP-15"], INDEXED_DIRECTORY, { side: "back" }).cardNumber, "SP-15");
  });
});

describe("scanner copy", () => {
  it("never says free, AI, best or number one; scanning stays unlimited", () => {
    for (const text of [...Object.values(HUB_COPY), ...Object.values(COMP_COPY), ...Object.values(CONFIRM_COPY)]) {
      assert.doesNotMatch(text, /\bfree\b|\bAI\b|\bbest\b|number one/i, text);
    }
    assert.equal(HUB_COPY.unlimited, "Scan as many cards as you want.");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INDEXED_DIRECTORY as INDEXED_CORE_DIRECTORY } from "@/lib/players/directory";
import { SCAN_DIRECTORY as INDEXED_DIRECTORY } from "@/lib/players/scan-directory";
import { rankScanMatches } from "./match";
import { findPlayers, readRawCardText } from "./raw-text";
import { scanReadFrom } from "./session";

/**
 * The wider player list (retired, college, prospects) in the scanner: a name from it is only
 * ever an exact name on a line of its own, and it never changes what a roster-file player reads as.
 */

const names = (lines: string[], directory = INDEXED_DIRECTORY) => findPlayers(lines, directory).map((hit) => hit.name);

function top(front: string[], back: string[] | null = null, kind: "card" | "slab" = "card") {
  const read = scanReadFrom({ lines: front, backLines: back, image: null, kind }, INDEXED_DIRECTORY);
  return rankScanMatches(read, [], { directory: INDEXED_DIRECTORY, products: null, soldTitles: [] }).matches[0];
}

describe("the wider player list in the scanner", () => {
  it("reads a wider-list name on a line of its own, exactly, and marks it", () => {
    const hits = findPlayers(["DARRYL STRAWBERRY"], INDEXED_DIRECTORY);
    assert.deepEqual(hits, [{ name: "Darryl Strawberry", sport: "Baseball", score: 1, line: "DARRYL STRAWBERRY", nameplate: true, more: true }]);
  });

  it("never reads a wider-list name as a near match: one letter off is nobody", () => {
    for (const line of ["DARYL STRAWBERRY", "DARRYL STRAWBERY", "DARRYL STRAWBERRV", "SHAWN KEMPP", "PAVEL DATSYUC", "ARCH MANNINGS"]) {
      assert.deepEqual(names([line]), [], line);
    }
  });

  it("never reads a wider-list name inside other text, or across two lines", () => {
    assert.deepEqual(names(["Traded for Darryl Strawberry in 1991."]), []);
    assert.deepEqual(names(["DARRYL STRAWBERRY RC"]), []);
    assert.deepEqual(names(["DARRYL", "STRAWBERRY"]), []);
    assert.deepEqual(names(["2025 Bowman Chrome Darryl Strawberry Refractor /499"]), []);
  });

  it("finds every roster-file player exactly as before, with or without the wider list", () => {
    const cards = [
      ["JAXSON DART", "GIANTS", "QB", "RC"],
      ["AIDAN MILLER", "PHILADELPHIA PHILLIES", "137/299"],
      ["JAYLEN BROWM", "BOSTON CELTICS"],
      ["CARLOS RONDON", "NEW YORK YANKEES"],
      ["Traded for Josh Bell after a season with Hank Aaron like power.", "SHAWN KEMP"],
      ["LUKA DONCIC", "DARRYL STRAWBERRY", "MICHAEL JORDAN", "KOBE BRYANT", "TOM BRADY"],
      ["2018 Panini Prizm Luka Doncic Silver Prizm RC #280 PSA 10"],
    ];
    for (const lines of cards) {
      const before = findPlayers(lines, INDEXED_CORE_DIRECTORY);
      const after = findPlayers(lines, INDEXED_DIRECTORY).filter((hit) => !hit.more);
      assert.deepEqual(after, before, lines.join(" | "));
    }
  });

  it("a roster-file near match on a line shuts the wider list out of that line", () => {
    // "Carlos Rondon" is a wider-list name one letter from the roster file's Carlos Rodon.
    assert.deepEqual(names(["CARLOS RONDON"]), ["Carlos Rodon"]);
  });

  it("on a side, a wider-list name counts only on the line the card is read by", () => {
    const back = readRawCardText(["BCP-77", "CORBIN VANDERSLOOT", "OUTFIELD", "FAVORITE PLAYER:", "DARRYL STRAWBERRY"], INDEXED_DIRECTORY, { side: "back" });
    assert.equal(back.printedName, "Corbin Vandersloot");
    assert.deepEqual(back.players, []);
  });

  it("an unknown name with no sold title stays open, however close to a listed name", () => {
    assert.equal(top(["TOPPS", "DARYL STRAWBERRY"])?.playerName ?? "", "");
    assert.equal(top(["BOWMAN CHROME", "CORBIN VANDERSLOOT"])?.playerName ?? "", "");
  });

  it("is not used against the card's own sport: the name reads as printed, a player new to us", () => {
    const match = top(["2025 BOWMAN CHROME", "1ST", "SHAWN KEMP", "SEATTLE MARINERS"], ["BCP-90", "SHAWN KEMP", "OUTFIELD"]);
    assert.equal(match?.playerName, "Shawn Kemp");
    assert.equal(match?.sport, "Baseball");
    assert.equal(match?.yearLabel, "2025");
    assert.equal(match?.playerNew, true);
  });

  it("is not used on a slab: the label's own text is the name, as before", () => {
    const lines = ["PSA", "1987 TOPPS", "#460", "DARRYL STRAWBERRY", "NM-MT 8", "61234567"];
    const withList = rankScanMatches(scanReadFrom({ lines, backLines: null, image: null, kind: "slab" }, INDEXED_DIRECTORY), [], { directory: INDEXED_DIRECTORY, products: null, soldTitles: [] });
    const without = rankScanMatches(scanReadFrom({ lines, backLines: null, image: null, kind: "slab" }, INDEXED_CORE_DIRECTORY), [], { directory: INDEXED_CORE_DIRECTORY, products: null, soldTitles: [] });
    assert.deepEqual(withList, without);
  });

  it("confirms a retired name the card printed with nothing beside it", () => {
    const match = top(["1996-97 TOPPS CHROME", "SHAWN KEMP"]);
    assert.equal(match?.playerName, "Shawn Kemp");
    assert.equal(match?.sport, "Basketball");
    assert.equal(match?.yearLabel, "1996-97");
    assert.ok(!match?.playerNew);
  });
});

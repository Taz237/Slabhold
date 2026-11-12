import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import { HUB_COPY } from "./entry";
import { lookupLiveSolds } from "./live-solds";
import { rankScanMatches, type ScanMatch } from "./match";
import { readRawCardText } from "./raw-text";
import { scanReadFrom } from "./session";

/**
 * Donnie's phone after #245, empty catalog: "2024 Bowman #FOR-4". The back's
 * bio ("average for-4 power") read as a code before BP-27. Bio and stat words
 * are never a card #.
 */

const FRONT = ["3B", "1ST BOWMAN", "PHILADELPHIA PHILLIES", "137/299", "AIDAN MILLER"];
const FRONT_NO_BOWMAN = ["3B", "PHILADELPHIA PHILLIES", "137/299", "AIDAN MILLER"];
const BIO = "hasn't had to sacrifice his average for-4 power";

function rank(front: string[], back: string[] | null): ScanMatch[] {
  const read = scanReadFrom({ lines: front, backLines: back, image: null, kind: "card" }, INDEXED_DIRECTORY);
  return rankScanMatches(read, [], { directory: INDEXED_DIRECTORY, products: null, soldTitles: [] }).matches;
}

function assertMiller(matches: ScanMatch[], { set, number }: { set: string; number: string }) {
  assert.ok(matches.length > 0);
  for (const match of matches) assert.equal(match.playerName, "Aidan Miller");
  const text = JSON.stringify(matches);
  for (const bad of [/FOR-4/i, /A-414/i, /JUNE?-4/i, /ROUND-1/i, /CMPO73107/, /Topps/]) assert.doesNotMatch(text, bad);
  const top = matches[0];
  assert.equal(top.setBrand, set);
  assert.equal(top.cardNumber, number);
  assert.equal(top.serialNo, "137");
  assert.equal(top.serialRun, 299);
  assert.equal(top.parallel, "");
}

describe("a bio 'FOR-4' never beats the printed card #", () => {
  it("Donnie's back: the bio line, BP-27, 2024 TOPPS → 2024 Bowman #BP-27", () => {
    const matches = rank(FRONT, ["AIDAN MILLER", BIO, "BP-27", "2024 TOPPS"]);
    assertMiller(matches, { set: "Bowman", number: "BP-27" });
    assert.equal(matches[0].yearLabel, "2024");
  });

  it("FOR-4 above BP-27, in caps, or alone on a line", () => {
    for (const back of [
      ["AIDAN MILLER", "FOR-4", "BP-27", "2024 TOPPS"],
      ["AIDAN MILLER", "for-4", "BP-27"],
      ["AIDAN MILLER", "HASN'T HAD TO SACRIFICE HIS AVERAGE FOR-4 POWER", "BP-27"],
      ["AIDAN MILLER", "BP-27", "FOR-4"],
      ["AIDAN MILLER", "FOR - 4", "BP–27"],
    ]) {
      assertMiller(rank(FRONT, back), { set: "Bowman", number: "BP-27" });
    }
  });

  it("only FOR-4 read: the number stays open", () => {
    assertMiller(rank(FRONT, ["AIDAN MILLER", "FOR-4", "2024 TOPPS"]), { set: "Bowman", number: "" });
    assertMiller(rank(FRONT, ["AIDAN MILLER", BIO]), { set: "Bowman", number: "" });
  });

  it("'a .414', A-414, JUNE-4, JUN-4 and ROUND-1 never become the card #", () => {
    for (const line of ["A-414", "a .414 average", "JUNE-4", "JUN-4", "BORN JUNE-4, 2004", "ROUND-1", "No. 1 overall pick in the 2023 draft"]) {
      assertMiller(rank(FRONT, ["AIDAN MILLER", line, "BP-27"]), { set: "Bowman", number: "BP-27" });
      assertMiller(rank(FRONT, ["AIDAN MILLER", line]), { set: "Bowman", number: "" });
    }
  });

  it("prefers a real checklist code over a leftover one", () => {
    assert.equal(readRawCardText(["XQ-9", "BP-27"], INDEXED_DIRECTORY, { side: "back" }).cardNumber, "BP-27");
  });

  it("real numbers still work", () => {
    const back = (line: string) => readRawCardText(["AIDAN MILLER", line], INDEXED_DIRECTORY, { side: "back" }).cardNumber;
    assert.equal(back("BP-27"), "BP-27");
    assert.equal(back("INS-13"), "INS-13");
    assert.equal(back("BCP-27"), "BCP-27");
    assert.equal(back("TC-7"), "TC-7");
    assert.equal(back("SP-15"), "SP-15");
    assert.equal(back("#US50"), "US50");
    assert.equal(back("NO. 280"), "280");
    assert.equal(back("#280"), "280");
    // A sold title is one long line: its card # still counts.
    assert.equal(readRawCardText(["2024 Bowman 1st Aidan Miller Magenta /299 #BP-27 Phillies"], INDEXED_DIRECTORY).cardNumber, "BP-27");
  });
});

describe("the #245 cases still hold", () => {
  it("the SKU and copyright back, with and without 1ST BOWMAN", () => {
    const back = ["AIDAN MILLER", "#CMPO73107", "BP-27", "2024 TOPPS"];
    const missed = rank(FRONT_NO_BOWMAN, back);
    assertMiller(missed, { set: "", number: "BP-27" });
    assert.equal(missed[0].yearLabel, "2024");
    assertMiller(rank(FRONT, back), { set: "Bowman", number: "BP-27" });
  });

  it("a real Topps front is still Topps", () => {
    assert.equal(rank(["TOPPS NOW", "JAYLEN BROWN", "CELTICS"], null)[0]?.setBrand, "Topps Now");
  });
});

describe("Scan to comp searches the printed number", () => {
  for (const [front, expected] of [
    [FRONT, "2024 Bowman Aidan Miller #BP-27 /299"],
    [FRONT_NO_BOWMAN, "2024 Aidan Miller #BP-27 /299"],
  ] as const) {
    it(expected, async () => {
      const searches: string[] = [];
      const result = await lookupLiveSolds(
        { capture: { lines: [...front], backLines: ["AIDAN MILLER", BIO, "FOR-4", "BP-27", "2024 TOPPS"], kind: "card" }, rows: [] },
        "u1",
        {
          directory: INDEXED_DIRECTORY,
          products: async () => [],
          cachedTitles: async () => [],
          quickCompCache: async () => null,
          liveSearch: async (query) => {
            searches.push(query);
            return { ok: true, results: [], fetchedAt: "2026-11-12T20:00:00.000Z" };
          },
          storeQuickComp: async () => {},
        },
      );
      assert.deepEqual(searches, [expected]);
      assert.doesNotMatch(JSON.stringify(result), /FOR-4/i);
    });
  }
});

describe("copy", () => {
  it("scanning stays unlimited, never 'free'", () => {
    assert.equal(HUB_COPY.unlimited, "Scan as many cards as you want.");
    for (const text of Object.values(HUB_COPY)) assert.doesNotMatch(text, /\bfree\b/i);
  });
});

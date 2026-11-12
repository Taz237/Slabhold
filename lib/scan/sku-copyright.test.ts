import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import { lookupLiveSolds } from "./live-solds";
import { rankScanMatches, type ScanMatch } from "./match";
import { readRawCardText } from "./raw-text";
import { readSlabLabel } from "./slab-label";
import { scanReadFrom } from "./session";

/**
 * Donnie's phone after #244, empty catalog (search_cards has no Aidan Miller):
 * the back read a factory SKU (#CMPO73107) before BP-27, and a bare
 * "2024 TOPPS" copyright line. The sheet said "2024 Topps #CMPO73107".
 */

const FRONT_NO_BOWMAN = ["3B", "PHILADELPHIA PHILLIES", "137/299", "AIDAN MILLER"];
const FRONT = ["3B", "1ST BOWMAN", "PHILADELPHIA PHILLIES", "137/299", "AIDAN MILLER"];

function rank(front: string[], back: string[] | null): ScanMatch[] {
  const read = scanReadFrom({ lines: front, backLines: back, image: null, kind: "card" }, INDEXED_DIRECTORY);
  return rankScanMatches(read, [], { directory: INDEXED_DIRECTORY, products: null, soldTitles: [] }).matches;
}

function assertMiller(matches: ScanMatch[], { set, number }: { set: string; number: string }) {
  assert.ok(matches.length > 0);
  for (const match of matches) assert.equal(match.playerName, "Aidan Miller");
  const text = JSON.stringify(matches);
  assert.doesNotMatch(text, /CMPO73107/);
  assert.doesNotMatch(text, /Topps/);
  const top = matches[0];
  assert.equal(top.setBrand, set);
  assert.equal(top.cardNumber, number);
  assert.equal(top.serialNo, "137");
  assert.equal(top.serialRun, 299);
  assert.equal(top.parallel, "");
  assert.equal(top.catalogId, null);
}

describe("a factory SKU never beats the printed card #", () => {
  it("Donnie's exact back: #CMPO73107, BP-27, 2024 TOPPS → 2024, set open, #BP-27", () => {
    const matches = rank(FRONT_NO_BOWMAN, ["AIDAN MILLER", "#CMPO73107", "BP-27", "2024 TOPPS"]);
    assertMiller(matches, { set: "", number: "BP-27" });
    assert.equal(matches[0].yearLabel, "2024", "the copyright year is still fine");
    assert.equal(matches[0].sureness.year, "likely");
  });

  it("NO. CMPO73107, the SKU above or below BP-27, and © 2024 TOPPS", () => {
    for (const back of [
      ["AIDAN MILLER", "NO. CMPO73107", "BP-27", "2024 TOPPS"],
      ["AIDAN MILLER", "BP-27", "#CMPO73107", "2024 TOPPS"],
      ["AIDAN MILLER", "#CMPO73107", "BP-27", "© 2024 TOPPS"],
      ["AIDAN MILLER", "BP-27 #CMPO73107", "THE TOPPS COMPANY"],
    ]) {
      assertMiller(rank(FRONT_NO_BOWMAN, back), { set: "", number: "BP-27" });
    }
  });

  it("1ST BOWMAN on the front, both numbers on the back: 2024 Bowman #BP-27", () => {
    const matches = rank(FRONT, ["AIDAN MILLER", "#CMPO73107", "BP-27", "2024 TOPPS"]);
    assertMiller(matches, { set: "Bowman", number: "BP-27" });
    assert.equal(matches[0].yearLabel, "2024");
  });

  it("only a SKU read: the number stays open", () => {
    assertMiller(rank(FRONT, ["AIDAN MILLER", "#CMPO73107", "TOPPS"]), { set: "Bowman", number: "" });
  });

  it("front only: Bowman from 1ST BOWMAN, 137/299, number open", () => {
    assertMiller(rank(FRONT, null), { set: "Bowman", number: "" });
  });

  it("a SKU in a sold title or on a slab label is never a card # either", () => {
    assert.equal(readRawCardText(["2024 Bowman Aidan Miller #CMPO73107 BP-27 /299"], INDEXED_DIRECTORY).cardNumber, "BP-27");
    assert.equal(readRawCardText(["2024 Bowman Aidan Miller #CMPO73107"], INDEXED_DIRECTORY).cardNumber, "");
    const label = readSlabLabel(["PSA", "2024 BOWMAN", "#CMPO73107", "AIDAN MILLER", "MINT 9", "12345678"]);
    const read = { kind: "slab" as const, label };
    const top = rankScanMatches(read, [], { directory: INDEXED_DIRECTORY, products: null, soldTitles: [] }).matches[0];
    assert.notEqual(top?.cardNumber, "CMPO73107");
  });
});

describe("a copyright 'Topps' never sets the set", () => {
  it("© 2024 THE TOPPS COMPANY on a Bowman back (the #244 case)", () => {
    assertMiller(rank(FRONT, ["AIDAN MILLER", "BP-27", "© 2024 THE TOPPS COMPANY, INC."]), { set: "Bowman", number: "BP-27" });
  });

  it("2024 TOPPS, © 2024 TOPPS, THE TOPPS COMPANY or TOPPS alone on the back name no set", () => {
    for (const line of ["2024 TOPPS", "© 2024 TOPPS", "THE TOPPS COMPANY", "TOPPS", "PANINI AMERICA, INC.", "2024 UPPER DECK"]) {
      const back = readRawCardText(["AIDAN MILLER", "BP-27", line], INDEXED_DIRECTORY, { side: "back" });
      assert.deepEqual(back.setNames, [], line);
      assert.equal(back.yearLabel, "", `${line}: the year is the © year, not a printed card year`);
    }
    assert.equal(readRawCardText(["2024 TOPPS"], INDEXED_DIRECTORY, { side: "back" }).copyrightYear, "2024");
  });

  it("a real Topps front still reads Topps", () => {
    assert.deepEqual(readRawCardText(["TOPPS NOW", "JAYLEN BROWN", "CELTICS"], INDEXED_DIRECTORY, { side: "front" }).setNames, ["Topps Now"]);
    assert.equal(readRawCardText(["VJ EDGECOMBE", "TOPPS CHROME", "28/99"], INDEXED_DIRECTORY, { side: "front" }).setNames[0], "Topps Chrome");
    assert.equal(readRawCardText(["2024 TOPPS", "AARON JUDGE"], INDEXED_DIRECTORY).setNames[0], "Topps", "a front with the year and Topps");
    assert.equal(rank(["TOPPS NOW", "JAYLEN BROWN", "CELTICS"], null)[0]?.setBrand, "Topps Now");
  });
});

describe("Scan to comp, same card", () => {
  it("the live search never carries the SKU or Topps", async () => {
    const searches: string[] = [];
    const result = await lookupLiveSolds(
      { capture: { lines: FRONT_NO_BOWMAN, backLines: ["AIDAN MILLER", "#CMPO73107", "BP-27", "2024 TOPPS"], kind: "card" }, rows: [] },
      "u1",
      {
        directory: INDEXED_DIRECTORY,
        products: async () => [],
        cachedTitles: async () => [],
        quickCompCache: async () => null,
        liveSearch: async (query) => {
          searches.push(query);
          return { ok: true, results: [], fetchedAt: "2026-11-12T19:00:00.000Z" };
        },
        storeQuickComp: async () => {},
      },
    );
    assertMiller(result.matches, { set: "", number: "BP-27" });
    assert.deepEqual(searches, ["2024 Aidan Miller #BP-27 /299"]);
  });
});

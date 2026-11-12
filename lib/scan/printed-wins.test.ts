import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CatalogCard } from "@/lib/card-catalog";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import { lookupLiveSolds } from "./live-solds";
import { looksLikeCatalogSku, rankScanMatches, type ScanMatch } from "./match";
import { readRawCardText } from "./raw-text";
import { scanReadFrom } from "./session";

/**
 * Donnie's phone, Nov 12: 2024 Bowman 1st Aidan Miller, magenta 137/299,
 * front and back snapped. The sheet showed "2024 Topps #CMPO73107" with
 * Silver / Refractor / Gold / Green. What the card prints wins; a catalog SKU
 * never shows. Made-up catalog rows.
 */

const MILLER_FRONT = ["3B", "1ST BOWMAN", "PHILADELPHIA PHILLIES", "137/299", "AIDAN MILLER"];
const MILLER_BACK = ["AIDAN MILLER", "BP-27", "© 2024 THE TOPPS COMPANY, INC."];

/** The junk row: a catalog SKU in the number field, and plain Topps. */
const SKU_ROW: CatalogCard = {
  id: "CMPO73107",
  playerName: "Aidan Miller",
  yearLabel: "2024",
  setBrand: "Topps",
  cardNumber: "CMPO73107",
  sport: "Baseball",
  parallel: "Base",
  isRookie: false,
};

function rank(front: string[], back: string[] | null, rows: CatalogCard[] = [SKU_ROW]) {
  const read = scanReadFrom({ lines: front, backLines: back, image: null, kind: "card" }, INDEXED_DIRECTORY);
  return rankScanMatches(read, rows, { directory: INDEXED_DIRECTORY, products: null, soldTitles: [] }).matches;
}

/** Everything a sheet could put in front of the collector, as text. */
function shown(matches: ScanMatch[]): string {
  return JSON.stringify(matches);
}

function assertMiller(matches: ScanMatch[]) {
  assert.ok(matches.length > 0);
  for (const match of matches) assert.equal(match.playerName, "Aidan Miller");
  assert.doesNotMatch(shown(matches), /CMPO73107/);
  const top = matches[0];
  assert.equal(top.serialRun, 299, "the print run read from the front");
  assert.equal(top.serialNo, "137");
  // Magenta isn't printed as a word and no title pins it: open, and no guessed chips.
  assert.equal(top.parallel, "");
  for (const guess of ["Base", "Silver", "Refractor", "Gold", "Green"]) {
    assert.ok(!top.parallelOptions.some((option) => option.name === guess), guess);
  }
}

describe("Aidan Miller, front and back", () => {
  it("is 2024 Bowman #BP-27, 137/299, never 2024 Topps #CMPO73107", () => {
    const matches = rank(MILLER_FRONT, MILLER_BACK);
    assertMiller(matches);
    const top = matches[0];
    assert.equal(top.setBrand, "Bowman", "1ST BOWMAN, not the © Topps line");
    assert.equal(top.yearLabel, "2024");
    assert.equal(top.cardNumber, "BP-27");
    assert.equal(top.sureness.number, "sure");
    assert.equal(top.catalogId, null, "built from the card, not the SKU row");
  });

  it("reads BP-27 when OCR returns an en dash, an em dash or spaces", () => {
    for (const code of ["BP–27", "BP—27", "BP - 27", "BP- 27"]) {
      assert.equal(readRawCardText(["AIDAN MILLER", code], INDEXED_DIRECTORY).cardNumber, "BP-27", code);
      assert.equal(rank(MILLER_FRONT, ["AIDAN MILLER", code, "© 2024 Topps"])[0]?.cardNumber, "BP-27", code);
    }
  });

  it("with © 2024 Topps but no BOWMAN word read, still never shows the SKU row", () => {
    const matches = rank(["3B", "PHILADELPHIA PHILLIES", "137/299", "AIDAN MILLER"], ["AIDAN MILLER", "© 2024 Topps"]);
    assertMiller(matches);
    assert.equal(matches[0].setBrand, "", "no set printed: left open, not invented as Topps");
    assert.equal(matches[0].yearLabel, "2024");
  });

  it("a legit Bowman catalog row for BP-27 is kept; the SKU row still never shows", () => {
    const bowman: CatalogCard = { ...SKU_ROW, id: "miller-bowman", setBrand: "Bowman", cardNumber: "BP-27" };
    const matches = rank(MILLER_FRONT, MILLER_BACK, [SKU_ROW, bowman]);
    assertMiller(matches);
    assert.equal(matches[0].catalogId, "miller-bowman");
    assert.equal(matches.length, 1);
  });
});

describe("Aidan Miller, front only", () => {
  it("is still Aidan Miller, Bowman from 1ST BOWMAN, 137/299, number open, no SKU", () => {
    const matches = rank(MILLER_FRONT, null);
    assertMiller(matches);
    assert.equal(matches[0].setBrand, "Bowman");
    assert.equal(matches[0].cardNumber, "");
  });

  it("never a different player, even when a catalog row for someone else comes back", () => {
    const daly: CatalogCard = { ...SKU_ROW, id: "daly", playerName: "Scott Daly" };
    const matches = rank([...MILLER_FRONT, "Scouts like him more than Scott Daly"], null, [daly, SKU_ROW]);
    assertMiller(matches);
  });
});

describe("catalog SKUs", () => {
  it("tells a SKU from a printed card #", () => {
    for (const sku of ["CMPO73107", "12345678", "SKU99887"]) assert.equal(looksLikeCatalogSku(sku), true, sku);
    for (const number of ["280", "US50", "BP-27", "INS-13", "CPA-AM", "NBA-12", "303", "T87C-12", "1"]) {
      assert.equal(looksLikeCatalogSku(number), false, number);
    }
  });
});

describe("Scan to comp gets the same identity", () => {
  it("the live lookup re-ranks without the SKU row, and searches with BP-27 and Bowman", async () => {
    const searches: string[] = [];
    const result = await lookupLiveSolds(
      { capture: { lines: MILLER_FRONT, backLines: MILLER_BACK, kind: "card" }, rows: [SKU_ROW] },
      "u1",
      {
        directory: INDEXED_DIRECTORY,
        products: async () => [],
        cachedTitles: async () => [],
        quickCompCache: async () => null,
        liveSearch: async (query) => {
          searches.push(query);
          return { ok: true, results: [], fetchedAt: "2026-11-12T18:00:00.000Z" };
        },
        storeQuickComp: async () => {},
      },
    );
    assertMiller(result.matches);
    assert.equal(result.matches[0].setBrand, "Bowman");
    assert.equal(result.matches[0].cardNumber, "BP-27");
    // No sales anywhere: the whole ladder runs, never with the SKU or Topps.
    assert.deepEqual(searches, ["Aidan Miller Bowman BP-27 /299", "Aidan Miller BP-27 /299", "Aidan Miller Bowman BP-27", "Aidan Miller BP-27"]);
    assert.doesNotMatch(searches.join(" "), /CMPO73107|Topps/);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import { rankScanMatches, type ScanMatch, type SoldTitle } from "./match";
import { scanReadFrom } from "./session";
import { readSlabLabel } from "./slab-label";

/**
 * hc-075, Nov 15: a 2020 Panini Select Jordan Love PSA 10, front and back scanned. The sheet said
 * #247 (his Club Level card) and put the right #47 (Concourse) under "Or one of these".
 * Select prints one player at #47, #147, #247 and #347 (Concourse, Premier, Club, Field Level), so
 * sold titles for "Jordan Love 2020 Select" name several real cards. Their majority is not the card
 * in hand. Titles and cert numbers are made up.
 */

const CLUB = "2020 Panini Select Jordan Love Club Level RC #247 PSA 10 Packers";
const CONCOURSE = "2020 Panini Select Concourse Jordan Love RC #47 PSA 10 Packers";
/** Three Club Level sales and two Concourse ones: the market leans to the wrong card. */
const SPLIT: SoldTitle[] = [CLUB, CLUB, CLUB, CONCOURSE, CONCOURSE].map((title) => ({ title }));

function top(lines: string[], back: string[] | null, kind: "card" | "slab", titles: SoldTitle[] = SPLIT): { top: ScanMatch; all: ScanMatch[] } {
  const read = scanReadFrom({ lines, backLines: back, image: null, kind }, SCAN_DIRECTORY);
  const all = rankScanMatches(read, [], { directory: SCAN_DIRECTORY, products: null, soldTitles: titles }).matches;
  return { top: all[0], all };
}

const LABEL_NO_HASH = ["2020 PANINI SELECT 47", "JORDAN LOVE", "CONCOURSE", "GEM MT 10", "PSA", "71905562"];
const LABEL_NO_NUMBER = ["2020 PANINI SELECT", "JORDAN LOVE", "CONCOURSE", "GEM MT 10", "PSA", "71905562"];
const LABEL_NO_NUMBER_NO_VARIETY = ["2020 PANINI SELECT", "JORDAN LOVE", "GEM MT 10", "PSA", "71905562"];

describe("a slab label whose # the phone didn't read", () => {
  it("'2020 PANINI SELECT 47': the bare number after the set is the card #, not part of the variety", () => {
    const label = readSlabLabel(LABEL_NO_HASH);
    assert.equal(label.setName, "Panini Select");
    assert.equal(label.cardNumber, "47");
    assert.equal(label.varietyText, "CONCOURSE");
  });

  it("a set whose name ends in a number keeps it: '2023 TOPPS SERIES 2' is no card #", () => {
    const label = readSlabLabel(["2023 TOPPS SERIES 2", "AARON JUDGE", "MINT 9", "PSA", "71905562"]);
    assert.equal(label.setName, "Topps Series 2");
    assert.equal(label.cardNumber, "");
  });

  it("the read label wins over sold titles: #47", () => {
    assert.equal(top(LABEL_NO_HASH, null, "slab").top.cardNumber, "47");
  });
});

describe("Jordan Love: titles split between #47 and #247", () => {
  it("the slab's back prints No. 47: the back is read on a slab too, #47", () => {
    assert.equal(top(LABEL_NO_NUMBER_NO_VARIETY, ["No. 47", "JORDAN LOVE", "QUARTERBACK", "© 2020 Panini America, Inc."], "slab").top.cardNumber, "47");
  });

  it("the label says CONCOURSE and only the #47 titles do: #47", () => {
    const { top: card, all } = top(LABEL_NO_NUMBER, null, "slab");
    assert.equal(card.cardNumber, "47");
    assert.ok(all.some((match) => match.cardNumber === "247"), "#247 stays in 'Or one of these'");
  });

  it("a bare 47 on the slab's back matches the #47 titles: #47", () => {
    assert.equal(top(LABEL_NO_NUMBER_NO_VARIETY, ["47", "JORDAN LOVE", "QUARTERBACK", "© 2020 Panini America, Inc."], "slab").top.cardNumber, "47");
  });

  it("a raw card with a bare 47 on the back: #47", () => {
    assert.equal(top(["JORDAN LOVE", "PACKERS", "SELECT"], ["47", "JORDAN LOVE", "QUARTERBACK", "© 2020 Panini America, Inc."], "card").top.cardNumber, "47");
  });

  it("nothing on the card picks one: the # stays open, and both stay in 'Or one of these'", () => {
    const { top: card, all } = top(["JORDAN LOVE", "PACKERS", "SELECT"], null, "card");
    assert.equal(card.playerName, "Jordan Love");
    assert.equal(card.setBrand, "Panini Select");
    assert.equal(card.cardNumber, "");
    for (const number of ["47", "247"]) assert.ok(all.some((match) => match.cardNumber === number), number);
  });

  it("one stray title for another # is a seller's slip, not a second card: the titles' #47 stands", () => {
    const titles = [CONCOURSE, CONCOURSE, CONCOURSE, CLUB].map((title) => ({ title }));
    assert.equal(top(["JORDAN LOVE", "PACKERS", "SELECT"], null, "card", titles).top.cardNumber, "47");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import { rankScanMatches, type ScanMatch } from "./match";
import { scanReadFrom } from "./session";

/** A slab label is gold: the year, set, card #, player and parallel come off the label. Made-up certs. */

function scan(lines: string[]): ScanMatch {
  const read = scanReadFrom({ lines, backLines: null, image: null, kind: "slab" }, INDEXED_DIRECTORY);
  const top = rankScanMatches(read, [], { directory: INDEXED_DIRECTORY, products: null, soldTitles: [] }).matches[0];
  assert.ok(top, lines.join(" | "));
  return top;
}

describe("slab labels are gold", () => {
  it("a label read upside down still gives the player, the season and the parallel", () => {
    const top = scan(["45678912", "GEM MT 10", "SILVER PRIZM", "LUKA DONCIC", "#280", "2018 PANINI PRIZM", "PSA"]);
    assert.equal(top.playerName, "Luka Doncic");
    assert.equal(top.yearLabel, "2018-19");
    assert.equal(top.setBrand, "Panini Prizm");
    assert.equal(top.cardNumber, "280");
    assert.equal(top.parallel, "Silver");
    assert.equal(top.grade?.certNumber, "45678912");
    assert.notEqual(top.cardNumber, "45678912");
  });

  it("subset words are never the parallel: Prospects, Rookie Ticket, Young Guns", () => {
    assert.equal(scan(["PSA", "2022 BOWMAN CHR.", "PROSPECTS", "#BCP-153", "JACKSON CHOURIO", "GEM MT 10", "71234567"]).parallel, "Base");
    const burrow = scan(["PSA", "2020 PANINI CONTENDERS", "#103", "JOE BURROW", "ROOKIE TICKET AUTO", "NM-MT 8", "AUTO 10", "55443322"]);
    assert.equal(burrow.parallel, "Base");
    assert.equal(burrow.isAuto, true);
    assert.equal(scan(["CGC", "Connor Bedard", "2023 Upper Deck Series 2", "#451 Young Guns", "MINT 9", "4098765432"]).parallel, "Base");
  });

  it("a parallel our lists don't know keeps the label's words, without 'Prizm' or the run", () => {
    const blueIce = scan(["PSA", "2024 PANINI PRIZM", "#301", "CALEB WILLIAMS", "BLUE ICE PRIZM /99", "GEM MT 10", "99887766"]);
    assert.equal(blueIce.parallel, "Blue Ice");
    assert.equal(blueIce.serialRun, 99);
    assert.equal(scan(["PSA", "2023 PANINI PRIZM", "#136", "VICTOR WEMBANYAMA", "TIGER STRIPE PRIZM", "GEM MT 10", "77665544"]).parallel, "Tiger Stripe");
    assert.equal(scan(["PSA", "2024 PANINI PRIZM", "#347", "JAYDEN DANIELS", "RED WHITE BLUE PRIZM", "MINT 9", "88776655"]).parallel, "Red White & Blue");
  });

  it("'PRIZM' alone on the variety line is the parallel's own name, not Base", () => {
    assert.equal(scan(["PSA", "2012 PANINI PRIZM", "#236", "ANTHONY DAVIS", "PRIZM", "GEM MT 10", "21234567"]).parallel, "Prizm");
  });

  it("a serial on the label is the run, and a numbered slab with no parallel named is never Base", () => {
    const clark = scan(["BECKETT", "2023 BOWMAN CHROME", "PROSPECT AUTOGRAPHS #CPA-MC", "MAX CLARK", "REFRACTOR AUTO 432/499", "9.5", "AUTOGRAPH 10", "0015551234"]);
    assert.equal(clark.parallel, "Refractor");
    assert.equal(clark.serialRun, 499);
    assert.equal(clark.serialNo, "432");
    assert.equal(clark.isAuto, true);
    const numbered = scan(["PSA", "2024 PANINI NATIONAL TREASURES", "#163", "JAYDEN DANIELS", "ROOKIE PATCH AUTO 23/99", "MINT 9", "66554433"]);
    assert.equal(numbered.serialRun, 99);
    assert.notEqual(numbered.parallel, "Base");
  });

  it("a player our directory doesn't have keeps the label's name, with initials capitalized", () => {
    assert.equal(scan(["PSA", "2025 BOWMAN CHROME", "PROSPECTS", "#BCP-12", "CHARLIE CONDON", "GEM MT 10", "61234567"]).playerName, "Charlie Condon");
    assert.equal(scan(["PSA", "2025 BOWMAN CHROME", "#BCP-77", "T.J. NOTINLIST", "GEM MT 10", "61234568"]).playerName, "T.J. Notinlist");
  });

  it("the grade is the label's in every layout", () => {
    const grade = (lines: string[]) => {
      const top = scan(lines);
      return `${top.grade?.company} ${top.grade?.number}`;
    };
    assert.equal(grade(["2018 PANINI PRIZM #280", "LUKA DONCIC GEM MT", "SILVER PRIZM 10", "PSA", "45678912"]), "PSA 10");
    assert.equal(grade(["SGC", "2023-24 PANINI PRIZM", "VICTOR WEMBANYAMA", "#136", "10 GM", "7654321"]), "SGC 10");
    assert.equal(grade(["SGC", "2011 TOPPS UPDATE", "MIKE TROUT", "#US175", "9 MT", "1357924"]), "SGC 9");
    assert.equal(grade(["BECKETT", "2020 PANINI PRIZM", "#325 JUSTIN HERBERT", "SILVER PRIZM", "GEM MINT 9.5", "9.5 9.5 9.5 10", "0012345678"]), "BGS 9.5");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import { parallelLabel, rankScanMatches, type ScanMatch } from "./match";
import { readRawCardText } from "./raw-text";
import { titleParallel } from "./scan-sales";
import { scanReadFrom } from "./session";

/** What a raw card's own text can and can't tell us. Made-up cards in the real shapes. */

const back = (lines: string[]) => readRawCardText(lines, INDEXED_DIRECTORY, { side: "back" });
const front = (lines: string[]) => readRawCardText(lines, INDEXED_DIRECTORY, { side: "front" });

function scan(frontLines: string[], backLines: string[] | null): ScanMatch {
  const read = scanReadFrom({ lines: frontLines, backLines, image: null, kind: "card" }, INDEXED_DIRECTORY);
  const top = rankScanMatches(read, [], { directory: INDEXED_DIRECTORY, products: null, soldTitles: [] }).matches[0];
  assert.ok(top, frontLines.join(" | "));
  return top;
}

describe("the card #: ranks, jerseys and positions are never it", () => {
  it("a rank is not the card #: #1 OVERALL PICK, NO. 1 PROSPECT, #3 SEED", () => {
    assert.equal(front(["PRIZM", "DRAFT PICKS", "CAM WARD", "#1 OVERALL PICK"]).cardNumber, "");
    assert.equal(back(["GUNNAR HENDERSON", "FORMER NO. 1 PROSPECT", "#27"]).cardNumber, "27");
    assert.equal(back(["BD-1", "TRAVIS BAZZANA", "#1 OVERALL PICK 2024 DRAFT"]).cardNumber, "BD-1");
    assert.equal(back(["#3 SEED IN THE WEST", "LUKA DONCIC"]).cardNumber, "");
    assert.equal(readRawCardText(["2024 Bowman Draft Travis Bazzana #1 Overall Pick BD-1"], INDEXED_DIRECTORY).cardNumber, "BD-1", "in a sold title too");
  });

  it("a jersey number beside a position is not the card #", () => {
    for (const line of ["#17 | QB", "QB | #17", "#17 QB", "#23 G-F", "#99 - RF"]) {
      assert.equal(front(["PRIZM", "JOSH ALLEN", "BILLS", line]).cardNumber, "", line);
    }
    assert.equal(back(["#280 RC", "LUKA DONCIC"]).cardNumber, "280", "a real number with a rookie mark still reads");
    assert.equal(back(["#1", "RONALD ACUÑA JR."]).cardNumber, "1");
  });

  it("a position line is never a code: SS-3B, C-1B, INF-3B, OCR's SS-38", () => {
    for (const line of ["SS-3B", "C-1B", "INF-3B", "SS-38", "OF-1B", "UTL-2B", "RHP-1"]) {
      assert.equal(back(["JJ WETHERHOLT", line, "ST. LOUIS CARDINALS"]).cardNumber, "", line);
      assert.equal(back(["JAC CAGLIANONE", line, "BP-41"]).cardNumber, "BP-41", `${line} above BP-41`);
    }
    assert.equal(back(["SP-12", "PAUL SKENES"]).cardNumber, "SP-12", "SP is a real checklist prefix");
  });
});

describe("the card # a back prints without a # or a hyphen", () => {
  it("reads a letter code on an auto checklist: CPA-KG", () => {
    assert.equal(back(["CPA-KG", "KONNOR GRIFFIN", "SHORTSTOP"]).cardNumber, "CPA-KG");
    assert.equal(back(["BCPA - MC", "MAX CLARK"]).cardNumber, "BCPA-MC");
    assert.equal(front(["CPA-KG", "KONNOR GRIFFIN"]).cardNumber, "", "only on the back");
    assert.equal(back(["USA-KG", "KONNOR GRIFFIN"]).cardNumber, "", "only checklist prefixes we know");
  });

  it("reads a known code alone on its line: US1, USC150", () => {
    assert.equal(back(["US1", "JAMES WOOD", "OUTFIELD"]).cardNumber, "US1");
    assert.equal(back(["USC150", "ELLY DE LA CRUZ"]).cardNumber, "USC150");
    assert.equal(back(["JAMES WOOD", "TEAM USA U18 US1 ROSTER"]).cardNumber, "", "not inside other text");
  });

  it("reads a number alone at the top or bottom of a Topps-made back, only when it's the only one", () => {
    const TOPPS = "© 2024 THE TOPPS COMPANY, INC. ALL RIGHTS RESERVED.";
    assert.equal(back(["182", "PAUL SKENES", "PITCHER", "HT: 6'6\" WT: 235", TOPPS]).cardNumber, "182");
    assert.equal(back([TOPPS, "HT: 6'6\" WT: 235", "PITCHER", "PAUL SKENES", "182"]).cardNumber, "182", "upside down");
    assert.equal(back(["147", "BOBBY WITT JR. SS", "KANSAS CITY ROYALS", "2024 TOPPS HERITAGE", TOPPS]).cardNumber, "147");
    assert.equal(back(["AARON JUDGE", "OUTFIELD", "G", "158", "HR", "58", "RBI", "144", TOPPS]).cardNumber, "", "a stat table read cell by cell");
    assert.equal(back(["PAUL SKENES", "PITCHER", "HT: 6'6\"", "WT: 235", "30", "BORN: 5/29/2002", "ACQ: DRAFT", "PIRATES", TOPPS]).cardNumber, "", "in the middle of the back");
    assert.equal(back(["2024", "PAUL SKENES", TOPPS]).cardNumber, "", "a year");
    assert.equal(front(["TOPPS CHROME", "PAUL SKENES", "30"]).cardNumber, "", "never from the front");
    assert.equal(back(["No. 31", "JOSH ALLEN", "17"]).cardNumber, "31", "a printed No. wins");
  });

  it("a lone number is a jersey or an age, not the card #, on a Panini or Upper Deck back or with no maker read", () => {
    assert.equal(back(["17", "JAXSON DART", "QUARTERBACK", "NEW YORK GIANTS", "© 2025 Panini America, Inc."]).cardNumber, "");
    assert.equal(back(["347", "JAYDEN DANIELS", "QUARTERBACK", "2024 PANINI - PRIZM FOOTBALL © 2024 Panini America, Inc."]).cardNumber, "");
    assert.equal(back(["98", "CONNOR BEDARD", "CENTER", "© 2023 The Upper Deck Company"]).cardNumber, "");
    assert.equal(back(["182", "PAUL SKENES", "PITCHER"]).cardNumber, "", "no maker line read: open");
  });

  it("a lone number beside a position or team line is never the card #, even on a Topps back", () => {
    const TOPPS = "© 2024 THE TOPPS COMPANY, INC. ALL RIGHTS RESERVED.";
    assert.equal(back(["JACKSON HOLLIDAY", "SECOND BASE", "BALTIMORE ORIOLES", "22", TOPPS]).cardNumber, "", "under the team line");
    assert.equal(back(["30", "PITCHER", "PAUL SKENES", TOPPS]).cardNumber, "", "above a position line");
    assert.equal(back(["7", "SS", "BOBBY WITT JR.", TOPPS]).cardNumber, "");
    assert.equal(back(["PAUL SKENES", "PITCHER", TOPPS, "PITTSBURGH PIRATES", "30"]).cardNumber, "", "a back ending in a lone number under the team");
  });
});

describe("the print run: ratios in bios and stat rows are never it", () => {
  it("skips a ratio in a sentence and in a stat row; reads a stamped serial", () => {
    assert.equal(back(["#197", "JACKSON MERRILL", "Jackson hit safely in 21/25 games to open the second half of his rookie year."]).serial, null);
    assert.equal(back(["No. 61", "JOE BURROW", "2024 BENGALS 17 460/652 4918 43"]).serial, null);
    assert.deepEqual(front(["PRIZM", "DRAKE MAYE", "045 / 149"]).serial, { number: "45", run: "149" });
    assert.deepEqual(front(["SERIAL NUMBERED 12/25", "COOPER FLAGG"]).serial, { number: "12", run: "25" });
  });
});

describe("the set: the fuller printed name wins", () => {
  it("one logo word is the plain set: DONRUSS is Donruss, PRIZM is Prizm", () => {
    assert.equal(front(["DONRUSS", "RATED ROOKIE", "MARVIN HARRISON JR."]).setNames[0], "Panini Donruss");
    assert.equal(front(["PRIZM", "JOSH ALLEN"]).setNames[0], "Panini Prizm");
    assert.equal(front(["PRIZM", "DRAFT PICKS", "CAM WARD"]).setNames[0], "Prizm Draft Picks");
    assert.equal(front(["DONRUSS OPTIC", "BO NIX"]).setNames[0], "Donruss Optic");
  });

  it("a product line on the back beats a logo word on the front", () => {
    assert.equal(scan(["TOPPS", "JAMES WOOD"], ["US1", "JAMES WOOD", "2024 TOPPS UPDATE SERIES"]).setBrand, "Topps Update");
    assert.equal(scan(["UPPER DECK", "MACKLIN CELEBRINI"], ["#201", "MACKLIN CELEBRINI", "2024-25 UPPER DECK SERIES 1 HOCKEY"]).setBrand, "Upper Deck Series 1");
    const clark = scan(["PRIZM", "CAITLIN CLARK", "INDIANA FEVER"], ["No. 140", "CAITLIN CLARK", "2024 PANINI - PRIZM WNBA"]);
    assert.equal(clark.setBrand, "Panini Prizm WNBA");
    assert.equal(clark.yearLabel, "2024", "the WNBA plays in one calendar year");
  });

  it("1ST BOWMAN with a BCP or CPA code stays Bowman (flagship has them too); BOWMAN CHROME printed is Chrome; a Draft code is Draft", () => {
    assert.equal(scan(["1ST BOWMAN", "WALKER JENKINS"], ["BCP-91", "WALKER JENKINS"]).setBrand, "Bowman");
    assert.equal(scan(["1ST BOWMAN", "KONNOR GRIFFIN"], ["CPA-KG", "KONNOR GRIFFIN"]).setBrand, "Bowman");
    assert.equal(scan(["BOWMAN CHROME", "1ST BOWMAN", "WALKER JENKINS"], ["BCP-91", "WALKER JENKINS"]).setBrand, "Bowman Chrome");
    assert.equal(scan(["1ST BOWMAN", "TRAVIS BAZZANA"], ["BD-1", "TRAVIS BAZZANA"]).setBrand, "Bowman Draft");
    assert.equal(scan(["1ST BOWMAN", "TRAVIS BAZZANA"], ["BDC-12", "TRAVIS BAZZANA"]).setBrand, "Bowman Draft");
    assert.equal(scan(["1ST BOWMAN", "ETHAN SALAS"], ["BP-103", "ETHAN SALAS"]).setBrand, "Bowman");
    assert.equal(scan(["WALKER JENKINS", "MINNESOTA TWINS"], ["BCP-91", "WALKER JENKINS"]).setBrand, "", "no Bowman word printed: the code is a search hint only");
  });

  it("with a BCP code, Bowman Chrome is the second set option: a Bowman Chrome catalog row is still offered", () => {
    const read = scanReadFrom({ lines: ["1ST BOWMAN", "WALKER JENKINS"], backLines: ["BCP-91", "WALKER JENKINS"], image: null, kind: "card" }, INDEXED_DIRECTORY);
    const row = (id: string, setBrand: string) => ({ id, playerName: "Walker Jenkins", yearLabel: "2024", setBrand, cardNumber: "BCP-91", sport: "Baseball", parallel: "Base", isRookie: false });
    const matches = rankScanMatches(read, [row("paper", "Bowman"), row("chrome", "Bowman Chrome")], { directory: INDEXED_DIRECTORY, products: null, soldTitles: [] }).matches;
    assert.deepEqual(matches.map((match) => match.setBrand), ["Bowman", "Bowman Chrome"]);
    assert.notEqual(matches[1].sureness.set, "sure");
  });
});

describe("the parallel: team names, awards and bios are never a color", () => {
  it("RED SOX, BLUE JAYS, GOLD GLOVE, SILVER SLUGGER and a bio sentence name no parallel", () => {
    for (const line of ["BOSTON RED SOX", "B0ST0N RED S0X", "TORONTO BLUE JAYS", "2024 GOLD GLOVE WINNER", "SILVER SLUGGER", "GREEN BAY PACKERS", "DETROIT RED WINGS"]) {
      assert.deepEqual(back(["ROMAN ANTHONY", line]).parallelWords, [], line);
    }
    assert.deepEqual(back(["BOBBY WITT JR.", "Bobby took home a Gold Glove and a Silver Slugger in his third full season."]).parallelWords, []);
    assert.deepEqual(front(["TOPPS CHROME", "GOLD", "07/50"]).parallelWords, ["GOLD"], "a color printed on its own still reads");
  });

  it("a parallel printed on the card with its run is the parallel, when it names one on our list", () => {
    const clark = scan(["BOWMAN CHROME", "1ST BOWMAN", "MAX CLARK", "122/499"], ["BCP-88 REFRACTOR", "MAX CLARK"]);
    assert.equal(clark.parallel, "Refractor");
    assert.equal(clark.serialRun, 499);
    const open = scan(["PRIZM", "DRAKE MAYE", "045/149"], ["No. 329", "DRAKE MAYE"]);
    assert.equal(open.parallel, "", "nothing printed: a numbered card stays open, never Base");
    assert.equal(open.serialRun, 149);
  });
});

describe("parallel names: Tiger Stripe and Red White & Blue", () => {
  it("Tiger Stripe is Tiger Stripe, not Tiger", () => {
    assert.equal(titleParallel("2023 Panini Prizm Victor Wembanyama #136 Tiger Stripe Prizm", INDEXED_DIRECTORY, "Panini Prizm"), "Tiger Stripe");
    assert.equal(titleParallel("2023 Panini Select Brock Bowers #58 Tiger", INDEXED_DIRECTORY, "Panini Select"), "Tiger");
    assert.equal(parallelLabel(["TIGER STRIPE"]), "Tiger Stripe");
  });

  it("Red White Blue is one parallel, not Red/Blue", () => {
    for (const words of ["Red White Blue", "Red White & Blue", "Red, White and Blue", "RED WHITE BLUE"]) {
      assert.equal(titleParallel(`2025 Panini Prizm Jaxson Dart #332 ${words} Prizm RC`, INDEXED_DIRECTORY, "Panini Prizm"), "Red White & Blue", words);
    }
    assert.equal(parallelLabel(["RED WHITE BLUE"]), "Red White & Blue");
    assert.equal(parallelLabel(["PINK", "RED"]), "Pink/Red", "two colors still read as a pair");
    assert.equal(titleParallel("2024 Bowman Aidan Miller Pink/Red /299 BP-27", INDEXED_DIRECTORY, "Bowman"), "Pink/Red");
  });
});

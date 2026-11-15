import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import { rankScanMatches, type ScanMatch } from "./match";
import { scanReadFrom } from "./session";

/**
 * Cards from before the checklist store's years, read the way the phone reads them. Each of these
 * showed something off on the sheet: a suffix cased "Ii", "Sp" for SP, Topps Update read as plain
 * Topps, and a Contenders Championship Ticket cut to "Championship". Cert numbers are made up.
 */

function top(lines: string[], back: string[] | null, kind: "card" | "slab"): ScanMatch {
  const read = scanReadFrom({ lines, backLines: back, image: null, kind }, SCAN_DIRECTORY);
  return rankScanMatches(read, [], { directory: SCAN_DIRECTORY, products: null, soldTitles: [] }).matches[0];
}

describe("names and set names keep their printed capitals", () => {
  it("PATRICK MAHOMES II is Patrick Mahomes II, never 'Mahomes Ii'", () => {
    const match = top(["PATRICK MAHOMES II", "CHIEFS", "PRIZM", "RC"], ["269", "PATRICK MAHOMES II", "2017 PANINI - PRIZM FOOTBALL"], "card");
    assert.equal(match.playerName, "Patrick Mahomes II");
  });

  it("a slab's 1993 SP is SP, never 'Sp'", () => {
    const match = top(["1993 SP #279", "DEREK JETER", "GEM MT 10", "PSA", "32345678"], null, "slab");
    assert.equal(match.setBrand, "SP");
    assert.equal(match.cardNumber, "279");
  });
});

describe("Topps Update by its US code", () => {
  it("2011 Topps #US175 Mike Trout is Topps Update", () => {
    const match = top(["MIKE TROUT", "ANGELS", "TOPPS"], ["US175", "MIKE TROUT", "© 2011 THE TOPPS COMPANY, INC."], "card");
    assert.equal(match.setBrand, "Topps Update");
    assert.equal(match.cardNumber, "US175");
    assert.equal(match.yearLabel, "2011");
  });

  it("a plain Topps number stays Topps", () => {
    const match = top(["MIKE TROUT", "ANGELS", "TOPPS"], ["No. 27", "MIKE TROUT", "© 2018 THE TOPPS COMPANY, INC."], "card");
    assert.notEqual(match.setBrand, "Topps Update");
  });
});

describe("Contenders tickets on a slab", () => {
  it("CHAMPIONSHIP TICKET is the parallel Championship Ticket", () => {
    const match = top(["2000 PLAYOFF CONTENDERS #144", "TOM BRADY", "CHAMPIONSHIP TICKET AUTO", "PSA", "72345678"], null, "slab");
    assert.equal(match.parallel, "Championship Ticket");
  });

  it("ROOKIE TICKET is the subset, never a parallel", () => {
    const match = top(["2020 PANINI CONTENDERS #101", "JOE BURROW", "ROOKIE TICKET AUTO", "GEM MT 10", "PSA", "82345678"], null, "slab");
    assert.doesNotMatch(match.parallel, /ticket/i);
  });
});

describe("vintage backs", () => {
  it("© O-PEE-CHEE CO. LTD. 1979: the year after the maker is the © year (1979-80 hockey)", () => {
    const match = top(["WAYNE GRETZKY", "OILERS", "O-PEE-CHEE"], ["18", "WAYNE GRETZKY", "© O-PEE-CHEE CO. LTD. 1979"], "card");
    assert.equal(match.setBrand, "O-Pee-Chee");
    assert.equal(match.yearLabel, "1979-80");
  });

  it("T.C.G. on the back is Topps (Topps Chewing Gum), and its No. is the card #", () => {
    const match = top(["MICKEY MANTLE", "NEW YORK YANKEES"], ["No. 311", "MICKEY MANTLE", "Outfield: New York Yankees", "T.C.G. PRINTED IN U.S.A."], "card");
    assert.equal(match.setBrand, "Topps");
    assert.equal(match.cardNumber, "311");
  });

  it("a stat line's year after a © never stands in for one: only a © line counts", () => {
    const match = top(["WAYNE GRETZKY", "OILERS", "O-PEE-CHEE"], ["18", "WAYNE GRETZKY", "1978 INDIANAPOLIS 3 0 3 3 0"], "card");
    assert.notEqual(match.yearLabel, "1978-79");
  });
});

describe("slab labels from older and merged reads", () => {
  it("'1952 TOPPS MICKEY MANTLE #311' read as one line: the name between the set and the # is the player", () => {
    const match = top(["1952 TOPPS MICKEY MANTLE #311", "NM 7", "PSA", "12345678"], null, "slab");
    assert.equal(match?.playerName, "Mickey Mantle");
    assert.equal(match.setBrand, "Topps");
    assert.equal(match.cardNumber, "311");
    assert.equal(match.yearLabel, "1952");
  });

  it("'2018 PANINI PRIZM LUKA DONCIC #280' with SILVER PRIZM under it: Doncic, Silver", () => {
    const match = top(["2018 PANINI PRIZM LUKA DONCIC #280", "SILVER PRIZM", "GEM MT 10", "PSA", "12345670"], null, "slab");
    assert.equal(match?.playerName, "Luka Doncic");
    assert.equal(match.cardNumber, "280");
    assert.equal(match.parallel, "Silver");
  });

  it("ROOKIE CARD on the label is a flag, never a parallel named 'Card'", () => {
    const match = top(["2000 BOWMAN #236", "TOM BRADY", "ROOKIE CARD", "MINT 9", "PSA", "22345678"], null, "slab");
    assert.doesNotMatch(match.parallel, /card/i);
  });
});

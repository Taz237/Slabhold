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

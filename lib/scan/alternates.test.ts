import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import { scanCaptureFrom } from "@/lib/ios/scanner";
import { withAlternates } from "./alternates";
import { rankScanMatches, type ScanMatch } from "./match";
import { scanReadFrom, type ScanCapture } from "./session";

/**
 * The phone sends each line's next best readings. They may only fill a field the best reading
 * left open, and only when they agree. A confident read is never changed. Made-up cards.
 */

function capture(patch: Partial<ScanCapture>): ScanCapture {
  return { lines: [], backLines: null, image: null, kind: "card", border: null, ...patch };
}

function top(scan: ScanCapture): ScanMatch {
  const settled = withAlternates(scan, INDEXED_DIRECTORY);
  const read = scanReadFrom(settled, INDEXED_DIRECTORY);
  const match = rankScanMatches(read, [], { directory: INDEXED_DIRECTORY, products: null, soldTitles: [] }).matches[0];
  assert.ok(match);
  return match;
}

const TOPPS = "© 2024 THE TOPPS COMPANY, INC. ALL RIGHTS RESERVED.";

describe("alternates fill an open field", () => {
  it("a serial the best reading garbled is read from the alternate", () => {
    const scan = capture({
      lines: ["PRIZM", "DRAKE MAYE", "PATRIOTS", "O45/l49"],
      alternates: [[], [], [], ["045/149"]],
      backLines: ["No. 329", "DRAKE MAYE", "© 2024 Panini America, Inc."],
    });
    assert.equal(top({ ...scan, alternates: null }).serialRun, null, "open without the alternate");
    const match = top(scan);
    assert.equal(match.serialRun, 149);
    assert.equal(match.serialNo, "45");
  });

  it("a card # the best reading missed is read from the back's alternate", () => {
    const scan = capture({
      lines: ["BOWMAN", "1ST BOWMAN", "ETHAN SALAS"],
      backLines: ["ETHAN SALAS", "8P-1O3", TOPPS],
      backAlternates: [[], ["BP-103", "BP-1O3"], []],
    });
    assert.equal(top(scan).cardNumber, "BP-103");
  });

  it("a year the best reading missed is read from the alternate", () => {
    const scan = capture({
      lines: ["PRIZM", "CALEB WILLIAMS", "BEARS"],
      backLines: ["No. 301", "CALEB WILLIAMS", "2O24 PANINI - PRIZM FOOTBALL"],
      backAlternates: [[], [], ["2024 PANINI - PRIZM FOOTBALL"]],
    });
    assert.equal(top(scan).yearLabel, "2024");
  });

  it("the settled capture carries plain lines, so the server reads the same card", () => {
    const scan = capture({ lines: ["PRIZM", "DRAKE MAYE", "O45/l49"], alternates: [[], [], ["045/149"]] });
    const settled = withAlternates(scan, INDEXED_DIRECTORY);
    assert.deepEqual(settled.lines, ["PRIZM", "DRAKE MAYE", "045/149"]);
    assert.equal(settled.alternates ?? null, null);
    assert.deepEqual(withAlternates(capture({ lines: ["PRIZM"] }), INDEXED_DIRECTORY).lines, ["PRIZM"], "no alternates: unchanged");
  });
});

describe("alternates never make a wrong answer", () => {
  it("alternates that disagree leave the field open", () => {
    const scan = capture({
      lines: ["PRIZM", "DRAKE MAYE", "PATRIOTS", "O45/l49"],
      alternates: [[], [], [], ["045/149", "045/199"]],
    });
    assert.equal(top(scan).serialRun, null);
    const number = capture({
      lines: ["BOWMAN", "1ST BOWMAN", "ETHAN SALAS"],
      backLines: ["ETHAN SALAS", "8P-1O3", TOPPS],
      backAlternates: [[], ["BP-103", "BP-108"], []],
    });
    assert.equal(top(number).cardNumber, "");
  });

  it("an alternate never overrides a confident read", () => {
    const scan = capture({
      lines: ["PRIZM", "DRAKE MAYE", "045/149"],
      alternates: [["PRIZM DRAFT PICKS"], ["DRAKE MAY"], ["045/199", "048/149"]],
      backLines: ["No. 329", "DRAKE MAYE"],
      backAlternates: [["No. 829"], ["DRAKE MAYS"]],
    });
    const match = top(scan);
    assert.equal(match.serialRun, 149);
    assert.equal(match.cardNumber, "329");
    assert.equal(match.playerName, "Drake Maye");
    assert.equal(match.setBrand, "Panini Prizm");
  });

  it("an alternate that fills one field can't change another that was read", () => {
    // The alternate has a serial, but it also changes the card #: it's a different reading of the line, not a fill.
    const scan = capture({
      lines: ["PRIZM", "DRAKE MAYE"],
      backLines: ["No. 329 DRAKE MAYE"],
      backAlternates: [["No. 328 DRAKE MAYE 12/99"]],
    });
    const match = top(scan);
    assert.equal(match.cardNumber, "329");
    assert.equal(match.serialRun, null);
  });

  it("the scanner's rules still hold for an alternate: no SKU, jersey, rank or position line as the card #", () => {
    for (const alternate of ["#CMPO73107", "#17 | QB", "#1 OVERALL PICK", "SS-3B", "INF-3B"]) {
      const scan = capture({
        lines: ["BOWMAN", "1ST BOWMAN", "ETHAN SALAS"],
        backLines: ["ETHAN SALAS", "SAN DIEG0 PADRES ~~", TOPPS],
        backAlternates: [[], [alternate], []],
      });
      assert.equal(top(scan).cardNumber, "", alternate);
    }
  });

  it("a maker word in an alternate never names the set", () => {
    const scan = capture({
      lines: ["AIDAN MILLER", "PHILADELPHIA PHILLIES"],
      backLines: ["AIDAN MILLER", "BP-27", "T0PPS.C0M"],
      backAlternates: [[], [], ["2024 TOPPS"]],
    });
    assert.equal(top(scan).setBrand, "");
  });
});

describe("a slab's alternates and its barcode", () => {
  const LABEL = ["PSA", "2018 PANINI PRIZM", "LUKA DONCIC", "SILVER PRIZM", "GEM MT 10"];

  it("the label's card # is filled from an alternate, never from the cert", () => {
    const scan = capture({
      kind: "slab",
      lines: [...LABEL.slice(0, 2), "H280", ...LABEL.slice(2), "45678912"],
      alternates: [[], [], ["#280"], [], [], [], []],
    });
    const match = top(scan);
    assert.equal(match.cardNumber, "280");
    assert.equal(match.grade?.certNumber, "45678912");
  });

  it("a barcode cert fills the cert when the label's wasn't read, and is never the card #", () => {
    const match = top(capture({ kind: "slab", lines: LABEL, cert: "45678912" }));
    assert.equal(match.grade?.certNumber, "45678912");
    assert.equal(match.cardNumber, "");
    const printed = top(capture({ kind: "slab", lines: [...LABEL, "45678912"], cert: "99999999" }));
    assert.equal(printed.grade?.certNumber, "45678912", "the label's own cert wins");
    const raw = top(capture({ lines: ["PRIZM", "DRAKE MAYE", "045/149"], cert: "45678912" }));
    assert.doesNotMatch(JSON.stringify(raw), /45678912/, "a raw card ignores it");
  });

  it("an alternate that is the cert number never becomes the card #", () => {
    const scan = capture({ kind: "slab", lines: [...LABEL, "45678912"], alternates: [[], [], [], [], [], ["#45678912"]] });
    assert.equal(top(scan).cardNumber, "");
  });
});

describe("the plugin result: new keys are optional and checked", () => {
  it("reads alternates, backAlternates and cert; older results without them still work", () => {
    const old = scanCaptureFrom({ lines: ["LUKA DONCIC"], kind: "card" });
    assert.deepEqual(old?.lines, ["LUKA DONCIC"]);
    assert.equal(old?.alternates ?? null, null);
    const next = scanCaptureFrom({
      lines: ["LUKA DONCIC", "O45/l49"],
      alternates: [[], ["045/149", 7, "x".repeat(500)], ["extra row"]],
      backLines: ["#280"],
      backAlternates: "nope",
      cert: "45678912",
      confidences: [0.9, 0.3],
      sources: ["card", "serial"],
    });
    assert.deepEqual(next?.alternates, [[], ["045/149", "x".repeat(200)]]);
    assert.equal(next?.backAlternates ?? null, null);
    assert.equal(next?.cert, "45678912");
    assert.equal(scanCaptureFrom({ lines: ["A"], cert: "12ab" })?.cert ?? null, null);
    assert.equal(scanCaptureFrom({ lines: ["A"], cert: "123456789012345" })?.cert ?? null, null);
  });
});

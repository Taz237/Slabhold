import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import {
  HUB_COPY,
  addCardScanHref,
  quickCompScanHref,
  scanPurposeFrom,
  scanReadFrom,
  sheetStateFrom,
  type ScanCapture,
} from "./session";
import type { ScanMatch } from "./match";

/** Made-up captures: OCR lines as the native scanner would send them. */
function capture(partial: Partial<ScanCapture>): ScanCapture {
  return { lines: [], backLines: null, image: null, kind: null, ...partial };
}

describe("scanPurposeFrom", () => {
  it("is comp only for for=comp, add otherwise", () => {
    assert.equal(scanPurposeFrom("comp"), "comp");
    assert.equal(scanPurposeFrom(["comp"]), "comp");
    assert.equal(scanPurposeFrom("add"), "add");
    assert.equal(scanPurposeFrom(undefined), "add");
    assert.equal(scanPurposeFrom("anything"), "add");
  });
});

describe("scanReadFrom", () => {
  it("reads a slab when the scanner says slab", () => {
    const read = scanReadFrom(capture({ kind: "slab", lines: ["PSA", "2018 PANINI PRIZM #280", "LUKA DONCIC", "GEM MT 10", "45678912"] }), INDEXED_DIRECTORY);
    assert.equal(read.kind, "slab");
    assert.ok(read.kind === "slab" && read.label.gradeNumber === "10");
  });

  it("spots a slab label even when the scanner wasn't sure", () => {
    const read = scanReadFrom(capture({ lines: ["PSA", "2018 PANINI PRIZM #280", "LUKA DONCIC", "GEM MT 10"] }), INDEXED_DIRECTORY);
    assert.equal(read.kind, "slab");
  });

  it("reads a raw card's front and back", () => {
    const read = scanReadFrom(
      capture({ kind: "card", lines: ["VICTOR WEMBANYAMA", "PRIZM"], backLines: ["#136", "2023-24 PANINI PRIZM"] }),
      INDEXED_DIRECTORY,
    );
    assert.equal(read.kind, "raw");
    assert.ok(read.kind === "raw" && read.front.players[0]?.name === "Victor Wembanyama" && read.back?.cardNumber === "136");
  });

  it("keeps a card the scanner called raw raw, even with grade-like words", () => {
    const read = scanReadFrom(capture({ kind: "card", lines: ["PSA", "GEM MT 10", "LUKA DONCIC"] }), INDEXED_DIRECTORY);
    assert.equal(read.kind, "raw");
  });
});

describe("sheetStateFrom", () => {
  const match = { playerName: "Victor Wembanyama" } as ScanMatch;

  it("is ready with matches, none without, and none offline when the search failed offline", () => {
    assert.deepEqual(sheetStateFrom({ matches: [match], settled: false }, true), { kind: "ready", matches: [match] });
    assert.deepEqual(sheetStateFrom({ matches: [], settled: false }, true), { kind: "none", offline: false });
    assert.deepEqual(sheetStateFrom(null, false), { kind: "none", offline: true });
  });
});

describe("entry points", () => {
  it("shows Scan a card in Add card and Quick Comp only with the scanner on", () => {
    assert.equal(addCardScanHref(true), "/scan");
    assert.equal(addCardScanHref(false), null);
    assert.equal(quickCompScanHref(true), "/scan?for=comp");
    assert.equal(quickCompScanHref(false), null);
  });

  it("uses plain copy, never the word free", () => {
    for (const text of Object.values(HUB_COPY)) {
      assert.equal(/\bfree\b/i.test(text), false, text);
      assert.equal(/!/.test(text), false, text);
    }
    assert.equal(HUB_COPY.unlimited, "Scan as many cards as you want.");
  });
});

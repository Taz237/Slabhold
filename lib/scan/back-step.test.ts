import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BACK_COPY, missingFields, nativeAskedForBack, needsBackStep, withBack } from "./back-step";
import type { ScanMatch, ScanMatchResult } from "./match";
import type { ScanCapture } from "./session";

const match = (over: Partial<ScanMatch> = {}): ScanMatch => ({
  catalogId: null,
  playerName: "Jaxson Dart",
  sport: "Football",
  yearLabel: "2025",
  setBrand: "Topps Chrome",
  cardNumber: "306",
  parallel: "",
  serialRun: null,
  serialNo: "",
  isRookie: true,
  isAuto: false,
  grade: null,
  score: 1,
  sureness: { player: "sure", year: "sure", set: "likely", number: "sure", parallel: "unsure" },
  parallelOptions: [],
  ...over,
});

const result = (...matches: ScanMatch[]): ScanMatchResult => ({ matches, settled: false });
const FRONT: ScanCapture = { lines: ["JAXSON DART", "NEW YORK GIANTS"], backLines: null, image: "data:image/jpeg;base64,QUJD", kind: "card" };

describe("when the scan asks for the back", () => {
  it("a front that already pins the year, set and card #: no step, the flow is as it was", () => {
    assert.equal(needsBackStep(FRONT, result(match()), "library"), false);
  });

  it("a front missing the card #, the set or the year: asks", () => {
    assert.equal(needsBackStep(FRONT, result(match({ cardNumber: "" })), "library"), true);
    assert.equal(needsBackStep(FRONT, result(match({ setBrand: "" })), "library"), true);
    assert.equal(needsBackStep(FRONT, result(match({ yearLabel: "" })), "library"), true);
  });

  it("a card # or set we aren't sure of counts as missing", () => {
    assert.equal(needsBackStep(FRONT, result(match({ sureness: { ...match().sureness, number: "unsure" } })), "library"), true);
    assert.equal(needsBackStep(FRONT, result(match({ sureness: { ...match().sureness, set: "unsure" } })), "library"), true);
  });

  it("no match from the front yet: the back may find it, so it asks", () => {
    assert.equal(needsBackStep(FRONT, result(), "library"), true);
  });

  it("never for a slab, never with the back already in, never when the search failed", () => {
    assert.equal(needsBackStep({ ...FRONT, kind: "slab" }, result(match({ cardNumber: "" })), "library"), false);
    assert.equal(
      needsBackStep(FRONT, result(match({ cardNumber: "", grade: { company: "PSA", number: "10", qualifier: "", certNumber: "", authentic: false, autoGrade: "" } })), "library"),
      false,
    );
    assert.equal(needsBackStep({ ...FRONT, backLines: ["No. 306"] }, result(match({ cardNumber: "" })), "library"), false);
    assert.equal(needsBackStep(FRONT, null, "library"), false);
  });

  it("never twice: the phone's camera already asked for a front with no card # line, and it was skipped", () => {
    assert.equal(needsBackStep(FRONT, result(match({ cardNumber: "" })), "camera"), false);
    // A front that printed a # line wasn't asked on the phone: missing the set, it asks here.
    const numbered = { ...FRONT, lines: ["#306", "JAXSON DART"] };
    assert.equal(needsBackStep(numbered, result(match({ setBrand: "" })), "camera"), true);
  });

  it("matches the phone's own test for a card # line", () => {
    assert.equal(nativeAskedForBack(["JAXSON DART"]), true);
    assert.equal(nativeAskedForBack(["NO. 47", "JAXSON DART"]), false);
    assert.equal(nativeAskedForBack(["#BP-38"]), false);
  });
});

describe("what's still missing", () => {
  it("lists the empty or unsure fields in order", () => {
    assert.deepEqual(missingFields(match()), []);
    assert.deepEqual(missingFields(match({ yearLabel: "", cardNumber: "" })), ["year", "number"]);
    assert.deepEqual(missingFields(undefined), ["year", "set", "number"]);
  });
});

describe("the front and the back as one scan", () => {
  it("the back's lines join as backLines; the front's photo and lines stay", () => {
    const back: ScanCapture = { lines: ["No. 306", "© 2025 THE TOPPS COMPANY"], backLines: null, image: "data:image/jpeg;base64,QkFDSw==", kind: "card", alternates: [["NO. 306"], []] };
    const both = withBack(FRONT, back);
    assert.deepEqual(both.lines, FRONT.lines);
    assert.equal(both.image, FRONT.image);
    assert.deepEqual(both.backLines, back.lines);
    assert.deepEqual(both.backAlternates, back.alternates);
    assert.equal(both.kind, "card");
  });

  it("a back that came back as two reads (the phone asked again) is all back", () => {
    const back: ScanCapture = { lines: ["BOWMAN PROSPECTS"], backLines: ["BP-38"], image: null, kind: "card", alternates: [["BOWMAN PROSPECTS"]] };
    const both = withBack(FRONT, back);
    assert.deepEqual(both.backLines, ["BOWMAN PROSPECTS", "BP-38"]);
    assert.equal(both.backAlternates, null);
  });
});

describe("the step's words", () => {
  it("say it plainly, with no sales words", () => {
    const words = Object.values(BACK_COPY).join(" ");
    assert.equal(BACK_COPY.title, "Flip it over");
    for (const banned of [/\bbest\b/i, /\bai\b/i, /\bfree\b/i, /number one/i]) assert.doesNotMatch(words, banned);
    // "Flip it over" turns the card; "flip" is never a sales word here.
    assert.doesNotMatch(words.replace("Flip it over", ""), /\bflip/i);
  });
});

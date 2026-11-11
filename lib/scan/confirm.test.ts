import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONFIRM_COPY,
  confirmMatch,
  gradeLabel,
  initialChoice,
  maskCert,
  matchLine,
  promoteMatch,
  scanPreviewAllowed,
  scannerEnabled,
} from "./confirm";
import type { ScanMatch } from "./match";

/** Made-up matches. The cert is not a real one. */
function match(partial: Partial<ScanMatch> = {}): ScanMatch {
  return {
    catalogId: "wemby-prizm",
    playerName: "Victor Wembanyama",
    sport: "Basketball",
    yearLabel: "2023-24",
    setBrand: "Panini Prizm",
    cardNumber: "136",
    parallel: "",
    serialRun: null,
    serialNo: "",
    isRookie: true,
    isAuto: false,
    grade: null,
    score: 80,
    sureness: { player: "sure", year: "likely", set: "likely", number: "unsure", parallel: "unsure" },
    parallelOptions: [
      { name: "Base", serialRun: null },
      { name: "Silver", serialRun: null },
      { name: "Purple", serialRun: 99 },
    ],
    ...partial,
  };
}

describe("matchLine and labels", () => {
  it("reads year, set and number, skipping blanks", () => {
    assert.equal(matchLine(match()), "2023-24 Panini Prizm #136");
    assert.equal(matchLine(match({ cardNumber: "" })), "2023-24 Panini Prizm");
    assert.equal(matchLine(match({ yearLabel: "", setBrand: "" })), "#136");
  });

  it("names the grade, Authentic and a qualifier", () => {
    const base = { company: "PSA", number: "10", qualifier: "", certNumber: "", authentic: false, autoGrade: "" };
    assert.equal(gradeLabel(base), "PSA 10");
    assert.equal(gradeLabel({ ...base, number: "9", qualifier: "OC" }), "PSA 9 OC");
    assert.equal(gradeLabel({ ...base, number: "", authentic: true }), "PSA Authentic");
    assert.equal(gradeLabel({ ...base, company: "" }), null);
    assert.equal(gradeLabel(null), null);
  });

  it("shows only the last 4 of a cert", () => {
    assert.equal(maskCert("45678912"), "••••8912");
    assert.equal(maskCert("123"), "••••");
    assert.equal(maskCert(""), "");
  });
});

describe("initialChoice", () => {
  it("starts on the scan's parallel when it has one", () => {
    assert.deepEqual(initialChoice(match({ parallel: "Silver" })), { name: "Silver", serialRun: null });
  });

  it("keeps the run the checklist gives the parallel", () => {
    assert.deepEqual(initialChoice(match({ parallel: "Purple", serialRun: 99 })), { name: "Purple", serialRun: 99 });
  });

  it("starts with nothing picked when the parallel is open", () => {
    assert.equal(initialChoice(match()), null);
  });
});

describe("confirmMatch", () => {
  it("makes a picked parallel sure", () => {
    const result = confirmMatch(match(), { name: "Silver", serialRun: null }, "");
    assert.ok("match" in result);
    assert.equal(result.match.parallel, "Silver");
    assert.equal(result.match.sureness.parallel, "sure");
  });

  it("leaves the parallel open when nothing is picked, so Add card asks", () => {
    const result = confirmMatch(match(), null, "");
    assert.ok("match" in result);
    assert.equal(result.match.parallel, "");
    assert.equal(result.match.sureness.parallel, "unsure");
  });

  it("takes the run from the picked parallel and checks the number against it", () => {
    const ok = confirmMatch(match(), { name: "Purple", serialRun: 99 }, " 12 ");
    assert.ok("match" in ok);
    assert.equal(ok.match.serialRun, 99);
    assert.equal(ok.match.serialNo, "12");
    const bad = confirmMatch(match(), { name: "Purple", serialRun: 99 }, "120");
    assert.deepEqual(bad, { error: "Your number must be between 1 and 99." });
  });

  it("drops a serial number when the picked parallel isn't numbered", () => {
    const result = confirmMatch(match({ serialNo: "12" }), { name: "Silver", serialRun: null }, "12");
    assert.ok("match" in result);
    assert.equal(result.match.serialRun, null);
    assert.equal(result.match.serialNo, "");
  });
});

describe("promoteMatch", () => {
  it("moves the picked row to the top and keeps the rest in order", () => {
    const rows = [match({ catalogId: "a" }), match({ catalogId: "b" }), match({ catalogId: "c" })];
    assert.deepEqual(promoteMatch(rows, 2).map((row) => row.catalogId), ["c", "a", "b"]);
    assert.deepEqual(promoteMatch(rows, 0).map((row) => row.catalogId), ["a", "b", "c"]);
    assert.deepEqual(promoteMatch(rows, 9).map((row) => row.catalogId), ["a", "b", "c"]);
  });
});

describe("flags", () => {
  it("turns the scanner on only for exactly 1", () => {
    assert.equal(scannerEnabled({ NEXT_PUBLIC_SCANNER: "1" }), true);
    assert.equal(scannerEnabled({ NEXT_PUBLIC_SCANNER: "true" }), false);
    assert.equal(scannerEnabled({}), false);
  });

  it("shows the fixture preview outside production, or with the flag on", () => {
    assert.equal(scanPreviewAllowed({ NEXT_PUBLIC_VERCEL_ENV: "preview" }), true);
    assert.equal(scanPreviewAllowed({}), true);
    assert.equal(scanPreviewAllowed({ NEXT_PUBLIC_VERCEL_ENV: "production" }), false);
    assert.equal(scanPreviewAllowed({ NEXT_PUBLIC_VERCEL_ENV: "production", NEXT_PUBLIC_SCANNER: "1" }), true);
  });
});

describe("copy", () => {
  it("is plain and short, with no exclamation marks or the word free", () => {
    for (const text of Object.values(CONFIRM_COPY)) {
      assert.equal(/!/.test(text), false, text);
      assert.equal(/\bfree\b/i.test(text), false, text);
    }
    assert.equal(CONFIRM_COPY.title, "Is this your card?");
  });
});

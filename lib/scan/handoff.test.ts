import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FlowAnswers } from "@/lib/cards/add-flow";
import type { ScanMatch } from "./match";
import {
  SCAN_HANDOFF_VERSION,
  isScanId,
  parseScanHandoff,
  scanAddPath,
  scanCardStart,
  scanHandoffFrom,
  scanOpeningStep,
  type ScanHandoff,
} from "./handoff";

/** Made-up matches. No real collector's card or cert. */
function match(partial: Partial<ScanMatch> = {}): ScanMatch {
  return {
    catalogId: "catalog-1",
    playerName: "Luka Doncic",
    sport: "Basketball",
    yearLabel: "2018-19",
    setBrand: "Panini Prizm",
    cardNumber: "280",
    parallel: "Silver",
    serialRun: null,
    serialNo: "",
    isRookie: true,
    isAuto: false,
    grade: { company: "PSA", number: "10", qualifier: "", certNumber: "45678912", authentic: false, autoGrade: "" },
    score: 120,
    sureness: { player: "sure", year: "sure", set: "sure", number: "sure", parallel: "sure" },
    parallelOptions: [{ name: "Silver", serialRun: null }],
    ...partial,
  };
}

const SCAN_ID = "a1b2c3d4e5f6";

function answers(partial: Partial<FlowAnswers> = {}): FlowAnswers {
  return {
    playerName: "Luka Doncic",
    sport: "Basketball",
    yearLabel: "2018-19",
    setBrand: "Panini Prizm",
    cardNumber: "280",
    noNumber: false,
    parallel: "Silver",
    serialRun: "",
    serialNo: "",
    gradeCompany: "PSA",
    gradeNumber: "10",
    knownRun: null,
    ...partial,
  };
}

describe("scan ids and paths", () => {
  it("puts only the scan id in the Add card link", () => {
    assert.equal(scanAddPath(SCAN_ID), `/cards/new?scan=${SCAN_ID}`);
    assert.equal(scanAddPath(SCAN_ID).includes("45678912"), false);
  });

  it("accepts only short random ids", () => {
    assert.equal(isScanId(SCAN_ID), true);
    assert.equal(isScanId(""), false);
    assert.equal(isScanId("short"), false);
    assert.equal(isScanId("has spaces in it"), false);
    assert.equal(isScanId("x".repeat(65)), false);
  });
});

describe("scanHandoffFrom and parseScanHandoff", () => {
  it("round-trips a match through JSON", () => {
    const handoff = scanHandoffFrom(match(), SCAN_ID);
    assert.equal(handoff.v, SCAN_HANDOFF_VERSION);
    assert.equal(handoff.id, SCAN_ID);
    const parsed = parseScanHandoff(JSON.stringify(handoff));
    assert.deepEqual(parsed, handoff);
  });

  it("carries the one-tap save flag, off unless asked", () => {
    assert.equal(scanHandoffFrom(match(), SCAN_ID).autoSave, false);
    const saving = scanHandoffFrom(match(), SCAN_ID, { autoSave: true });
    assert.equal(parseScanHandoff(JSON.stringify(saving))?.autoSave, true);
    const older: Partial<typeof saving> = { ...saving };
    delete older.autoSave;
    assert.equal(parseScanHandoff(JSON.stringify(older))?.autoSave, false);
    assert.equal(parseScanHandoff(JSON.stringify({ ...saving, autoSave: "yes" })), null);
  });

  it("drops the score and parallel options it doesn't need", () => {
    const handoff = scanHandoffFrom(match(), SCAN_ID) as unknown as Record<string, unknown>;
    assert.equal("score" in handoff, false);
    assert.equal("parallelOptions" in handoff, false);
  });

  it("rejects anything that isn't a handoff", () => {
    assert.equal(parseScanHandoff(null), null);
    assert.equal(parseScanHandoff("not json"), null);
    assert.equal(parseScanHandoff(JSON.stringify({ v: 99 })), null);
    const handoff = scanHandoffFrom(match(), SCAN_ID);
    assert.equal(parseScanHandoff(JSON.stringify({ ...handoff, id: "bad id" })), null);
    assert.equal(parseScanHandoff(JSON.stringify({ ...handoff, playerName: 42 })), null);
    assert.equal(parseScanHandoff(JSON.stringify({ ...handoff, sureness: { player: "maybe" } })), null);
  });

  it("clips overlong text", () => {
    const handoff = scanHandoffFrom(match({ playerName: "x".repeat(500) }), SCAN_ID);
    const parsed = parseScanHandoff(JSON.stringify(handoff));
    assert.ok(parsed && parsed.playerName.length <= 120);
  });
});

describe("scanCardStart", () => {
  it("fills a slab's grade, cert and flags", () => {
    const start = scanCardStart(scanHandoffFrom(match(), SCAN_ID));
    assert.deepEqual(start.form, {
      playerName: "Luka Doncic",
      yearLabel: "2018-19",
      setBrand: "Panini Prizm",
      cardNumber: "280",
      parallel: "Silver",
      serialRun: "",
      serialNo: "",
      sport: "Basketball",
    });
    assert.equal(start.gradeCompany, "PSA");
    assert.equal(start.gradeNumber, "10");
    assert.equal(start.certNumber, "45678912");
    assert.equal(start.isRookie, true);
    assert.equal(start.setIsCustom, false);
    assert.equal(start.parallelIsCustom, false);
    assert.deepEqual(start.snapshot, {
      playerName: "Luka Doncic",
      yearLabel: "2018-19",
      setBrand: "Panini Prizm",
      cardNumber: "280",
      parallel: "Silver",
    });
  });

  it("leaves a raw card's grade empty and keeps an open parallel open", () => {
    const start = scanCardStart(scanHandoffFrom(match({ grade: null, parallel: "", serialRun: 99, serialNo: "12" }), SCAN_ID));
    assert.equal(start.gradeCompany, "");
    assert.equal(start.certNumber, "");
    assert.equal(start.form.parallel, "");
    assert.equal(start.form.serialRun, "99");
    assert.equal(start.form.serialNo, "12");
  });

  it("marks a set or parallel our lists don't know as typed", () => {
    const start = scanCardStart(
      scanHandoffFrom(match({ setBrand: "Sage Hit", parallel: "Lava Swirl", catalogId: null }), SCAN_ID),
    );
    assert.equal(start.setIsCustom, true);
    assert.equal(start.parallelIsCustom, true);
    assert.equal(start.snapshot, null, "no catalog row, so nothing to compare the save against");
  });
});

describe("scanOpeningStep", () => {
  it("opens on Review when every field is sure", () => {
    const handoff: ScanHandoff = scanHandoffFrom(match(), SCAN_ID);
    assert.equal(scanOpeningStep(handoff.sureness, answers()), "review");
  });

  it("opens on the parallel when the scan left it open", () => {
    const handoff = scanHandoffFrom(
      match({ parallel: "", sureness: { player: "sure", year: "sure", set: "sure", number: "sure", parallel: "unsure" } }),
      SCAN_ID,
    );
    assert.equal(scanOpeningStep(handoff.sureness, answers({ parallel: "" })), "parallel");
  });

  it("opens on the first field the scan wasn't sure of", () => {
    const handoff = scanHandoffFrom(
      match({ sureness: { player: "sure", year: "likely", set: "likely", number: "unsure", parallel: "unsure" } }),
      SCAN_ID,
    );
    assert.equal(scanOpeningStep(handoff.sureness, answers()), "number");
  });

  it("asks for the serial number when the parallel is numbered and it wasn't read", () => {
    const handoff = scanHandoffFrom(match({ parallel: "Gold" }), SCAN_ID);
    assert.equal(
      scanOpeningStep(handoff.sureness, answers({ parallel: "Gold", serialRun: "", runVaries: true })),
      "serial",
    );
  });

  it("opens on the player when no player came through", () => {
    const handoff = scanHandoffFrom(match({ playerName: "" }), SCAN_ID);
    assert.equal(scanOpeningStep(handoff.sureness, answers({ playerName: "" })), "player");
  });
});

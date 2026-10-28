import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NOT_SURE_PARALLEL,
  confidenceCopy,
  matchConfidence,
  serialRunFromName,
  type ConfidenceCard,
} from "@/lib/value/match-confidence";
import type { CardValueResult } from "@/lib/value/types";

const card: ConfidenceCard = {
  year: 2023,
  yearLabel: "2023-24",
  setBrand: "Panini Prizm",
  parallel: "Base",
  serialRun: null,
  isAuto: false,
};

function value(patch: Partial<CardValueResult> = {}): CardValueResult {
  return {
    status: "ok",
    median: 42,
    low: 30,
    high: 55,
    nSales: 8,
    matchedAt: "2026-10-01T00:00:00Z",
    ...patch,
  };
}

describe("matchConfidence", () => {
  it("is none for a not-sure parallel, or with no year or set", () => {
    assert.equal(matchConfidence({ ...card, parallel: NOT_SURE_PARALLEL }, value()), "none");
    assert.equal(matchConfidence({ ...card, parallel: "parallel (Not Sure)" }, value()), "none");
    assert.equal(matchConfidence({ ...card, year: 0, yearLabel: "" }, value()), "none");
    assert.equal(matchConfidence({ ...card, setBrand: "  " }, value()), "none");
  });

  it("is weak for a numbered parallel with no run", () => {
    const red = { ...card, parallel: "Red" };
    assert.equal(matchConfidence(red, value(), { knownRun: 299 }), "weak");
    assert.equal(matchConfidence(red, value(), { runVaries: true }), "weak");
    assert.equal(matchConfidence({ ...card, parallel: "Gold /10" }, value()), "weak");
    assert.equal(matchConfidence({ ...card, parallel: "Superfractor" }, value()), "weak");
    // With the run saved, it is strong again.
    assert.equal(matchConfidence({ ...red, serialRun: 299 }, value(), { knownRun: 299 }), "strong");
    // Unnumbered color: strong.
    assert.equal(matchConfidence({ ...card, parallel: "Silver" }, value(), { knownRun: null }), "strong");
    // Base never needs a run.
    assert.equal(matchConfidence(card, value(), { knownRun: 99 }), "strong");
  });

  it("is weak for one low sale on an auto /99", () => {
    const auto = { ...card, parallel: "Purple", serialRun: 99, isAuto: true };
    assert.equal(matchConfidence(auto, value({ nSales: 1, median: 3, low: 3, high: 3 })), "weak");
    assert.equal(
      matchConfidence(auto, value({ nSales: 1, median: 3 }), { sales: [{ price: 3 }] }),
      "weak",
    );
    assert.equal(matchConfidence(auto, value({ nSales: 1, median: 80 })), "strong");
  });

  it("is strong for a normal multi-sale read", () => {
    assert.equal(matchConfidence(card, value()), "strong");
    assert.equal(matchConfidence(card, null), "strong", "no value yet is not a weak match");
  });

  it("reads runs from parallel names", () => {
    assert.equal(serialRunFromName("Gold /10"), 10);
    assert.equal(serialRunFromName("Black 1/1"), 1);
    assert.equal(serialRunFromName("Superfractor"), 1);
    assert.equal(serialRunFromName("Red"), null);
    assert.equal(serialRunFromName(""), null);
  });
});

describe("confidenceCopy", () => {
  it("never puts a dollar figure in weak or none copy", () => {
    const weak = confidenceCopy("weak", { ...card, parallel: "Red" }, { knownRun: 299 });
    assert.equal(weak?.text, "We need one more detail to price this");
    assert.equal(weak?.fix?.label, "Add the print run");
    const thin = confidenceCopy("weak", { ...card, parallel: "Purple", serialRun: 99, isAuto: true });
    assert.equal(thin?.fix?.label, "Check the card details");
    const none = confidenceCopy("none", { ...card, parallel: NOT_SURE_PARALLEL });
    assert.equal(none?.text, "No price yet");
    assert.equal(none?.fix?.label, "Pick your parallel to see a price");
    const noYear = confidenceCopy("none", { ...card, year: 0, yearLabel: "" });
    assert.equal(noYear?.fix?.label, "Add the year and set");
    for (const copy of [weak, thin, none, noYear]) {
      assert.doesNotMatch(`${copy?.text} ${copy?.fix?.label}`, /\$/);
    }
    assert.equal(confidenceCopy("strong", card), null);
  });
});

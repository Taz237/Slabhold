import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveLiveCardPreview } from "./open-to-offers";

const profiles = [{ id: "owner", username: "ada" }];
const base = {
  id: "card-1",
  ownerId: "owner",
  openToOffers: true,
  playerName: "Jordan Love",
  year: 2020,
  setBrand: "Select",
  photoDataUrl: null,
};

describe("live card preview grade", () => {
  it("carries the grade for a graded card", () => {
    const live = resolveLiveCardPreview("card-1", [{ ...base, grade: "10", grader: "PSA", conditionType: "graded" as const }], profiles);
    assert.equal(live?.grade, "PSA 10");
  });

  it("has no grade for a raw card or one without a number", () => {
    assert.equal(resolveLiveCardPreview("card-1", [{ ...base, conditionType: "raw" as const, grade: "10" }], profiles)?.grade, null);
    assert.equal(resolveLiveCardPreview("card-1", [base], profiles)?.grade, null);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cardIdentityKey, type IdentityCard } from "./card-identity";

const love: IdentityCard = {
  playerName: "Jordan Love",
  year: 2020,
  yearLabel: "2020",
  setBrand: "Panini Select",
  cardNumber: "47",
  parallel: "Base",
  conditionType: "graded",
  grade: "PSA 10",
  grader: "PSA",
};

describe("cardIdentityKey", () => {
  it("treats a leading # on the card number as the same number", () => {
    assert.equal(
      cardIdentityKey({ ...love, cardNumber: "#47" }),
      cardIdentityKey({ ...love, cardNumber: "47" }),
    );
  });

  it("treats Select and Panini Select as the same set", () => {
    assert.equal(
      cardIdentityKey({ ...love, setBrand: "Select" }),
      cardIdentityKey({ ...love, setBrand: "Panini Select" }),
    );
  });

  it("keeps PSA 10 distinct from PSA 9", () => {
    assert.notEqual(
      cardIdentityKey(love),
      cardIdentityKey({ ...love, grade: "PSA 9", grader: "PSA" }),
    );
  });

  it("keeps PSA 10 distinct from raw", () => {
    assert.notEqual(
      cardIdentityKey(love),
      cardIdentityKey({
        ...love,
        conditionType: "raw",
        grade: "Raw",
        grader: null,
      }),
    );
  });

  it("keeps Base distinct from Silver", () => {
    assert.notEqual(
      cardIdentityKey({ ...love, parallel: "Base" }),
      cardIdentityKey({ ...love, parallel: "Silver" }),
    );
  });

  it("treats a missing parallel as base", () => {
    assert.equal(
      cardIdentityKey({ ...love, parallel: null }),
      cardIdentityKey({ ...love, parallel: "Base" }),
    );
  });

  it("uses the season label from the comps year helper", () => {
    const season = cardIdentityKey({
      ...love,
      year: 2023,
      yearLabel: "2023-24",
    });
    assert.equal(
      season,
      cardIdentityKey({ ...love, year: 2023, yearLabel: "2023-24" }),
    );
    assert.notEqual(
      season,
      cardIdentityKey({ ...love, year: 2024, yearLabel: "2024" }),
    );
  });

  it("builds a stable lowercase key", () => {
    assert.equal(
      cardIdentityKey({ ...love, cardNumber: "#47", parallel: null }),
      "jordan love|2020|select|47|base|psa 10",
    );
  });
});

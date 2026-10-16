import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidYear } from "./card-options";

describe("isValidYear", () => {
  const nextYear = new Date().getFullYear() + 1;

  it("accepts YYYY within range", () => {
    assert.equal(isValidYear("2026"), true);
  });

  it("accepts season YYYY-YY when YY is next year mod 100", () => {
    assert.equal(isValidYear("2023-24"), true);
    assert.equal(isValidYear("1999-00"), true);
  });

  it("rejects mismatched season end", () => {
    assert.equal(isValidYear("2023-25"), false);
  });

  it("rejects trailing junk", () => {
    assert.equal(isValidYear("1999-00x"), false);
  });

  it("rejects years before 1900", () => {
    assert.equal(isValidYear("1899"), false);
  });

  it("rejects next year + 1", () => {
    assert.equal(isValidYear(String(nextYear + 1)), false);
  });
});

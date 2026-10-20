import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import {
  shouldRefreshCardValueOnEdit,
  type PriceRefreshCard,
} from "./price-refresh";

const base: PriceRefreshCard = {
  id: "ba95893e-89fe-4735-be3f-1509b6b6f3b9",
  playerName: "Jordan Love",
  year: 2020,
  yearLabel: "2020",
  setBrand: "Prizm",
  cardNumber: "47",
  parallel: "Base",
  conditionType: "graded",
  grade: "PSA 10",
  grader: "PSA",
  sport: "Football",
  noNumber: false,
  isRookie: false,
};

describe("shouldRefreshCardValueOnEdit", () => {
  it("does not refresh for notes, paid, photos, or visibility", () => {
    assert.equal(
      shouldRefreshCardValueOnEdit(base, {
        ...base,
        // notes / paid / photos / visibility are not on PriceRefreshCard —
        // identity + query_key + sport unchanged means no refresh
      }),
      false,
    );
    assert.equal(
      shouldRefreshCardValueOnEdit(base, { ...base, sport: "Football" }),
      false,
    );
  });

  it("refreshes when grade or other price fields change", () => {
    assert.equal(
      shouldRefreshCardValueOnEdit(base, { ...base, grade: "PSA 9" }),
      true,
    );
    assert.equal(
      shouldRefreshCardValueOnEdit(base, { ...base, playerName: "Other" }),
      true,
    );
    assert.equal(
      shouldRefreshCardValueOnEdit(base, { ...base, sport: "Basketball" }),
      true,
    );
    assert.equal(
      shouldRefreshCardValueOnEdit(base, { ...base, parallel: "Silver" }),
      true,
    );
  });

  it("refreshes when noNumber toggles", () => {
    assert.equal(
      shouldRefreshCardValueOnEdit(base, { ...base, noNumber: true }),
      true,
    );
    assert.equal(
      shouldRefreshCardValueOnEdit(
        { ...base, noNumber: true },
        { ...base, noNumber: false },
      ),
      true,
    );
  });

  it("refreshes when isRookie toggles", () => {
    assert.equal(
      shouldRefreshCardValueOnEdit(base, { ...base, isRookie: true }),
      true,
    );
    assert.equal(
      shouldRefreshCardValueOnEdit(
        { ...base, isRookie: true },
        { ...base, isRookie: false },
      ),
      true,
    );
  });

  it("notes-only edit still does not refresh", () => {
    assert.equal(shouldRefreshCardValueOnEdit(base, { ...base }), false);
  });

  it("gates scheduleCardValueRefresh in collection-provider; notes-only skips the limiter", () => {
    const source = readFileSync(
      join(process.cwd(), "components/collection-provider.tsx"),
      "utf8",
    );
    assert.match(source, /shouldRefreshCardValueOnEdit\(previous, updated\)/);
    assert.match(source, /if \(needsRefresh\) scheduleCardValueRefresh\(id\)/);
    assert.equal(
      /scheduleCardValueRefresh\(id\)/.test(source) &&
        !/shouldRefreshCardValueOnEdit/.test(source),
      false,
    );
  });
});

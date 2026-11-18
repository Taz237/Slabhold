import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { manualYearError, readManualYear, splitManualQuery } from "./manual-year";

describe("Quick Comp manual year", () => {
  it("reads 2023 however a phone types it", () => {
    for (const typed of ["2023", " 2023 ", "2023.", "２０２３", "2023​"]) {
      assert.deepEqual(readManualYear(typed), { year: 2023, yearLabel: "2023" }, JSON.stringify(typed));
    }
  });

  it("reads seasons with a hyphen, a smart dash or a slash", () => {
    for (const typed of ["2023-24", "2023–24", "2023—24", "2023 - 24", "2023/24", "2023-2024"]) {
      assert.deepEqual(readManualYear(typed), { year: 2023, yearLabel: "2023-24" }, typed);
    }
  });

  it("still says no to what isn't a year", () => {
    for (const typed of ["", "23", "abc", "2023-25", "1850"]) assert.equal(readManualYear(typed), null, typed);
  });

  it("explains the problem right away", () => {
    assert.equal(manualYearError(""), "Add the year");
    assert.equal(manualYearError("2023"), "");
    assert.equal(manualYearError("2023–24"), "");
    assert.equal(manualYearError("23"), "Use a year like 2023 or 2023-24");
  });

  it("moves a year typed in the search into the Year box", () => {
    assert.deepEqual(splitManualQuery("Darius Acuff 2023"), { player: "Darius Acuff", year: "2023" });
    assert.deepEqual(splitManualQuery("2023-24 Wemby"), { player: "Wemby", year: "2023-24" });
    assert.deepEqual(splitManualQuery("Darius Acuff"), { player: "Darius Acuff", year: "" });
    // A card number or print run is not a year.
    assert.deepEqual(splitManualQuery("Acuff #2023"), { player: "Acuff #2023", year: "" });
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { searchSelectCommit } from "./search-select";

describe("search select commit", () => {
  const options = ["Base", "Pink", "Silver"];

  it("keeps a typed parallel that is not in the list", () => {
    assert.equal(
      searchSelectCommit({
        query: "Optic Preview-Pink",
        options,
        allowCustom: true,
      }),
      "Optic Preview-Pink",
    );
    assert.equal(
      searchSelectCommit({
        query: "Optic Preview Pink",
        options,
        allowCustom: true,
      }),
      "Optic Preview Pink",
    );
  });

  it("uses the listed spelling for an exact match and ignores a shorter partial", () => {
    assert.equal(
      searchSelectCommit({ query: "pink", options, allowCustom: true }),
      "Pink",
    );
    assert.equal(
      searchSelectCommit({ query: "Pin", options, allowCustom: true }),
      "Pin",
    );
    assert.equal(
      searchSelectCommit({ query: "My Set", options: ["Donruss Optic"], allowCustom: true }),
      "My Set",
    );
  });

  it("rejects a custom year that is not a year, and does not invent one", () => {
    assert.equal(
      searchSelectCommit({
        query: "20",
        options: ["2024", "2025"],
        allowCustom: true,
        isCustomValid: (value) => /^\d{4}$/.test(value),
      }),
      null,
    );
  });

  it("is what Enter uses for Set and Parallel on Add Card and Mail Day", () => {
    const select = readFileSync(join(process.cwd(), "components/search-select.tsx"), "utf8");
    const card = readFileSync(join(process.cwd(), "components/card-form.tsx"), "utf8");
    const mail = readFileSync(join(process.cwd(), "components/mail-day-form.tsx"), "utf8");
    assert.match(select, /searchSelectCommit\(/);
    assert.match(select, /Can't find it\? Type it exactly as on the card or slab\./);
    const useRow = select.indexOf("Use \"");
    const options = select.indexOf("filtered.map");
    assert.ok(useRow > 0 && options > useRow);
    for (const source of [card, mail]) {
      assert.match(source, /label="Set[\s\S]*?allowCustom/);
      assert.match(source, /label="Set[\s\S]*?customHint/);
      assert.match(source, /label="Parallel"[\s\S]*?allowCustom/);
      assert.match(source, /label="Parallel"[\s\S]*?customHint/);
      assert.match(source, /parallelChoice\(/);
    }
  });
});

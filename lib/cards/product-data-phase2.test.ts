import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parallelGroups } from "@/lib/cards/add-flow";
import { loadProductData, parallelsIn, productForSet } from "@/lib/cards/product-data";
import topps from "@/lib/cards/data/topps-parallels.json";

describe("checklists: both files load and official rows stay", () => {
  it("loads Panini and Topps files together", async () => {
    const data = await loadProductData();
    assert.ok(Array.isArray(topps), "topps-parallels.json is an array");
    assert.equal(data.length >= 17 + topps.length, true);
    for (const row of data) {
      assert.ok(row.source?.trim(), `${row.yearLabel} ${row.product} names its source`);
      for (const parallel of row.parallels) {
        assert.ok(parallel.serialRun === null || (Number.isInteger(parallel.serialRun) && parallel.serialRun >= 1));
      }
    }
  });

  it("keeps the 2023-24 / 2024-25 / 2025-26 Prizm and Select basketball rows", async () => {
    const data = await loadProductData();
    for (const [year, set] of [
      ["2023-24", "Panini Prizm"],
      ["2023-24", "Panini Select"],
      ["2024-25", "Panini Prizm"],
      ["2025-26", "Panini Prizm"],
      ["2025-26", "Panini Select"],
    ]) {
      const product = productForSet(data, "Basketball", year, set);
      assert.ok(product?.official, `${year} ${set} is official`);
    }
  });

  it("puts official names on Parallel or insert as chips, without typing", async () => {
    const data = await loadProductData();
    const checklist = parallelsIn(data, "Basketball", "2024-25", "Panini Prizm");
    const groups = parallelGroups(checklist, "Panini Prizm", "Base");
    const shown = groups.parallels.map((option) => option.name);
    assert.ok(checklist.length > 12, "a long official list");
    for (const name of checklist.slice(1).map((item) => item.name)) {
      assert.ok(
        shown.includes(name) || groups.inserts.options.some((option) => option.name === name),
        `${name} is on screen`,
      );
    }
  });

  it("a set with no checklist row still gets the built-in list", async () => {
    const data = await loadProductData();
    assert.deepEqual(parallelsIn(data, "Baseball", "2024", "Topps Chrome"), []);
    assert.ok(parallelGroups(null, "Topps Chrome", "Base").parallels.length > 0);
  });
});

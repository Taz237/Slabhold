import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { insertLeadSets, insertsForSet } from "@/lib/cards/data/popular-inserts";
import { parallelGroups } from "@/lib/cards/add-flow";

describe("Color Blast is a visible chip on Donruss and Optic", () => {
  it("shows Color Blast on Donruss Optic and Panini Donruss, keeping Downtown and Kaboom", () => {
    for (const set of ["Donruss Optic", "Panini Donruss"]) {
      const names = insertsForSet(set).names;
      assert.ok(names.includes("Color Blast"), `${set} has Color Blast`);
      assert.ok(names.includes("Downtown"), `${set} keeps Downtown`);
      assert.ok(names.includes("Kaboom"), `${set} keeps Kaboom`);
    }
  });

  it("keeps Color Blast on the close Panini family", () => {
    assert.ok(insertsForSet("Panini Prizm").names.includes("Color Blast"));
  });

  it("is a chip on Parallel or insert with no run and before the collector picks it", () => {
    const groups = parallelGroups(null, "Donruss Optic", "Base");
    const option = groups.inserts.options.find((item) => item.name === "Color Blast");
    assert.ok(option, "Color Blast chip is on screen without typing");
    assert.equal(option.serialRun, null);
  });

  it("leads the Set step with Donruss Optic once Color Blast is chosen", () => {
    assert.deepEqual(insertLeadSets("Color Blast").slice(0, 1), ["Donruss Optic"]);
    assert.ok(insertLeadSets("color blast").includes("Panini Donruss"));
  });
});

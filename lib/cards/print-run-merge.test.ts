import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ProductRecord } from "./product-data";
import { mergeKey, mergePrintRuns, splitGluedRows, subsetsFor } from "./print-run-merge";

const record = (parallels: ProductRecord["parallels"]): ProductRecord => ({
  sport: "Baseball",
  yearLabel: "2025",
  product: "Topps Chrome",
  manufacturer: "Topps",
  source: "official odds sheet",
  official: true,
  parallels,
});

describe("matching a parallel's name across the two lists", () => {
  it("gives or takes Refractor, Parallel and Border, word order, RayWave and the Fuschia typo", () => {
    assert.equal(mergeKey("Gold Lava"), mergeKey("Gold Lava Refractor"));
    assert.equal(mergeKey("Purple Raywave"), mergeKey("RayWave Purple Refractor"));
    assert.equal(mergeKey("Purple Ray Wave"), mergeKey("Purple RayWave"));
    assert.equal(mergeKey("Fuschia Geometric Parallel"), mergeKey("Fuchsia Geometric Refractor"));
    assert.equal(mergeKey("Fuchsia"), mergeKey("Fuchsia Border"));
    assert.equal(mergeKey("Frozenfractors"), mergeKey("FrozenFractor"));
    assert.notEqual(mergeKey("Gold"), mergeKey("Gold Wave"));
    // A bare Refractor stays Refractor: never the empty name.
    assert.equal(mergeKey("Refractor"), "refractor");
    assert.equal(mergeKey("Refractor Parallel"), "refractor");
    assert.equal(mergeKey("Superfractor Parallel"), mergeKey("SuperFractor"));
  });

  it("splits two rows the page glued into one, and drops a run that isn't one", () => {
    assert.deepEqual(splitGluedRows([{ subset: "Base", name: "Purple RayWave Refractor /250  Aqua Refractor", serialRun: 199 }]), [
      { subset: "Base", name: "Purple RayWave Refractor", serialRun: 250 },
      { subset: "Base", name: "Aqua Refractor", serialRun: 199 },
    ]);
    assert.deepEqual(splitGluedRows([{ subset: "Base", name: "FrozenFractor /-5  SuperFractor", serialRun: 1 }]), [
      { subset: "Base", name: "FrozenFractor", serialRun: null, unsure: true },
      { subset: "Base", name: "SuperFractor", serialRun: 1 },
    ]);
  });

  it("reads a run and the odds the page left in a name", () => {
    assert.deepEqual(splitGluedRows([{ subset: "Base Chrome", name: "Refractor /499 (1:20 Hobby", serialRun: null }]), [
      { subset: "Base Chrome", name: "Refractor", serialRun: 499 },
    ]);
    assert.deepEqual(splitGluedRows([{ subset: "Base Chrome", name: "SuperFractor 1/1 (1:10,243 Hobby", serialRun: null }]), [
      { subset: "Base Chrome", name: "SuperFractor", serialRun: 1 },
    ]);
    assert.deepEqual(splitGluedRows([{ subset: "Base", name: "FrozenFractor /-5", serialRun: null }]), [
      { subset: "Base", name: "FrozenFractor", serialRun: null, unsure: true },
    ]);
    // The name and the row disagree on the run: unknown.
    assert.deepEqual(splitGluedRows([{ subset: "Base", name: "Gold /50", serialRun: 25 }]), [{ subset: "Base", name: "Gold", serialRun: null, unsure: true }]);
  });

  it("reads only the base lists: never an insert, autograph or variation list", () => {
    assert.deepEqual(subsetsFor("Base"), ["base", "base chrome", "base paper"]);
    assert.deepEqual(subsetsFor("Base and Paper Prospects"), ["base paper", "paper prospects"]);
    assert.deepEqual(subsetsFor("Chrome Prospects"), ["chrome prospects", "bowman chrome prospects"]);
    assert.equal(subsetsFor("Base Card Image Variations"), null);
    assert.equal(subsetsFor("Base Set Retrofractor Variation"), null);
  });
});

describe("filling print runs into a list that has none", () => {
  const source = {
    source: "https://example.test/checklist",
    parallels: [
      { subset: "Base", name: "Refractor", serialRun: null },
      { subset: "Base", name: "Gold Refractor", serialRun: 50 },
      { subset: "Base", name: "Gold Wave Refractor", serialRun: 50 },
      { subset: "Base", name: "Purple RayWave Refractor /250  Aqua Refractor", serialRun: 199 },
      { subset: "Base", name: "Purple Refractor", serialRun: 250 },
      { subset: "Base", name: "Green Refractor", serialRun: 99 },
      { subset: "Base", name: "Green Refractor", serialRun: 75 },
      { subset: "Base Autographs", name: "Red Refractor", serialRun: 5 },
      { subset: "Base", name: "Superfractor", serialRun: 1 },
    ],
  };

  it("fills a run only when the other list agrees on one; never overwrites, never guesses", () => {
    const merged = mergePrintRuns(
      record([
        { subset: "Base", name: "Base", serialRun: null },
        { subset: "Base", name: "Refractor", serialRun: null },
        { subset: "Base", name: "Gold Refractor", serialRun: null },
        { subset: "Base", name: "Aqua Refractor", serialRun: null },
        { subset: "Base", name: "Purple Raywave", serialRun: null },
        { subset: "Base", name: "Green", serialRun: null },
        { subset: "Base", name: "Red", serialRun: null },
        { subset: "Base Card Image Variations", name: "Gold", serialRun: null },
      ]),
      source,
    );
    const run = (subset: string, name: string) => merged.record.parallels.find((row) => row.subset === subset && row.name === name)?.serialRun;
    assert.equal(run("Base", "Refractor"), null);
    assert.equal(run("Base", "Gold Refractor"), 50);
    assert.equal(run("Base", "Aqua Refractor"), 199);
    assert.equal(run("Base", "Purple Raywave"), 250);
    // The two lists disagree (99 and 75): left unknown.
    assert.equal(run("Base", "Green"), null);
    assert.deepEqual(merged.conflicts, ["Base: Green (75, 99)"]);
    // Only in an autograph list: not this card's run.
    assert.equal(run("Base", "Red"), null);
    assert.deepEqual(merged.unmatched, ["Base: Red"]);
    // A variation list is never filled.
    assert.equal(run("Base Card Image Variations", "Gold"), null);
    assert.equal(merged.record.runsFrom, "https://example.test/checklist");
  });

  it("adds the other list's numbered parallels this one lacks, so a shared run stays shared", () => {
    const merged = mergePrintRuns(record([{ subset: "Base", name: "Gold Refractor", serialRun: null }]), source);
    const names = merged.record.parallels.map((row) => `${row.name} ${row.serialRun ?? ""}`.trim());
    // Gold Wave /50 is added: a /50 read can't be called Gold on our say-so.
    assert.ok(names.includes("Gold Wave Refractor 50"));
    assert.ok(names.includes("Purple Refractor 250"));
    assert.ok(names.includes("Superfractor 1"));
    // Unnumbered, conflicting and autograph rows are never added.
    assert.ok(!names.some((name) => name.startsWith("Refractor")));
    assert.ok(!names.some((name) => name.startsWith("Green")));
    assert.ok(!names.some((name) => name.startsWith("Red")));
    assert.deepEqual(merged.added.sort(), ["Base: Aqua Refractor /199", "Base: Gold Wave Refractor /50", "Base: Purple RayWave Refractor /250", "Base: Purple Refractor /250", "Base: Superfractor /1"].sort());
  });

  it("leaves a list that already has print runs alone", () => {
    const already = record([{ subset: "Base", name: "Gold Refractor", serialRun: 49 }]);
    const merged = mergePrintRuns(already, source);
    assert.equal(merged.record, already);
    assert.deepEqual(merged.added, []);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ProductRecord } from "./product-data";
import { hobbyListRecord, mergeKey, mergePrintRuns, splitGluedRows, subsetsFor, withBowmanPrefixes } from "./print-run-merge";

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

  it("never adds a name the list already has in another subset", () => {
    const paper = {
      source: "https://example.test/bowman",
      parallels: [
        { subset: "Base Paper", name: "Gold Border", serialRun: 50 },
        { subset: "Paper Prospects", name: "Gold Border", serialRun: 50 },
        { subset: "Base Paper", name: "Red Border", serialRun: 5 },
      ],
    };
    const merged = mergePrintRuns(
      record([
        { subset: "Base", name: "Base", serialRun: null },
        { subset: "Base and Paper Prospects", name: "Gold Border", serialRun: null },
      ]),
      paper,
    );
    const names = merged.record.parallels.map((row) => row.name.toLowerCase());
    assert.equal(new Set(names).size, names.length, names.join(", "));
    assert.equal(merged.record.parallels.find((row) => row.name === "Gold Border")?.serialRun, 50);
    assert.deepEqual(merged.added, ["Base: Red Border /5"]);
  });

  it("a name filled with two different runs in two subsets is left unknown in both", () => {
    const merged = mergePrintRuns(
      record([
        { subset: "Base", name: "Red Geometric", serialRun: null },
        { subset: "Chrome Prospects", name: "Red Geometric", serialRun: null },
        { subset: "Base", name: "Gold Refractor", serialRun: null },
        { subset: "Chrome Prospects", name: "Gold Refractor", serialRun: null },
      ]),
      {
        parallels: [
          { subset: "Base Chrome", name: "Red Geometric Refractor", serialRun: 10 },
          { subset: "Chrome Prospects", name: "Red Geometric Refractor", serialRun: 5 },
          { subset: "Base Chrome", name: "Gold Refractor", serialRun: 50 },
          { subset: "Chrome Prospects", name: "Gold Refractor", serialRun: 50 },
        ],
      },
    );
    const runs = merged.record.parallels.map((row) => `${row.subset}: ${row.name} ${row.serialRun}`);
    assert.deepEqual(runs, ["Base: Red Geometric null", "Chrome Prospects: Red Geometric null", "Base: Gold Refractor 50", "Chrome Prospects: Gold Refractor 50"]);
    assert.equal(merged.conflicts.length, 2);
  });

  it("leaves a list that already has print runs alone", () => {
    const already = record([{ subset: "Base", name: "Gold Refractor", serialRun: 49 }]);
    const merged = mergePrintRuns(already, source);
    assert.equal(merged.record, already);
    assert.deepEqual(merged.added, []);
  });
});

describe("two parallels that only share a color", () => {
  it("paper Fuchsia Border /299 and chrome Fuchsia Refractor /199 both keep their runs", () => {
    const merged = mergePrintRuns(
      {
        sport: "Baseball",
        yearLabel: "2025",
        product: "Bowman",
        manufacturer: "Topps",
        parallels: [
          { subset: "Base and Paper Prospects", name: "Fuchsia Border", serialRun: null },
          { subset: "Chrome Prospects", name: "Fuchsia Refractor", serialRun: null },
        ],
      },
      {
        parallels: [
          { subset: "Base Paper", name: "Fuchsia Border", serialRun: 299 },
          { subset: "Paper Prospects", name: "Fuchsia Border", serialRun: 299 },
          { subset: "Chrome Prospects", name: "Fuchsia Refractor", serialRun: 199 },
        ],
      },
    );
    assert.deepEqual(merged.record.parallels.map((row) => row.serialRun), [299, 199]);
    assert.deepEqual(merged.conflicts, []);
  });
});

describe("the shipped Topps file", () => {
  it("2025 Topps Chrome: Gold Refractor is /50, X-Fractor stays unnumbered, and /50 alone names no parallel", async () => {
    const { loadProductData, onlyParallelAtRun, parallelsIn } = await import("./product-data");
    const data = await loadProductData();
    const list = parallelsIn(data, "Baseball", "2025", "Topps Chrome");
    const run = (name: string) => list.find((item) => item.name === name)?.serialRun;
    assert.equal(run("Gold Refractor"), 50);
    assert.equal(run("Gold Wave"), 50);
    assert.equal(run("Orange Refractor"), 25);
    assert.equal(run("Superfractor"), 1);
    assert.equal(run("X-Fractor"), null);
    assert.equal(run("Refractor"), null);
    // Gold, Gold Wave, Gold Lava, Gold Geometric and Gold RayWave all share /50: open beats wrong.
    assert.equal(onlyParallelAtRun(data, { yearLabel: "2025", setBrand: "Topps Chrome", cardNumber: "48", parallel: "Gold Refractor" }, 50), false);
  });

  it("2025 Bowman: paper Fuchsia Border /299 and chrome Fuchsia Refractor /199 keep their own runs", async () => {
    const { loadProductData, parallelsIn } = await import("./product-data");
    const list = parallelsIn(await loadProductData(), "Baseball", "2025", "Bowman");
    assert.equal(list.find((item) => item.name === "Fuchsia Border")?.serialRun, 299);
    assert.equal(list.find((item) => item.name === "Fuchsia Refractor")?.serialRun, 199);
  });
});

describe("a list for a Topps product we had none for", () => {
  const page = {
    sport: "Baseball",
    yearLabel: "2025",
    product: "Bowman Draft",
    manufacturer: "Topps",
    source: "https://example.test/bowman-draft",
    parallels: [
      { subset: "Base Chrome", name: "Refractor", serialRun: null },
      { subset: "Base Chrome", name: "Gold Refractor /50 (1:193 Hobby", serialRun: null },
      { subset: "Base Chrome", name: "Purple Refractor", serialRun: 250 },
      { subset: "Base Paper", name: "Purple Refractor", serialRun: 199 },
      { subset: "Chrome Prospect Autographs", name: "Red Refractor", serialRun: 5 },
      { subset: "Base Chrome", name: "(1:20 Hobby", serialRun: null },
    ],
  };

  it("takes the base subsets only, Base first, one row per name; two runs for one name stay unknown", () => {
    const record = hobbyListRecord(page);
    assert.ok(record);
    assert.equal(record.official, false);
    assert.equal(record.source, "https://example.test/bowman-draft");
    assert.deepEqual(
      record.parallels.map((row) => [row.name, row.serialRun]),
      [
        ["Base", null],
        ["Refractor", null],
        ["Gold Refractor", 50],
        ["Purple Refractor", null],
      ],
    );
  });

  it("a page with no base parallels gives no list", () => {
    assert.equal(hobbyListRecord({ ...page, parallels: [{ subset: "Autographs", name: "Gold", serialRun: 50 }] }), null);
  });
});

describe("Bowman's paper and chrome lists", () => {
  it("get the BP- and BCP- split the 2024 list has; any other product is left alone", () => {
    const bowman: ProductRecord = {
      sport: "Baseball",
      yearLabel: "2025",
      product: "Bowman",
      manufacturer: "Topps",
      parallels: [
        { subset: "Base", name: "Base", serialRun: null },
        { subset: "Base and Paper Prospects", name: "Fuchsia Border", serialRun: 299 },
        { subset: "Chrome Prospects", name: "Speckle", serialRun: 299 },
      ],
    };
    const split = withBowmanPrefixes(bowman);
    assert.deepEqual(split.parallels.map((row) => row.cardPrefixes ?? null), [null, ["", "BP"], ["BCP"]]);
    assert.equal(withBowmanPrefixes({ ...bowman, product: "Bowman Chrome" }).parallels[1].cardPrefixes, undefined);
    assert.equal(withBowmanPrefixes(split), split);
  });

  it("in the shipped file, a BP- card's /299 is the Fuchsia Border alone, and a BCP- card's is the chrome Speckle", async () => {
    const { loadProductData, parallelsIn } = await import("./product-data");
    const data = await loadProductData();
    const at = (cardNumber: string, run: number) =>
      parallelsIn(data, "Baseball", "2025", "Bowman", cardNumber).filter((item) => item.serialRun === run).map((item) => item.name);
    assert.deepEqual(at("BP-38", 299), ["Fuchsia Border"]);
    assert.deepEqual(at("BCP-22", 299), ["Speckle"]);
    // Three chrome parallels share /199: still open.
    assert.equal(at("BCP-22", 199).length, 3);
  });
});

describe("a base and rookie list that disagree", () => {
  it("keeps a run both lists give, leaves one they disagree on unknown, and drops image variations", () => {
    const record = hobbyListRecord({
      sport: "Football",
      yearLabel: "2025",
      product: "Topps Chrome",
      manufacturer: "Topps",
      parallels: [
        { subset: "Base", name: "Green Wave Refractor", serialRun: 99 },
        { subset: "Base Rookies", name: "Green Wave Refractor", serialRun: 100 },
        { subset: "Base", name: "Gold Refractor", serialRun: 50 },
        { subset: "Base Rookies", name: "Gold Refractor", serialRun: 50 },
        { subset: "Base Rookies", name: "Teal Wave Refractor", serialRun: 299 },
        { subset: "Base", name: "Touchdown Variations", serialRun: null },
        { subset: "Base", name: "Red/White/Blue Refractor", serialRun: null },
      ],
    });
    assert.ok(record);
    assert.deepEqual(
      record.parallels.map((row) => [row.name, row.serialRun]),
      [
        ["Base", null],
        ["Green Wave Refractor", null],
        ["Gold Refractor", 50],
        ["Teal Wave Refractor", 299],
        ["Red/White/Blue Refractor", null],
      ],
    );
  });
});

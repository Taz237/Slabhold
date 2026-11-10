import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_LABELS, STEP_QUESTIONS, parallelGroups, parallelOptions, answerParallel, emptyFlowAnswers } from "@/lib/cards/add-flow";
import {
  POPULAR_INSERTS,
  canonicalInsertName,
  insertLeadSets,
  insertsForSet,
  seedInsert,
  splitInsertFromQuery,
} from "@/lib/cards/data/popular-inserts";
import { parallelSwatch } from "@/lib/cards/parallel-swatch";
import { PARALLELS_BY_SET, parallelChoice } from "@/lib/cards/parallels";
import { loadProductData, parallelsIn } from "@/lib/cards/product-data";

const names = (options: readonly { name: string }[]) => options.map((option) => option.name);

describe("popular insert seed", () => {
  it("has Kaboom, Downtown and Color Blast, names only, no runs", () => {
    assert.deepEqual(names(POPULAR_INSERTS), ["Kaboom", "Downtown", "Color Blast"]);
    for (const item of POPULAR_INSERTS) assert.equal(item.serialRun, null, item.name);
    assert.equal(seedInsert("Downtowns"), null, "no plural chip");
    assert.equal(seedInsert("Case Hit"), null);
  });

  it("treats Kaboom! as Kaboom", () => {
    assert.equal(seedInsert("Kaboom!")?.name, "Kaboom");
    assert.equal(seedInsert("kaboom")?.name, "Kaboom");
    assert.equal(canonicalInsertName("KABOOM!"), "Kaboom");
    assert.deepEqual(splitInsertFromQuery("Malik Nabers Kaboom!"), { insert: "Kaboom", rest: "Malik Nabers" });
    assert.deepEqual(splitInsertFromQuery("Tyrese Maxey Color Blast"), { insert: "Color Blast", rest: "Tyrese Maxey" });
    assert.deepEqual(splitInsertFromQuery("Tyrese Maxey"), { insert: null, rest: "Tyrese Maxey" });
  });

  it("gives every seed name a defined swatch", () => {
    for (const item of POPULAR_INSERTS) {
      const swatch = parallelSwatch(item.name);
      assert.equal(typeof swatch.background, "string", item.name);
      assert.ok(swatch.background.length > 0, item.name);
    }
  });

  it("maps the families: Downtown on Optic and Donruss, Kaboom on Donruss, Optic, Absolute and close Panini sets", () => {
    assert.ok(insertsForSet("Donruss Optic").names.includes("Downtown"));
    assert.ok(insertsForSet("Donruss Optic").names.includes("Kaboom"));
    assert.ok(insertsForSet("Panini Donruss").names.includes("Kaboom"));
    assert.ok(insertsForSet("Panini Donruss").names.includes("Downtown"));
    assert.ok(insertsForSet("Panini Absolute").names.includes("Kaboom"));
    assert.ok(insertsForSet("Panini Prizm").names.includes("Kaboom"), "close Panini pick keeps Kaboom");
    assert.ok(insertsForSet("Panini Select").names.includes("Kaboom"));
    assert.equal(insertsForSet("Donruss Optic").label, "Inserts");
  });

  it("shows a short Popular inserts row for a set with no mapping", () => {
    const chips = insertsForSet("Topps Chrome");
    assert.equal(chips.label, "Popular inserts");
    assert.deepEqual(chips.names, ["Kaboom", "Downtown", "Color Blast"]);
    assert.equal(insertsForSet("").label, "Popular inserts");
  });

  it("leads the Set step with the insert's sets", () => {
    assert.deepEqual(insertLeadSets("Downtown").slice(0, 1), ["Donruss Optic"]);
    assert.deepEqual(insertLeadSets("Kaboom!"), ["Panini Donruss", "Donruss Optic", "Panini Absolute"]);
    assert.deepEqual(insertLeadSets("Silver"), []);
  });
});

describe("Parallel or insert step", () => {
  it("asks 'Which parallel or insert?'", () => {
    assert.equal(STEP_LABELS.parallel, "Parallel or insert");
    assert.equal(STEP_QUESTIONS.parallel, "Which parallel or insert?");
  });

  it("puts Downtown on Donruss Optic and Kaboom on Donruss / Absolute without typing", () => {
    const optic = parallelGroups(null, "Donruss Optic", "Base");
    assert.ok(names(optic.inserts.options).includes("Downtown"));
    for (const set of ["Panini Donruss", "Panini Absolute"]) {
      assert.ok(names(parallelGroups(null, set, "Base").inserts.options).includes("Kaboom"), set);
    }
    for (const option of optic.inserts.options) assert.equal(option.serialRun, null, "no run badge on seeds");
    assert.equal(optic.base.name, "Base");
  });

  it("keeps every built-in and checklist parallel, with runs", async () => {
    const optic = parallelGroups(null, "Donruss Optic", "Base");
    for (const name of PARALLELS_BY_SET["donruss optic"]) {
      if (name === "Base") continue;
      assert.ok(names(optic.parallels).includes(name), name);
    }
    const data = await loadProductData();
    const checklist = parallelsIn(data, "Basketball", "2023-24", "Panini Prizm");
    assert.ok(checklist.length > 10);
    const groups = parallelGroups(checklist, "Panini Prizm", "Base");
    const shown = new Set([groups.base.name, ...names(groups.parallels), ...names(groups.inserts.options)]);
    for (const row of checklist) assert.ok(shown.has(row.name), row.name);
    for (const row of checklist.filter((item) => item.serialRun)) {
      const inGroup = groups.parallels.find((option) => option.name === row.name);
      assert.equal(inGroup?.serialRun, row.serialRun, row.name);
    }
  });

  it("puts a typed custom name on the list, and a typed seed insert in Inserts", () => {
    const custom = parallelGroups(null, "Topps Chrome", "Sparkle Wave");
    assert.ok(names(custom.parallels).includes("Sparkle Wave"));
    assert.ok(names(parallelOptions(null, "Topps Chrome", "Sparkle Wave")).includes("Sparkle Wave"));
    const kaboom = parallelGroups(null, "Topps Chrome", "Kaboom");
    assert.ok(names(kaboom.inserts.options).includes("Kaboom"));
    assert.ok(!names(kaboom.parallels).includes("Kaboom"), "no second Kaboom chip");
    const colorBlastOnOptic = parallelGroups(null, "Donruss Optic", "Color Blast");
    assert.ok(names(colorBlastOnOptic.inserts.options).includes("Color Blast"));
  });

  it("saves a typed Kaboom as a custom parallel on a set where it is not listed", () => {
    const picked = answerParallel("Topps Chrome", "Kaboom", null, emptyFlowAnswers());
    assert.equal(picked.form.parallel, "Kaboom");
    assert.equal(picked.parallelIsCustom, true);
    assert.deepEqual(parallelChoice("Topps Chrome", "Kaboom"), { parallel: "Kaboom", parallelIsCustom: true });
  });
});

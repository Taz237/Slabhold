import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  displayParallelName,
  knownSerialRun,
  loadProductData,
  productForSet,
  productParallels,
  productSetNames,
  sameSeason,
  parallelsIn,
} from "@/lib/cards/product-data";
import { parallelOptions } from "@/lib/cards/add-flow";
import { parallelSwatch } from "@/lib/cards/parallel-swatch";
import { PARALLELS_BY_SET } from "@/lib/cards/parallels";

type RawProduct = {
  sport: string;
  yearLabel: string;
  product: string;
  parallels: { subset: string; name: string; serialRun: number | null }[];
};

const raw = JSON.parse(
  readFileSync(new URL("./data/panini-parallels.json", import.meta.url), "utf8"),
) as RawProduct[];

describe("product data", () => {
  it("offers a Stars swatch for Football 2023 Donruss Optic and keeps the Optic list", async () => {
    const data = await loadProductData();
    const list = parallelOptions(parallelsIn(data, "Football", "2023", "Donruss Optic"), "Donruss Optic", "");
    const names = list.map((item) => item.name);
    assert.equal(names[0], "Base");
    assert.ok(names.includes("Stars"));
    for (const name of PARALLELS_BY_SET["donruss optic"]) assert.ok(names.includes(name), name);
    assert.equal(list.find((item) => item.name === "Stars")?.serialRun, null);
    assert.equal(parallelSwatch("Stars").kind, "stars");
    // Basketball Optic and other football years are unchanged.
    assert.equal(parallelsIn(data, "Basketball", "2020-21", "Donruss Optic").some((item) => item.name === "Stars"), false);
    assert.deepEqual(parallelsIn(data, "Football", "2024", "Donruss Optic"), []);
  });

  it("ships the Panini checklist and an empty Topps file", async () => {
    const data = await loadProductData();
    assert.equal(raw.length, 17);
    assert.equal(
      raw.reduce((sum, product) => sum + product.parallels.length, 0),
      1237 + 16,
    );
    assert.equal(data.length, 17);
    const topps = JSON.parse(
      readFileSync(new URL("./data/topps-parallels.json", import.meta.url), "utf8"),
    );
    assert.deepEqual(topps, []);
  });

  it("lists Basketball 2023-24 Prizm parallels with Base first and the JSON runs", async () => {
    const list = await productParallels("Basketball", "2023-24", "Panini Prizm");
    assert.ok(list.length > 10);
    assert.deepEqual(list[0], { name: "Base", serialRun: null });
    const source = raw.find(
      (product) =>
        product.sport === "Basketball" &&
        product.yearLabel === "2023-24" &&
        product.product === "Panini Prizm",
    )!;
    for (const row of source.parallels) {
      const found = list.find((item) => item.name === displayParallelName(row.name));
      assert.ok(found, row.name);
      assert.equal(found.serialRun, row.serialRun, row.name);
    }
    // One row per name, even when subsets repeat it.
    assert.equal(new Set(list.map((item) => item.name)).size, list.length);
  });

  it("returns the checklist run for a numbered parallel and null for an unnumbered one", async () => {
    assert.equal(await knownSerialRun("Basketball", "2023-24", "Panini Prizm", "Red"), 299);
    assert.equal(await knownSerialRun("Basketball", "2023-24", "Panini Prizm", "Purple"), 99);
    assert.equal(await knownSerialRun("Basketball", "2023-24", "Panini Prizm", "silver"), null);
    assert.equal(await knownSerialRun("Basketball", "2023-24", "Panini Prizm", "Base"), null);
    assert.equal(await knownSerialRun("Basketball", "2023-24", "Topps Chrome", "Red"), null);
    // Run varies by card: not a known run.
    assert.equal(
      await knownSerialRun("Basketball", "2023-24", "Panini Prizm", "Green Pulsar"),
      null,
    );
  });

  it("accepts 2024 and 2024-25 for football and basketball", async () => {
    assert.ok((await productSetNames("Basketball", "2024-25")).includes("Panini Prizm"));
    assert.ok((await productSetNames("Basketball", "2024")).includes("Panini Prizm"));
    assert.ok((await productSetNames("Football", "2024")).includes("Panini Prizm"));
    assert.ok((await productSetNames("Football", "2024-25")).includes("Panini Prizm"));
    assert.equal(
      await knownSerialRun("Football", "2024-25", "Panini Prizm", "Gold"),
      await knownSerialRun("Football", "2024", "Panini Prizm", "Gold"),
    );
    assert.deepEqual(await productSetNames("Hockey", "2024-25"), []);
    assert.deepEqual(await productSetNames("Basketball", ""), []);
    assert.equal(sameSeason("2024", "2024-25"), true);
    assert.equal(sameSeason("2023-24", "2024-25"), false);
  });

  it("uses the Add card spelling of a set when one exists", async () => {
    const names = await productSetNames("Basketball", "2023-24");
    assert.ok(names.includes("Hoops"), "Panini Hoops saves as Hoops");
    assert.ok(names.includes("Panini Select"));
    const data = await loadProductData();
    assert.equal(productForSet(data, "Basketball", "2023-24", "Hoops")?.product, "Panini Hoops");
    assert.equal(productForSet(data, "Basketball", "2023-24", "Prizm")?.product, "Panini Prizm");
    assert.equal(
      productForSet(data, "Basketball", "2020-21", "Panini Optic")?.product,
      "Donruss Optic",
    );
    assert.equal(productForSet(data, "Basketball", "2023-24", "Topps Chrome"), null);
  });

  it("reads Select tier names without the checklist prefix", async () => {
    assert.equal(displayParallelName("Set - Concourse - Blue Prizms"), "Concourse Blue Prizms");
    assert.equal(displayParallelName("Set - Courtside"), "Courtside");
    assert.equal(displayParallelName("Set - Premier Level Lucky Envelopes"), "Premier Level Lucky Envelopes");
    assert.equal(displayParallelName("Red"), "Red");
    const select = await productParallels("Basketball", "2020-21", "Panini Select");
    assert.equal(select[0].name, "Base");
    assert.ok(select.some((item) => item.name === "Concourse Tie-Dye Prizms" && item.serialRun === 25));
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import topps from "@/lib/cards/data/topps-parallels.json";
import { loadProductData, parallelsIn } from "@/lib/cards/product-data";

type Row = {
  sport: string;
  yearLabel: string;
  product: string;
  source?: string;
  official?: boolean;
  parallels: { subset: string; name: string; serialRun: number | null }[];
};

/** Rows added from official Topps odds sheets. Each names the sheet it came from. */
const ADDED: readonly [sport: string, year: string, product: string][] = [
  ["Baseball", "2025", "Bowman"],
  ["Baseball", "2025", "Topps Update"],
];

function addedRows(): Row[] {
  return ADDED.map(([sport, year, product]) => {
    const row = (topps as Row[]).find(
      (item) => item.sport === sport && item.yearLabel === year && item.product === product,
    );
    assert.ok(row, `${year} ${product} is in topps-parallels.json`);
    return row;
  });
}

describe("checklists: sourced Topps rows", () => {
  it("each new row names a public source URL", () => {
    for (const row of addedRows()) {
      assert.match(row.source ?? "", /^https:\/\/\S+\.pdf$/, `${row.yearLabel} ${row.product} source`);
      assert.equal(row.official, true);
      assert.ok(row.parallels.length > 10);
    }
  });

  it("has no duplicate parallel names within a product", () => {
    for (const row of addedRows()) {
      const names = row.parallels.map((item) => item.name.trim().toLowerCase());
      assert.equal(new Set(names).size, names.length, `${row.yearLabel} ${row.product}`);
    }
  });

  it("only lists a print run as a positive integer", () => {
    for (const row of addedRows()) {
      for (const item of row.parallels) {
        assert.ok(
          item.serialRun === null || (Number.isInteger(item.serialRun) && item.serialRun > 0),
          `${row.product} ${item.name}`,
        );
      }
    }
  });

  it("keeps one product per sport, year and name", () => {
    const keys = (topps as Row[]).map((row) => `${row.sport}|${row.yearLabel}|${row.product}`);
    assert.equal(new Set(keys).size, keys.length);
  });

  it("offers the 2025 Bowman paper borders and Chrome Prospects refractors", async () => {
    const data = await loadProductData();
    const names = parallelsIn(data, "Baseball", "2025", "Bowman").map((item) => item.name);
    assert.equal(names[0], "Base");
    for (const name of ["Sky Blue Border", "Fuchsia Border", "Red Border", "Reptilian Refractor", "Superfractor"]) {
      assert.ok(names.includes(name), name);
    }
    // Autographs are their own cards, not parallels of the base card.
    assert.ok(!names.some((name) => /autograph/i.test(name)));
  });

  it("lists 2024 Bowman from the Cardboard Connection checklist, with a print run on every numbered row", () => {
    const row = (topps as Row[]).find((item) => item.yearLabel === "2024" && item.product === "Bowman");
    assert.ok(row);
    assert.equal(row.source, "https://www.cardboardconnection.com/2024-bowman-baseball-cards");
    assert.equal(row.official, false);
    const run = (subset: string, name: string) => row.parallels.find((item) => item.subset === subset && item.name === name)?.serialRun;
    assert.equal(run("Base and Paper Prospects", "Sky Blue Border"), 499);
    assert.equal(run("Base and Paper Prospects", "Fuchsia Border"), 299);
    assert.equal(run("Base and Paper Prospects", "Red Border"), 5);
    assert.equal(run("Chrome Prospects", "Refractor"), 499);
    assert.equal(run("Chrome Prospects", "Fuchsia Refractor"), 199);
    assert.equal(run("Chrome Prospects", "Lunar Glow"), null);
    // Not on the source's list, so not on ours.
    for (const name of ["Orange Border", "Orange Refractor", "Black Refractor", "Superfractor"]) {
      assert.ok(!row.parallels.some((item) => item.name === name), name);
    }
    const keys = row.parallels.map((item) => `${item.subset}|${item.name.toLowerCase()}`);
    assert.equal(new Set(keys).size, keys.length);
    for (const item of row.parallels) {
      assert.ok(item.serialRun === null || (Number.isInteger(item.serialRun) && item.serialRun > 0), item.name);
    }
  });

  it("offers the 2025 Topps Update foil parallels", async () => {
    const data = await loadProductData();
    const names = parallelsIn(data, "Baseball", "2025", "Topps Update").map((item) => item.name);
    for (const name of ["Gold", "Rainbow", "Holo", "Black Holo", "Red Diamante Foil", "Printing Plates"]) {
      assert.ok(names.includes(name), name);
    }
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  YEAR_CHIP_COUNT,
  catalogRowsForPlayer,
  catalogYears,
  parallelOptions,
  setChoices,
  setMaker,
  yearChips,
} from "@/lib/cards/add-flow";
import type { CatalogCard } from "@/lib/card-catalog";

const rows: CatalogCard[] = [
  { id: "1", playerName: "Victor Wembanyama", yearLabel: "2023-24", setBrand: "Panini Prizm", cardNumber: "136", sport: "Basketball", parallel: "Base" },
  { id: "2", playerName: "Victor Wembanyama", yearLabel: "2023-24", setBrand: "Hoops", cardNumber: "277", sport: "Basketball", parallel: "Base" },
  { id: "3", playerName: "Victor Wembanyama", yearLabel: "2024-25", setBrand: "Panini Prizm", cardNumber: "1", sport: "Basketball", parallel: "Base" },
  { id: "4", playerName: "Someone Else", yearLabel: "2019-20", setBrand: "Panini Prizm", cardNumber: "9", sport: "Basketball", parallel: "Base" },
];

describe("year chips", () => {
  it("shows about 12 seasons for the sport, newest first", () => {
    const basketball = yearChips("Basketball");
    assert.equal(basketball.length, YEAR_CHIP_COUNT);
    assert.match(basketball[0], /^\d{4}-\d{2}$/);
    assert.ok(basketball[0] > basketball[1]);
    assert.match(yearChips("Baseball")[0], /^\d{4}$/);
  });

  it("lists the player's catalog years first, newest first", () => {
    const mine = catalogRowsForPlayer(rows, "victor wembanyama");
    assert.equal(mine.length, 3);
    assert.deepEqual(catalogYears(mine), ["2024-25", "2023-24"]);
  });
});

describe("set choices", () => {
  it("orders catalog sets, then checklist sets, then popular sets, with no repeats", () => {
    const choices = setChoices({
      sport: "Basketball",
      catalogSets: ["Panini Prizm", "Hoops"],
      productSets: ["Hoops", "Panini Prizm", "Panini Select"],
    });
    assert.deepEqual(
      choices.slice(0, 3).map((choice) => [choice.name, choice.source]),
      [
        ["Panini Prizm", "catalog"],
        ["Hoops", "catalog"],
        ["Panini Select", "checklist"],
      ],
    );
    const names = choices.map((choice) => choice.name.toLowerCase());
    assert.equal(new Set(names).size, names.length);
    assert.ok(choices.some((choice) => choice.maker === "Topps"), "Topps shows too");
    assert.ok(choices.length <= 10);
  });

  it("names the maker", () => {
    assert.equal(setMaker("Panini Prizm"), "Panini");
    assert.equal(setMaker("Hoops"), "Panini");
    assert.equal(setMaker("Donruss Optic"), "Panini");
    assert.equal(setMaker("Topps Chrome"), "Topps");
    assert.equal(setMaker("Bowman Chrome"), "Topps");
    assert.equal(setMaker("Upper Deck"), "Upper Deck");
    assert.equal(setMaker("O-Pee-Chee"), "Upper Deck");
    assert.equal(setMaker("My Custom Set"), "");
  });
});

describe("parallel options", () => {
  it("uses the checklist when there is one, Base first", () => {
    const options = parallelOptions(
      [
        { name: "Base", serialRun: null },
        { name: "Red", serialRun: 299 },
      ],
      "Panini Prizm",
      "Base",
    );
    assert.deepEqual(options, [
      { name: "Base", serialRun: null },
      { name: "Red", serialRun: 299 },
    ]);
  });

  it("falls back to the built-in list and keeps a custom current pick", () => {
    const options = parallelOptions(null, "Topps Chrome", "Gold Wave Refractor");
    assert.equal(options[0].name, "Base");
    assert.ok(options.some((option) => option.name === "Superfractor" && option.serialRun === 1));
    assert.ok(options.some((option) => option.name === "Gold Wave Refractor"));
  });
});

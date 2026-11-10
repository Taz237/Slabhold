import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addAnotherPath, addAnotherPrefill } from "@/lib/cards/added-panel";
import { emptyFlowAnswers, flowStateAt, openingStep, backStep } from "@/lib/cards/add-flow";

describe("Add another keeps the player, year and set", () => {
  it("puts sport, player, year and set on the href, nothing else", () => {
    const href = addAnotherPath({
      sport: "Basketball",
      playerName: "Tyrese Maxey",
      yearLabel: "2024-25",
      year: 2024,
      setBrand: "Donruss Optic",
      // Never carried over:
      ...({ grade: "PSA 10", parallel: "Downtown", cardNumber: "7", purchasePrice: 40 } as object),
    });
    const url = new URL(href, "https://slabhold.app");
    assert.equal(url.pathname, "/cards/new");
    assert.equal(url.searchParams.get("sport"), "Basketball");
    assert.equal(url.searchParams.get("player"), "Tyrese Maxey");
    assert.equal(url.searchParams.get("year"), "2024-25");
    assert.equal(url.searchParams.get("set"), "Donruss Optic");
    assert.deepEqual([...url.searchParams.keys()].sort(), ["player", "set", "sport", "year"]);
    assert.doesNotMatch(href, /pick=|grade|parallel|num=|price/);
  });

  it("falls back to the year number and to plain /cards/new", () => {
    assert.match(addAnotherPath({ playerName: "Zach Neto", year: 2024, setBrand: "Topps Chrome" }), /year=2024/);
    assert.equal(addAnotherPath(null), "/cards/new");
    assert.equal(addAnotherPath({}), "/cards/new");
  });

  it("reads the params back, and ignores a Search pick", () => {
    assert.deepEqual(addAnotherPrefill({ player: " Tyrese  Maxey ", year: "2024-25", set: "Donruss Optic" }), {
      player: "Tyrese Maxey",
      year: "2024-25",
      set: "Donruss Optic",
    });
    assert.equal(addAnotherPrefill({ pick: "1", player: "Tyrese Maxey" }), null);
    assert.equal(addAnotherPrefill({}), null, "no params: the normal door");
    assert.equal(addAnotherPrefill({ year: "2024", set: "Donruss Optic" }), null);
    assert.equal(addAnotherPrefill({ player: "x".repeat(500) })?.player.length, 120);
  });

  it("opens on Card # with those answers, and Back walks to Set", () => {
    const answers = {
      ...emptyFlowAnswers(),
      playerName: "Tyrese Maxey",
      yearLabel: "2024-25",
      setBrand: "Donruss Optic",
    };
    assert.equal(openingStep(answers), "number");
    const state = flowStateAt(openingStep(answers), answers);
    assert.equal(state.step, "number");
    assert.equal(backStep(state).step, "set");
    assert.equal(openingStep(emptyFlowAnswers()), "player");
  });
});

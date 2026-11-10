import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addAnotherPath, copyCardPath, copyCardPrefill } from "@/lib/cards/added-panel";
import { emptyFlowAnswers, flowStateAt, openingStep } from "@/lib/cards/add-flow";

const maxey = {
  sport: "Basketball",
  playerName: "Tyrese Maxey",
  yearLabel: "2024-25",
  year: 2024,
  setBrand: "Donruss Optic",
  cardNumber: "7",
  noNumber: false,
  // Never carried over:
  parallel: "Downtown",
  grade: "PSA 10",
  serialRun: 99,
  purchasePrice: 40,
  notes: "pulled at the shop",
  certNumber: "12345678",
};

describe("Copy this card keeps the card and resets parallel and grade", () => {
  it("puts sport, player, year, set and number on the href, nothing else", () => {
    const href = copyCardPath(maxey);
    const url = new URL(href, "https://slabhold.app");
    assert.equal(url.pathname, "/cards/new");
    assert.equal(url.searchParams.get("sport"), "Basketball");
    assert.equal(url.searchParams.get("player"), "Tyrese Maxey");
    assert.equal(url.searchParams.get("year"), "2024-25");
    assert.equal(url.searchParams.get("set"), "Donruss Optic");
    assert.equal(url.searchParams.get("num"), "7");
    assert.deepEqual([...url.searchParams.keys()].sort(), ["num", "player", "set", "sport", "year"]);
    assert.doesNotMatch(href, /pick=|grade|parallel|price|serial|notes|cert|Downtown|PSA/);
  });

  it("marks a card with no number with nonumber=1", () => {
    const href = copyCardPath({ ...maxey, cardNumber: "", noNumber: true });
    const url = new URL(href, "https://slabhold.app");
    assert.equal(url.searchParams.get("nonumber"), "1");
    assert.equal(url.searchParams.has("num"), false);
  });

  it("is plain /cards/new without a card", () => {
    assert.equal(copyCardPath(null), "/cards/new");
  });

  it("is not Add another: Add another still has no number", () => {
    const another = addAnotherPath(maxey);
    assert.doesNotMatch(another, /num=/);
    assert.notEqual(copyCardPath(maxey), another);
  });

  it("reads the params back, with the number", () => {
    assert.deepEqual(
      copyCardPrefill({ player: "Tyrese Maxey", year: "2024-25", set: "Donruss Optic", num: "#7 " }),
      { player: "Tyrese Maxey", year: "2024-25", set: "Donruss Optic", number: "7", noNumber: false },
    );
    assert.deepEqual(
      copyCardPrefill({ player: "Tyrese Maxey", year: "2024-25", set: "Donruss Optic", nonumber: "1" }),
      { player: "Tyrese Maxey", year: "2024-25", set: "Donruss Optic", number: "", noNumber: true },
    );
  });

  it("is null without a number, for a Search pick, or with short params", () => {
    assert.equal(copyCardPrefill({ player: "Tyrese Maxey", year: "2024-25", set: "Donruss Optic" }), null, "that is Add another");
    assert.equal(copyCardPrefill({ pick: "1", player: "Tyrese Maxey", num: "7" }), null, "a Search pick wins");
    assert.equal(copyCardPrefill({ num: "7" }), null);
    assert.equal(copyCardPrefill({}), null);
    assert.equal(copyCardPrefill({ player: "x", num: "y".repeat(500) })?.number.length, 20);
  });

  it("opens on Parallel or insert with Base, for a number or for no number", () => {
    const answers = {
      ...emptyFlowAnswers(),
      playerName: "Tyrese Maxey",
      yearLabel: "2024-25",
      setBrand: "Donruss Optic",
      cardNumber: "7",
      parallel: "Base",
    };
    assert.equal(openingStep(answers), "parallel");
    assert.equal(flowStateAt(openingStep(answers), answers).step, "parallel");
    assert.equal(openingStep({ ...answers, cardNumber: "", noNumber: true }), "parallel");
    // Add another (no number) still opens on Card #.
    assert.equal(openingStep({ ...answers, cardNumber: "" }), "number");
  });
});

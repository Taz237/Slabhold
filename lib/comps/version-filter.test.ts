import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { titleMatchesCard, type MatchCard } from "./match";

/**
 * A Base comp never keeps a parallel's sale, and a parallel's comp keeps only its own.
 * The titles are modeled on how sellers word these cards, not copied from real listings.
 */

const dart: MatchCard = {
  playerName: "Jaxson Dart",
  year: 2025,
  yearLabel: "2025",
  setBrand: "Topps Chrome",
  cardNumber: "306",
  noNumber: false,
  parallel: "Base",
  conditionType: "graded",
  grade: "PSA 10",
};
const as = (parallel: string, serialRun?: number): MatchCard => ({ ...dart, parallel, serialRun });
const title = (words: string) => `2025 Topps Chrome Jaxson Dart ${words} PSA 10`;

describe("Base keeps no parallel's sale", () => {
  it("keeps a plain base title", () => {
    assert.equal(titleMatchesCard(title("#306 RC Giants"), dart), true);
  });

  for (const words of [
    "#306 X-Fractor RC",
    "X-Fractor #306 RC",
    "Xfractor Rookie #306",
    "X Fractor #306",
    "XFractor #306",
    "#306 Refractor RC",
    "#306 Prism Refractor",
    "#306 Prism",
    "#306 Sepia",
    "#306 Aqua",
    "#306 Yellow",
    "#306 Teal",
    "#306 Bronze",
    "#306 Magenta Speckle",
    "#306 Fuchsia",
    "#306 Atomic",
    "#306 Raywave",
    "#306 RayWave",
    "#306 Lava",
    "#306 Mini Diamond",
    "#306 Geometric",
    "#306 Negative",
    "#306 Superfractor",
    "#306 Logofractor",
    "#306 Sapphire",
  ]) {
    it(`drops "${words}"`, () => {
      assert.equal(titleMatchesCard(title(words), dart), false);
    });
  }

  it("drops Panini look-alikes too: Fast Break, Reactive, Stained Glass, Shock, Elephant, Tri-Color, Genesis", () => {
    const prizm: MatchCard = { ...dart, setBrand: "Panini Prizm", cardNumber: "332" };
    for (const words of ["Fast Break", "Reactive", "Stained Glass", "Shock", "Elephant", "Tri-Color", "Tri Color", "Genesis"]) {
      assert.equal(titleMatchesCard(`2025 Panini Prizm Jaxson Dart #332 ${words} PSA 10`, prizm), false, words);
    }
    assert.equal(titleMatchesCard("2025 Panini Prizm Jaxson Dart #332 RC PSA 10", prizm), true);
  });
});

describe("a team name is not a parallel", () => {
  const love: MatchCard = { ...dart, playerName: "Jordan Love", year: 2024, yearLabel: "2024", setBrand: "Panini Prizm", cardNumber: "50" };
  const devers: MatchCard = { ...dart, playerName: "Rafael Devers", year: 2024, yearLabel: "2024", cardNumber: "1" };

  it("Base keeps Green Bay, Red Sox, White Sox, Blue Jays, Red Wings and Blue Jackets titles", () => {
    assert.equal(titleMatchesCard("2024 Panini Prizm Jordan Love #50 Green Bay Packers PSA 10", love), true);
    for (const team of ["Boston Red Sox", "White Sox", "Toronto Blue Jays", "Red Wings", "Blue Jackets"]) {
      assert.equal(titleMatchesCard(`2024 Topps Chrome Rafael Devers #1 ${team} PSA 10`, devers), true, team);
    }
  });

  it("Base still drops a parallel beside the team name", () => {
    assert.equal(titleMatchesCard("2024 Panini Prizm Jordan Love #50 Green Prizm Green Bay Packers PSA 10", love), false);
    assert.equal(titleMatchesCard("2024 Topps Chrome Rafael Devers #1 Red Refractor Red Sox PSA 10", devers), false);
  });

  it("a Red card is not backed by 'Red Sox' alone, and a Green card not by 'Green Bay'", () => {
    assert.equal(titleMatchesCard("2024 Topps Chrome Rafael Devers #1 Boston Red Sox PSA 10", { ...devers, parallel: "Red" }), false);
    assert.equal(titleMatchesCard("2024 Topps Chrome Rafael Devers #1 Red Refractor Red Sox PSA 10", { ...devers, parallel: "Red" }), true);
    assert.equal(titleMatchesCard("2024 Panini Prizm Jordan Love #50 Green Bay Packers PSA 10", { ...love, parallel: "Green" }), false);
    assert.equal(titleMatchesCard("2024 Panini Prizm Jordan Love #50 Green Prizm Green Bay Packers PSA 10", { ...love, parallel: "Green" }), true);
  });
});

describe("a picked version keeps only its own sales", () => {
  it("X-Fractor keeps every spelling, before or after the card #", () => {
    for (const words of ["#306 X-Fractor RC", "X-Fractor #306", "Xfractor Rookie #306", "X Fractor #306", "#306 XFractor", "#306 X-Fractor Refractor"]) {
      assert.equal(titleMatchesCard(title(words), as("X-Fractor")), true, words);
    }
  });

  it("X-Fractor drops Base, Refractor and a colored X-Fractor", () => {
    for (const words of ["#306 RC", "#306 Refractor", "#306 Prism Refractor", "#306 Gold X-Fractor", "#306 X-Fractor /99"]) {
      assert.equal(titleMatchesCard(title(words), as("X-Fractor")), false, words);
    }
  });

  it("Refractor keeps Refractor and drops Base, X-Fractor, Prism, a color and a numbered one", () => {
    assert.equal(titleMatchesCard(title("#306 Refractor RC"), as("Refractor")), true);
    for (const words of ["#306 RC", "#306 X-Fractor", "#306 Xfractor", "#306 Prism Refractor", "#306 Gold Refractor", "#306 Sepia Refractor", "#306 Refractor /199", "#306 Superfractor"]) {
      assert.equal(titleMatchesCard(title(words), as("Refractor")), false, words);
    }
  });

  it("a color is the same with or without 'Refractor', either way round", () => {
    assert.equal(titleMatchesCard(title("#306 Gold Refractor /50"), as("Gold", 50)), true);
    assert.equal(titleMatchesCard(title("#306 Gold /50"), as("Gold Refractor", 50)), true);
    assert.equal(titleMatchesCard(title("#306 Gold Wave Refractor /50"), as("Gold", 50)), false);
    assert.equal(titleMatchesCard(title("#306 Refractor"), as("Gold Refractor", 50)), false);
  });

  it("a numbered version keeps its run only", () => {
    const philon: MatchCard = { ...dart, playerName: "Labaron Philon", yearLabel: "2025-26", setBrand: "Panini Prizm", cardNumber: "103", parallel: "Orange Pulsar", serialRun: 175, conditionType: "raw", grade: "Raw" };
    assert.equal(titleMatchesCard("2025-26 Panini Prizm Labaron Philon #103 Orange Pulsar Prizm /175", philon), true);
    assert.equal(titleMatchesCard("2025-26 Panini Prizm Labaron Philon #103 Orange Pulsar 044/175 Alabama", philon), true);
    assert.equal(titleMatchesCard("2025-26 Panini Prizm Labaron Philon #103 Purple Pulsar /175", philon), false);
    assert.equal(titleMatchesCard("2025-26 Panini Prizm Labaron Philon #103 Orange /49", philon), false);
    assert.equal(titleMatchesCard("2025-26 Panini Prizm Labaron Philon #103 Red Pulsar /299", philon), false);
    assert.equal(titleMatchesCard("2025-26 Panini Prizm Labaron Philon #103 RC Alabama", philon), false);
    // Base keeps none of them.
    const base = { ...philon, parallel: "Base", serialRun: undefined };
    assert.equal(titleMatchesCard("2025-26 Panini Prizm Labaron Philon #103 Orange Pulsar Prizm /175", base), false);
    assert.equal(titleMatchesCard("2025-26 Panini Prizm Labaron Philon #103 RC Alabama", base), true);
  });

  it("a lot is still a lot: '2x', 'x3' and '5 cards' stay out", () => {
    for (const words of ["#306 2x RC", "#306 x3", "#306 5 cards"]) {
      assert.equal(titleMatchesCard(title(words), dart), false, words);
    }
  });
});

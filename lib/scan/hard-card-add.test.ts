import assert from "node:assert/strict";
import { describe, it } from "node:test";
import hardCards from "./hard-cards-v1.json";
import { buildHardCard, hardCardReport, nextHardCardId, parseHardCardArgs, scoreHardCard } from "./hard-card-add";
import type { HardCard } from "./hard-cards";

const CARDS = (hardCards as { cards: HardCard[] }).cards;

const DART = [
  "--player", "Jaxson Dart",
  "--year", "2025",
  "--product", "Topps Chrome Football",
  "--number", "#306",
  "--parallel", "X-Fractor",
  "--slab",
  "--rookie",
  "--front", "2025 TOPPS CHROME #306|JAXSON DART|X-FRACTOR|GEM MT 10|PSA|98765432",
  "--why", "Showed as #306 Base.",
  "--title", "2025 Topps Chrome Jaxson Dart X-Fractor #306 RC PSA 10",
  "--title", "2025 Topps Chrome Jaxson Dart #306 RC PSA 10 Giants",
];

describe("adding a reported miss to the hard-cards set", () => {
  it("the next id follows the highest one in the file", () => {
    assert.equal(nextHardCardId([{ id: "hc-001" }, { id: "hc-075" }, { id: "hc-009" }]), "hc-076");
    assert.equal(nextHardCardId([]), "hc-001");
    assert.match(nextHardCardId(CARDS), /^hc-\d{3,}$/);
    assert.ok(!CARDS.some((card) => card.id === nextHardCardId(CARDS)));
  });

  it("reads the flags into a card the set accepts", () => {
    const { input, errors, dryRun } = parseHardCardArgs(DART);
    assert.deepEqual(errors, []);
    assert.equal(dryRun, false);
    const card = buildHardCard(input, [{ id: "hc-075" }]);
    assert.equal(card.id, "hc-076");
    assert.equal(card.player, "Jaxson Dart");
    assert.equal(card.card_number, "306");
    assert.equal(card.parallel, "X-Fractor");
    assert.equal(card.print_run, null);
    assert.equal(card.kind, "slab");
    assert.equal(card.is_rookie, true);
    assert.equal(card.sport, "football");
    assert.equal(card.manufacturer, "Topps");
    assert.deepEqual(card.typical_ocr_front, ["2025 TOPPS CHROME #306", "JAXSON DART", "X-FRACTOR", "GEM MT 10", "PSA", "98765432"]);
    assert.equal(card.listing_title_examples.length, 2);
    assert.equal(card.listing_titles_modeled, true);
    // The same checks hard-cards.test.ts makes of every card in the file.
    assert.match(card.id, /^hc-\d{3,}$/);
    assert.ok(card.player && card.year && card.product && card.card_number);
    assert.ok(card.typical_ocr_front.length > 0);
    assert.ok(Array.isArray(card.listing_title_examples));
  });

  it("Base, or no parallel, is a base card; a run reads with or without the slash; a raw card has no kind", () => {
    const base = parseHardCardArgs(["--player", "A B", "--year", "2025-26", "--product", "Panini Prizm Basketball", "--number", "103", "--parallel", "Base", "--run", "/175", "--front", "A B", "--why", "x"]);
    assert.deepEqual(base.errors, []);
    const card = buildHardCard(base.input, []);
    assert.equal(card.parallel, null);
    assert.equal(card.print_run, 175);
    assert.equal(card.kind, undefined);
    assert.equal(card.sport, "basketball");
    assert.equal(card.typical_ocr_back, undefined);
  });

  it("says plainly what is missing, and refuses a flag it doesn't know or a value left off", () => {
    const empty = parseHardCardArgs([]);
    assert.equal(empty.errors.length, 6);
    assert.ok(empty.errors.some((line) => line.includes("--player")));
    assert.ok(empty.errors.some((line) => line.includes("--front")));
    assert.ok(parseHardCardArgs([...DART, "--paralel", "X"]).errors.some((line) => line.includes("--paralel")));
    assert.ok(parseHardCardArgs([...DART, "--team"]).errors.some((line) => line.includes("--team needs a value")));
    assert.ok(parseHardCardArgs([...DART, "--year", "25"]).errors.some((line) => line.includes("--year")));
    assert.ok(parseHardCardArgs([...DART, "--run", "abc"]).errors.some((line) => line.includes("--run")));
    assert.ok(parseHardCardArgs([...DART, "stray"]).errors.some((line) => line.includes("stray")));
  });

  it("scores the card the way the bake-off does, and the report says right, open or wrong", async () => {
    const card = buildHardCard(parseHardCardArgs(DART).input, CARDS);
    const score = await scoreHardCard(card);
    assert.deepEqual(score.wrong, []);
    assert.equal(score.marks.player, "right");
    assert.equal(score.marks.parallel, "right");
    const report = hardCardReport(card, score);
    assert.match(report, /The scanner shows: Jaxson Dart · 2025 · Topps Chrome · #306 · X-Fractor/);
    assert.match(report, /0 wrong/);

    // A truth the scanner can't back from this read: the report calls it wrong, in capitals.
    const wrong = buildHardCard({ ...parseHardCardArgs(DART).input, parallel: "Gold" }, CARDS);
    const wrongScore = await scoreHardCard(wrong);
    assert.deepEqual(wrongScore.wrong, ["parallel"]);
    assert.match(hardCardReport(wrong, wrongScore), /WRONG on parallel/);
  });

  it("an existing card scores as it does in the bake-off: hc-001 is open on the parallel, nothing wrong", async () => {
    const score = await scoreHardCard(CARDS.find((card) => card.id === "hc-001")!);
    assert.deepEqual(score.wrong, []);
    assert.deepEqual(score.open, ["parallel"]);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PREVIEW_RAW, PREVIEW_SLAB } from "./preview-fixtures";
import { REVEAL_COPY } from "./reveal";

describe("the reveal's copy", () => {
  it("is plain: no 'best', 'AI', 'free' or 'number one'", () => {
    const all = JSON.stringify(REVEAL_COPY);
    assert.doesNotMatch(all, /\bbest\b|\bAI\b|\bfree\b|number one/i);
  });
});

describe("the reveal's typed label", () => {
  it("a raw card types year, set, number, player, then parallel, one line at a time", async () => {
    const { revealLines } = await import("./reveal");
    const lines = revealLines({ ...PREVIEW_RAW[0], parallel: "Silver" });
    assert.deepEqual(
      lines.map((line) => line.field),
      ["year", "set", "number", "player", "parallel"],
    );
    assert.deepEqual(lines.map((line) => line.text), ["2023-24", "Panini Prizm", "#136", "Victor Wembanyama", "Silver"]);
  });

  it("a slab types its cert first (last 4 only), then player, year, set, number, grade and parallel", async () => {
    const { revealLines } = await import("./reveal");
    const lines = revealLines(PREVIEW_SLAB);
    assert.deepEqual(
      lines.map((line) => line.field),
      ["cert", "player", "year", "set", "number", "grade", "parallel"],
    );
    assert.equal(lines[0].text, "Cert ••••0000");
    assert.doesNotMatch(lines.map((line) => line.text).join(" "), /00000000/, "never the full cert");
    assert.equal(lines[5].text, "PSA 10");
  });

  it("an open parallel types as open, never as Base; a numbered one keeps its serial", async () => {
    const { revealLines } = await import("./reveal");
    assert.equal(revealLines({ ...PREVIEW_RAW[0], parallel: "" }).at(-1)?.text, "Version not read yet");
    assert.equal(revealLines({ ...PREVIEW_RAW[0], parallel: "Gold", serialRun: 97, serialNo: "15" }).at(-1)?.text, "Gold 15/97");
  });

  it("each line types after the one before it, quickly", async () => {
    const { revealLines, typingPlan } = await import("./reveal");
    const plan = typingPlan(revealLines(PREVIEW_SLAB));
    for (let index = 1; index < plan.lines.length; index += 1) assert.ok(plan.lines[index].delayMs >= plan.lines[index - 1].delayMs + plan.lines[index - 1].durationMs);
    assert.ok(plan.totalMs < 4000, `${plan.totalMs}ms`);
  });
});

describe("Pick your card only when unsure", () => {
  it("one match, or a top match the card pinned (player, year, set and #): straight to its price", async () => {
    const { matchIsSure } = await import("./reveal");
    assert.equal(matchIsSure([PREVIEW_SLAB]), true);
    assert.equal(matchIsSure([{ ...PREVIEW_RAW[0], sureness: { ...PREVIEW_RAW[0].sureness, number: "sure" } }, PREVIEW_RAW[1]]), true);
  });

  it("several matches and the top one isn't pinned: the list", async () => {
    const { matchIsSure } = await import("./reveal");
    assert.equal(matchIsSure(PREVIEW_RAW), false, "the card # wasn't sure");
  });
});

describe("the lines under the reveal's card", () => {
  it("a matched card: the player, the year and set (with its insert), then the # and the serial. Never a version, never a guess", async () => {
    const { revealFields } = await import("./reveal");
    const card = { ...PREVIEW_RAW[0], playerName: "Sam LaPorta", yearLabel: "2023", setBrand: "Panini Illusions", insertName: "First Impressions", cardNumber: "131", parallel: "", serialRun: 10, serialNo: "03" };
    assert.deepEqual(revealFields(card), [
      { field: "player", text: "Sam LaPorta" },
      { field: "set", text: "2023 Panini Illusions First Impressions" },
      { field: "number", text: "#131 · 03/10" },
    ]);
    // A serial nobody read is not shown; a field nothing read is left out.
    assert.deepEqual(revealFields({ ...card, serialRun: null, serialNo: "", cardNumber: "" }).map((line) => line.field), ["player", "set"]);
    assert.deepEqual(revealFields(PREVIEW_SLAB)[2], { field: "number", text: "#280" });
  });

  it("while it is matched: only what the phone itself read off the photos", async () => {
    const { revealReadFromScan, revealFieldsFromRead } = await import("./reveal");
    const { SCAN_DIRECTORY } = await import("@/lib/players/scan-directory");
    const { scanPlayerName } = await import("./match");
    const { scanReadFrom } = await import("./session");
    const capture = (lines: string[], backLines: string[] | null) => ({ lines, backLines, image: null, kind: "card" as const });
    const peek = (lines: string[], backLines: string[] | null) => {
      const read = scanReadFrom(capture(lines, backLines), SCAN_DIRECTORY);
      return revealReadFromScan(read, scanPlayerName(read, SCAN_DIRECTORY));
    };
    // The LaPorta's front alone: the player, and the serial when it reads. No set, no #: none is shown.
    assert.deepEqual(peek(["LIONS", "SAM LaPORTA", "FIRST IMPRESSIONS"], null), { player: "Sam LaPorta" });
    assert.deepEqual(peek(["LIONS", "03/10", "SAM LaPORTA", "FIRST IMPRESSIONS"], null), { player: "Sam LaPorta", number: "3/10" });
    // With its back: the set and the card #.
    const both = peek(["LIONS", "SAM LaPORTA", "FIRST IMPRESSIONS"], ["No. 131", "SAM LaPORTA", "2023 PANINI - ILLUSIONS FOOTBALL"]);
    assert.equal(both.player, "Sam LaPorta");
    assert.match(both.set ?? "", /Illusions/);
    assert.equal(both.number, "#131");
    // Nothing read: nothing shown.
    assert.deepEqual(revealFieldsFromRead(peek(["???"], null)), []);
    assert.deepEqual(revealFieldsFromRead(null), []);
  });
});

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

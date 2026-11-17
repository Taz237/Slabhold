import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import { PREVIEW_RAW, PREVIEW_SLAB } from "./preview-fixtures";
import { earlyFound, REVEAL_COPY, REVEAL_FIELDS, revealFoundFrom } from "./reveal";
import { scanReadFrom } from "./session";

describe("the scan reveal's fields", () => {
  it("are Player, Year, Set, Number and Parallel, in that order", () => {
    assert.deepEqual(REVEAL_FIELDS, ["player", "year", "set", "number", "parallel"]);
    assert.deepEqual(
      REVEAL_FIELDS.map((field) => REVEAL_COPY.labels[field]),
      ["Player", "Year", "Set", "Number", "Parallel"],
    );
  });

  it("the card's own read fills the player and the card # before any lookup", () => {
    const read = scanReadFrom(
      { lines: ["ROOKIE CODE", "CAMERON BOOZER"], backLines: ["1 RC-3 0", "CAMERON BOOZER", "MEMPHIS GRIZZLIES"], kind: "card", image: null },
      SCAN_DIRECTORY,
    );
    assert.deepEqual(earlyFound(read, SCAN_DIRECTORY), { player: "Cameron Boozer", number: "#RC-3" });
  });

  it("nothing read early: nothing filled, never a guess", () => {
    const read = scanReadFrom({ lines: ["0 1 0", "o 0"], backLines: null, kind: "card", image: null }, SCAN_DIRECTORY);
    assert.deepEqual(earlyFound(read, SCAN_DIRECTORY), {});
  });

  it("the top match fills every field it has; an open parallel stays empty", () => {
    const slab = revealFoundFrom(PREVIEW_SLAB);
    assert.equal(slab.player, PREVIEW_SLAB.playerName);
    assert.equal(slab.year, PREVIEW_SLAB.yearLabel);
    assert.equal(slab.set, PREVIEW_SLAB.setBrand);
    assert.equal(slab.number, `#${PREVIEW_SLAB.cardNumber}`);
    assert.equal(slab.parallel, PREVIEW_SLAB.parallel);
    const raw = revealFoundFrom({ ...PREVIEW_RAW[0], parallel: "" });
    assert.equal(raw.parallel, undefined);
    assert.deepEqual(revealFoundFrom(undefined), {});
  });

  it("the copy is plain: no 'best', 'AI', 'free' or 'number one'", () => {
    const all = JSON.stringify(REVEAL_COPY);
    assert.doesNotMatch(all, /\bbest\b|\bAI\b|\bfree\b|number one/i);
  });
});

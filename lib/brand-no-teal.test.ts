import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Teal is retired as a UI color: these spots use the existing brand purples.
 * Card colors that are teal by name (a "Teal" parallel swatch, the card
 * accent palette in lib/storage.ts) are the card's own color, not ours.
 */
const FILES = [
  "components/messages-view.tsx",
  "components/onboarding/youre-in.tsx",
  "components/leaderboard-view.tsx",
  "lib/leaderboard/score.ts",
  "lib/social/local-db.ts",
  "lib/seed.ts",
];

const TEAL = /#(?:34C1AE|2dd4bf|14b8a6|0d9488|5eead4|1f9e8c)\b/i;

describe("brand purple, not teal", () => {
  for (const file of FILES) {
    it(`${file} has no teal`, () => {
      assert.doesNotMatch(readFileSync(file, "utf8"), TEAL);
    });
  }

  it("the leaderboard's cards-added board uses light purple, readable on its dark board", () => {
    const view = readFileSync("components/leaderboard-view.tsx", "utf8");
    assert.match(view, /"most-cards-added": "#A78BFA"/);
  });
});

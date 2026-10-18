import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldShowFirstCardWelcome } from "./welcome";

describe("shouldShowFirstCardWelcome", () => {
  it("shows when the collection loaded empty", () => {
    assert.equal(
      shouldShowFirstCardWelcome({ cardCount: 0, ready: true, syncError: null }),
      true,
    );
  });

  it("hides the welcome when the card load failed", () => {
    assert.equal(
      shouldShowFirstCardWelcome({
        cardCount: 0,
        ready: true,
        syncError: "Couldn't load your cards.",
      }),
      false,
    );
  });

  it("hides while cards are still loading and once any card exists", () => {
    assert.equal(
      shouldShowFirstCardWelcome({ cardCount: 0, ready: false, syncError: null }),
      false,
    );
    assert.equal(
      shouldShowFirstCardWelcome({ cardCount: 2, ready: true, syncError: null }),
      false,
    );
  });
});

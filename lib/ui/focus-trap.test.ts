import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { trappedFocusTarget } from "./focus-trap";

describe("focus trap", () => {
  const [a, b, c] = ["a", "b", "c"];

  it("wraps Tab from the last control to the first, and Shift+Tab from the first to the last", () => {
    assert.equal(trappedFocusTarget([a, b, c], c, false), a);
    assert.equal(trappedFocusTarget([a, b, c], a, true), c);
  });

  it("leaves Tab alone inside the list", () => {
    assert.equal(trappedFocusTarget([a, b, c], a, false), null);
    assert.equal(trappedFocusTarget([a, b, c], b, true), null);
  });

  it("pulls focus back in when it is outside, or on the dialog itself", () => {
    assert.equal(trappedFocusTarget([a, b, c], "outside", false), a);
    assert.equal(trappedFocusTarget([a, b, c], "outside", true), c);
    assert.equal(trappedFocusTarget([a, b, c], null, false), a);
  });

  it("does nothing with no controls", () => {
    assert.equal(trappedFocusTarget([], a, false), null);
  });
});

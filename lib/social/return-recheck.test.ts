import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RETURN_AWAY_MS, createReturnRecheck } from "./return-recheck";

describe("return recheck", () => {
  it("checks once when the timeline is drawn from memory (Back from a post)", () => {
    const recheck = createReturnRecheck();
    assert.equal(recheck.mounted(true, 1_000), true);
    assert.equal(recheck.mounted(false, 1_000), false);
    assert.equal(createReturnRecheck().mounted(false, 1_000), false);
  });

  it("checks on a back-forward cache restore, not on a normal page load", () => {
    const recheck = createReturnRecheck();
    assert.equal(recheck.pageShow(false, 1_000), false);
    assert.equal(recheck.pageShow(true, 2_000), true);
  });

  it("checks when the tab comes back after being away long enough", () => {
    const recheck = createReturnRecheck();
    recheck.hidden(0);
    assert.equal(recheck.visible(RETURN_AWAY_MS - 1), false, "a quick tab flip is not a return");
    recheck.hidden(100_000);
    assert.equal(recheck.visible(100_000 + RETURN_AWAY_MS), true);
    assert.equal(recheck.visible(200_000), false, "visible twice without hiding is one return");
  });

  it("fires at most once per return when several signals land together", () => {
    const recheck = createReturnRecheck();
    recheck.hidden(0);
    assert.equal(recheck.pageShow(true, 60_000), true);
    assert.equal(recheck.visible(60_050), false);
    assert.equal(recheck.mounted(true, 60_100), false);
    recheck.hidden(70_000);
    assert.equal(recheck.visible(70_000 + RETURN_AWAY_MS + 1), true, "a later return checks again");
  });
});

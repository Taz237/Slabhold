import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { TOUR_STEPS, tourStepFrom } from "@/lib/onboarding/first-run";

const shell = readFileSync(join(process.cwd(), "components/app-shell.tsx"), "utf8");

describe("quick tour, Quick Comp stop", () => {
  it("anchors the Quick Comp stop on the /comp tab", () => {
    const block = shell.match(/const TAB_TOUR[^=]*= \{([\s\S]*?)\};/)?.[1] ?? "";
    assert.match(block, /"\/comp": "quick-comp"/);
    const index = TOUR_STEPS.findIndex((step) => step.target === "quick-comp");
    assert.equal(TOUR_STEPS[index - 1]?.target, "leaderboard", "right after the leaderboard stop");
  });

  it("skips the Quick Comp stop when there is no /comp tab", () => {
    // With the flag off there is no /comp tab, so that anchor is not on screen.
    const shown = TOUR_STEPS.map((step) => step.target !== "quick-comp");
    const quickComp = TOUR_STEPS.findIndex((step) => step.target === "quick-comp");
    assert.equal(TOUR_STEPS[tourStepFrom(quickComp, shown, 1) ?? -1]?.target, "collection");
    assert.equal(TOUR_STEPS[tourStepFrom(quickComp, shown, -1) ?? -1]?.target, "leaderboard");
    // With the flag on, Leaderboard left the bar for /comp: its stop is skipped and Quick Comp shows.
    const flagOn = TOUR_STEPS.map((step) => step.target !== "leaderboard");
    const leaderboard = TOUR_STEPS.findIndex((step) => step.target === "leaderboard");
    assert.equal(TOUR_STEPS[tourStepFrom(leaderboard, flagOn, 1) ?? -1]?.target, "quick-comp");
  });
});

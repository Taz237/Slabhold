import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { TOUR_STEPS, tourStepFrom } from "@/lib/onboarding/first-run";

const shell = readFileSync(join(process.cwd(), "components/app-shell.tsx"), "utf8");

/** Quick Comp lives on the Scan screen now: the tour stops on Scan and on Catalog, in its old slot. */
describe("quick tour, Scan and Catalog stops", () => {
  it("anchors Scan on the center tab and Catalog on its tab, with no Quick Comp or Leaderboard stop", () => {
    const block = shell.match(/const TAB_TOUR[^=]*= \{([\s\S]*?)\};/)?.[1] ?? "";
    assert.match(block, /"\/scan": "add-card"/);
    assert.match(block, /"\/catalog": "catalog"/);
    assert.doesNotMatch(block, /"\/comp"|"\/leaderboard"/);
    assert.deepEqual(TOUR_STEPS.map((step) => step.target), ["menu", "add-card", "catalog", "collection", "messages"]);
  });

  it("skips a stop whose tab isn't on screen", () => {
    const shown = TOUR_STEPS.map((step) => step.target !== "catalog");
    const catalog = TOUR_STEPS.findIndex((step) => step.target === "catalog");
    assert.equal(TOUR_STEPS[tourStepFrom(catalog, shown, 1) ?? -1]?.target, "collection");
    assert.equal(TOUR_STEPS[tourStepFrom(catalog, shown, -1) ?? -1]?.target, "add-card");
  });
});

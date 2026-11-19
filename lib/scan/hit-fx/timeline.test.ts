import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hitPlan, type Hit } from "../hit";
import { hitFrame, suspense } from "./timeline";

const shatter: Hit = { effect: "shatter", strength: 3, reasons: ["one-of-one"] };
const storm: Hit = { effect: "storm", strength: 1, reasons: ["auto"] };
const pixel: Hit = { effect: "pixel", strength: 1, reasons: ["sale"] };

describe("hit timeline", () => {
  it("slows right before the hit", () => {
    assert.equal(suspense(0), 0);
    assert.equal(suspense(1), 1);
    const early = suspense(0.2) - suspense(0.1);
    const late = suspense(0.9) - suspense(0.8);
    assert.ok(early > late * 2);
  });

  it("nothing flashes, glows or rings before the hit", () => {
    for (const hit of [shatter, pixel]) {
      const plan = hitPlan(hit);
      const frame = hitFrame(hit.effect, plan, plan.impactMs - 1);
      assert.equal(frame.flash, 0);
      assert.equal(frame.glow, 0);
      assert.ok(frame.ring1 < 0);
    }
  });

  it("the crystal cracks, then bursts on the hit", () => {
    const plan = hitPlan(shatter);
    assert.equal(hitFrame("shatter", plan, 0).crack, 0);
    assert.equal(hitFrame("shatter", plan, plan.impactMs - 1).burst, 0);
    assert.ok(hitFrame("shatter", plan, plan.impactMs * 0.5).crack > 0.6);
    assert.equal(hitFrame("shatter", plan, plan.durationMs).burst, 1);
  });

  it("the pixels hide the card until they snap in, then hand over to it", () => {
    const plan = hitPlan(pixel);
    assert.equal(hitFrame("pixel", plan, 10).card, 0);
    assert.equal(hitFrame("pixel", plan, plan.impactMs).card, 1);
    assert.equal(hitFrame("pixel", plan, plan.impactMs).assemble, 1);
    assert.equal(hitFrame("pixel", plan, plan.durationMs).pieces, 0);
  });

  it("the clouds roll in, the bolt lands on the hit, and the sky clears", () => {
    const plan = hitPlan(storm);
    assert.equal(hitFrame("storm", plan, 0).cloud, 0);
    assert.equal(hitFrame("storm", plan, plan.impactMs - 1).bolt, 0);
    assert.ok(hitFrame("storm", plan, plan.impactMs - 1).cloud > 0.95);
    assert.equal(hitFrame("storm", plan, plan.impactMs + 50).bolt, 1);
    assert.equal(hitFrame("storm", plan, plan.durationMs).cloud, 0);
  });

  it("the live reveal ends dark; the replay keeps a glow on the card", () => {
    const plan = hitPlan(pixel);
    assert.equal(hitFrame("pixel", plan, plan.durationMs).glow, 0);
    assert.equal(hitFrame("pixel", plan, plan.durationMs + 2000, 0.3).glow, 0.3);
  });

  it("a 1/1 gets one ring, the first hit ever gets two, a quick hit none", () => {
    const full = hitPlan(shatter);
    assert.ok(hitFrame("shatter", full, full.impactMs + 300).ring1 > 0);
    assert.ok(hitFrame("shatter", full, full.impactMs + 300).ring2 < 0);
    const first = hitPlan(pixel, { first: true });
    assert.ok(hitFrame("pixel", first, first.impactMs + 300).ring2 > 0);
    const quick = hitPlan(pixel);
    assert.ok(hitFrame("pixel", quick, quick.impactMs + 100).ring1 < 0);
  });
});

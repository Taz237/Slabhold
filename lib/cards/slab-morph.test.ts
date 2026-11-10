import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SLAB_MORPH_MS,
  captureSlabMorph,
  morphKeyframes,
  playSlabMorph,
  slabMorphAllowed,
  takeSlabMorph,
} from "@/lib/cards/slab-morph";

type FakeEl = {
  rect: { left: number; top: number; width: number; height: number };
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
  animated: { frames: Keyframe[]; options: KeyframeAnimationOptions }[];
  animate(frames: Keyframe[], options: KeyframeAnimationOptions): unknown;
};

function el(rect: FakeEl["rect"]): FakeEl {
  const node: FakeEl = {
    rect,
    animated: [],
    getBoundingClientRect: () => rect,
    animate(frames, options) {
      node.animated.push({ frames, options });
      return {};
    },
  };
  return node;
}

function env(reduce: boolean, source: FakeEl | null) {
  return {
    matchMedia: (query: string) => ({ matches: query.includes("reduce") ? reduce : false }),
    document: { querySelector: () => source },
  };
}

describe("slab morph", () => {
  it("captures the Review slab and hands it to the reveal once", () => {
    const source = el({ left: 120, top: 200, width: 128, height: 213 });
    assert.equal(captureSlabMorph(env(false, source) as never, 1000), true);
    assert.deepEqual(takeSlabMorph(1200), { left: 120, top: 200, width: 128, height: 213 });
    assert.equal(takeSlabMorph(1300), null, "used up");
  });

  it("is a plain swap under reduced motion", () => {
    const source = el({ left: 0, top: 0, width: 100, height: 160 });
    assert.equal(slabMorphAllowed(env(true, source) as never), false);
    assert.equal(captureSlabMorph(env(true, source) as never, 1000), false);
    assert.equal(takeSlabMorph(1001), null);
  });

  it("is a plain swap without the Review slab or without Web Animations", () => {
    assert.equal(captureSlabMorph(env(false, null) as never, 1000), false);
    const noAnimate = { ...el({ left: 0, top: 0, width: 1, height: 1 }), animate: undefined };
    assert.equal(captureSlabMorph(env(false, noAnimate as never) as never, 1000), false);
  });

  it("goes stale, so a later card page never morphs from an old save", () => {
    captureSlabMorph(env(false, el({ left: 0, top: 0, width: 100, height: 160 })) as never, 1000);
    assert.equal(takeSlabMorph(1000 + 5000), null);
  });

  it("moves and scales from the Review slab to the reveal slab, ease-out, 300 to 400ms", () => {
    const frames = morphKeyframes(
      { left: 120, top: 300, width: 128, height: 200 },
      { left: 100, top: 100, width: 160, height: 250 },
    );
    assert.deepEqual(frames, [
      { transformOrigin: "top left", transform: "translate(20px, 200px) scale(0.8, 0.8)" },
      { transformOrigin: "top left", transform: "none" },
    ]);
    assert.ok(SLAB_MORPH_MS >= 300 && SLAB_MORPH_MS <= 400);
    const target = el({ left: 100, top: 100, width: 160, height: 250 });
    assert.equal(playSlabMorph(target as never, { left: 120, top: 300, width: 128, height: 200 }), true);
    assert.equal(target.animated[0].options.duration, SLAB_MORPH_MS);
    assert.match(String(target.animated[0].options.easing), /ease-out|cubic-bezier/);
  });

  it("skips a target with no size", () => {
    const target = el({ left: 0, top: 0, width: 0, height: 0 });
    assert.equal(playSlabMorph(target as never, { left: 0, top: 0, width: 100, height: 160 }), false);
    assert.equal(target.animated.length, 0);
  });
});

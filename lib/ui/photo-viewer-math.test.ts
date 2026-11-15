import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DOUBLE_TAP_ZOOM,
  MAX_ZOOM,
  clampPan,
  containRect,
  dismissProgress,
  pinchTo,
  rubberBand,
  sharedElementFrom,
  shouldDismiss,
  snapIndex,
  springEasing,
  trackOffset,
  zoomAt,
} from "./photo-viewer-math";

const viewport = { left: 0, top: 0, width: 390, height: 844 };

describe("photo viewer: carousel", () => {
  it("rubber-bands past the ends and never moves as far as the finger", () => {
    assert.equal(rubberBand(0, 390), 0);
    const pulled = rubberBand(200, 390);
    assert.ok(pulled > 0 && pulled < 200);
    assert.ok(rubberBand(-200, 390) < 0);
    assert.ok(Math.abs(rubberBand(10_000, 390)) < 390, "never past one screen");
  });

  it("follows the finger in the middle and resists at the first and last photo", () => {
    assert.equal(trackOffset(-120, 1, 3, 390), -120);
    assert.equal(trackOffset(120, 1, 3, 390), 120);
    assert.ok(trackOffset(120, 0, 3, 390) < 120, "first photo resists a pull right");
    assert.ok(trackOffset(-120, 2, 3, 390) > -120, "last photo resists a pull left");
    assert.ok(trackOffset(-120, 0, 1, 390) > -120, "one photo resists both ways");
  });

  it("snaps to the next photo past halfway or on a flick, and stays put otherwise", () => {
    assert.equal(snapIndex({ index: 0, count: 3, dx: -100, vx: 0, width: 390 }), 0);
    assert.equal(snapIndex({ index: 0, count: 3, dx: -220, vx: 0, width: 390 }), 1);
    assert.equal(snapIndex({ index: 0, count: 3, dx: -40, vx: -0.8, width: 390 }), 1, "flick left");
    assert.equal(snapIndex({ index: 2, count: 3, dx: 40, vx: 0.8, width: 390 }), 1, "flick right");
    assert.equal(snapIndex({ index: 2, count: 3, dx: -300, vx: -1, width: 390 }), 2, "no photo past the last");
    assert.equal(snapIndex({ index: 0, count: 3, dx: 300, vx: 1, width: 390 }), 0, "no photo before the first");
    // Dragged far left, then flicked back right: the flick wins.
    assert.equal(snapIndex({ index: 1, count: 3, dx: -220, vx: 0.8, width: 390 }), 1);
  });
});

describe("photo viewer: swipe to dismiss", () => {
  it("closes past the threshold or on a flick, and springs back otherwise", () => {
    assert.equal(shouldDismiss({ dy: 40, vy: 0, height: 844 }), false);
    assert.equal(shouldDismiss({ dy: 160, vy: 0, height: 844 }), true);
    assert.equal(shouldDismiss({ dy: -160, vy: 0, height: 844 }), true, "up works too");
    assert.equal(shouldDismiss({ dy: 60, vy: 0.9, height: 844 }), true, "flick down");
    assert.equal(shouldDismiss({ dy: 20, vy: 0.9, height: 844 }), false, "a nudge is not a flick");
    assert.equal(shouldDismiss({ dy: 160, vy: -0.9, height: 844 }), false, "flicked back up");
  });

  it("fades the background as the photo is dragged", () => {
    assert.equal(dismissProgress(0, 844), 0);
    assert.ok(dismissProgress(100, 844) > 0);
    assert.equal(dismissProgress(-100, 844), dismissProgress(100, 844));
    assert.equal(dismissProgress(5000, 844), 1);
  });
});

describe("photo viewer: shared element", () => {
  it("fits a photo inside the screen", () => {
    assert.deepEqual(containRect({ width: 1000, height: 1000 }, viewport), {
      left: 0,
      top: 227,
      width: 390,
      height: 390,
    });
    const tall = containRect({ width: 1000, height: 4000 }, viewport);
    assert.equal(tall.height, 844);
    assert.equal(tall.width, 211);
  });

  it("starts the open from the cropped thumbnail and lands on the full photo", () => {
    const target = containRect({ width: 1000, height: 1000 }, viewport);
    // A 4:5 cover thumbnail of a square photo.
    const thumb = { left: 20, top: 300, width: 320, height: 400 };
    const from = sharedElementFrom({ rect: thumb, fit: "cover", radius: 16 }, target);
    const scale = 400 / 390; // cover: the taller side fills
    assert.match(from.transform, /^translate3d\(/);
    assert.ok(from.transform.includes(`scale(${round(scale)})`), from.transform);
    // Center of the thumb minus center of the target.
    assert.ok(from.transform.includes(`${round(180 - 195)}px, ${round(500 - 422)}px`), from.transform);
    // Cropped left and right to the thumbnail's width, nothing off the top.
    const side = round((390 - 320 / scale) / 2);
    assert.equal(from.clip, `inset(0px ${side}px 0px ${side}px round ${round(16 / scale)}px)`);
  });

  it("does not crop a contained thumbnail", () => {
    const target = containRect({ width: 800, height: 1000 }, viewport);
    const thumb = { left: 16, top: 100, width: 358, height: 447.5 };
    const from = sharedElementFrom({ rect: thumb, fit: "contain", radius: 0 }, target);
    assert.equal(from.clip, "inset(0px 0px 0px 0px round 0px)");
  });
});

describe("photo viewer: zoom", () => {
  const fitted = { width: 390, height: 390 };
  const screen = { width: 390, height: 844 };

  it("keeps a zoomed photo's edges on screen", () => {
    assert.deepEqual(clampPan({ x: 999, y: 999, scale: 2 }, fitted, screen), { x: 195, y: 0 });
    assert.deepEqual(clampPan({ x: -999, y: 0, scale: 2 }, fitted, screen), { x: -195, y: 0 });
    assert.deepEqual(clampPan({ x: 50, y: 50, scale: 1 }, fitted, screen), { x: 0, y: 0 });
  });

  it("zooms in on the tapped spot", () => {
    assert.equal(DOUBLE_TAP_ZOOM > 1 && DOUBLE_TAP_ZOOM <= MAX_ZOOM, true);
    // Tap 100px right of center at 1x: that spot stays under the finger at 2.5x.
    const zoomed = zoomAt({ x: 100, y: 0 }, { x: 0, y: 0, scale: 1 }, DOUBLE_TAP_ZOOM);
    assert.equal(zoomed.scale, DOUBLE_TAP_ZOOM);
    assert.equal(zoomed.x, 100 - 100 * DOUBLE_TAP_ZOOM);
    assert.equal(zoomed.y, 0);
  });

  it("pinches around the fingers' midpoint", () => {
    const start = { pan: { x: 0, y: 0, scale: 1 }, mid: { x: 0, y: 0 }, distance: 100 };
    const twice = pinchTo(start, { mid: { x: 0, y: 0 }, distance: 200 });
    assert.equal(twice.scale, 2);
    assert.equal(twice.x, 0);
    const moved = pinchTo(start, { mid: { x: 30, y: -10 }, distance: 100 });
    assert.equal(moved.scale, 1);
    assert.deepEqual([moved.x, moved.y], [30, -10]);
    const huge = pinchTo(start, { mid: { x: 0, y: 0 }, distance: 100_000 });
    assert.ok(huge.scale <= MAX_ZOOM * 1.25, "pinch past max resists");
  });
});

describe("photo viewer: spring", () => {
  it("is a linear() curve from 0 to 1 with a small overshoot", () => {
    const easing = springEasing();
    assert.match(easing, /^linear\(0, .+, 1\)$/);
    const points = easing.slice(7, -1).split(", ").map(Number);
    assert.ok(points.length >= 16);
    assert.ok(Math.max(...points) < 1.04, "only a slight overshoot");
    assert.ok(points[Math.floor(points.length / 3)] > 0.7, "fast start like iOS");
  });
});

function round(value: number) {
  return Math.round(value * 100) / 100;
}

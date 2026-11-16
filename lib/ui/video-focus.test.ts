import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createVideoFocus } from "./video-focus";

function clip(log: string[], name: string, auto = true) {
  return {
    auto,
    play: () => log.push(`play ${name}`),
    pause: () => log.push(`pause ${name}`),
  };
}

describe("one video plays at a time", () => {
  it("plays a clip once 60% visible and pauses it when scrolled away", () => {
    const focus = createVideoFocus();
    const log: string[] = [];
    focus.register("a", clip(log, "a"));
    focus.report("a", 0.4, 100);
    assert.deepEqual(log, []);
    focus.report("a", 0.75, 80);
    assert.deepEqual(log, ["play a"]);
    focus.report("a", 0.3, -200);
    assert.deepEqual(log, ["play a", "pause a"]);
    assert.equal(focus.playing(), null);
  });

  it("pauses the first clip when the next one takes over", () => {
    const focus = createVideoFocus();
    const log: string[] = [];
    focus.register("a", clip(log, "a"));
    focus.register("b", clip(log, "b"));
    focus.report("a", 1, 0);
    focus.report("b", 0.65, 500);
    assert.equal(focus.playing(), "a");
    focus.report("a", 0.1, -400);
    assert.deepEqual(log, ["play a", "pause a", "play b"]);
    assert.equal(focus.playing(), "b");
  });

  it("never starts a clip that can't autoplay (Reduce Motion, Low Data)", () => {
    const focus = createVideoFocus();
    const log: string[] = [];
    focus.register("a", clip(log, "a", false));
    focus.report("a", 1, 0);
    assert.deepEqual(log, []);
    focus.update("a", { auto: true });
    assert.deepEqual(log, ["play a"]);
    focus.update("a", { auto: false });
    assert.deepEqual(log, ["play a", "pause a"]);
  });

  it("pauses everything while the viewer is open, then resumes", () => {
    const focus = createVideoFocus();
    const log: string[] = [];
    focus.register("a", clip(log, "a"));
    focus.report("a", 1, 0);
    const release = focus.hold();
    assert.deepEqual(log, ["play a", "pause a"]);
    focus.report("a", 1, 0);
    assert.deepEqual(log, ["play a", "pause a"]);
    release();
    release();
    assert.deepEqual(log, ["play a", "pause a", "play a"]);
  });

  it("moves on when the playing clip leaves the page", () => {
    const focus = createVideoFocus();
    const log: string[] = [];
    const dropA = focus.register("a", clip(log, "a"));
    focus.register("b", clip(log, "b"));
    focus.report("a", 1, 0);
    focus.report("b", 0.8, 600);
    dropA();
    assert.deepEqual(log, ["play a", "play b"]);
    assert.equal(focus.playing(), "b");
  });
});

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { haptic, type HapticMoment } from "@/lib/ios/haptics";
import { playHaptic } from "@/lib/ios/native";

const MOMENTS: HapticMoment[] = ["like", "post", "save", "follow", "send", "refresh", "tick"];
const g = globalThis as { window?: unknown };
type Vibrate = (pattern: number[]) => boolean;
const nav = navigator as unknown as { vibrate?: Vibrate };

// Capacitor's web Haptics plays each style as a fixed vibrate pattern, so a fake
// navigator.vibrate shows which one playHaptic asked for.
const LIGHT = [20];
const SUCCESS = [35, 65, 21];

describe("haptics: moments", () => {
  afterEach(() => {
    delete g.window;
    delete nav.vibrate;
  });

  it("is a no-op on the web for every moment", () => {
    g.window = {};
    const calls: number[][] = [];
    nav.vibrate = (pattern) => {
      calls.push(pattern);
      return true;
    };
    for (const moment of MOMENTS) assert.doesNotThrow(() => haptic(moment));
    assert.deepEqual(calls, []);
  });

  it("plays a light impact for like, follow, send, refresh and tick, and a success buzz for post and save", async () => {
    const played: Record<string, number[]> = {};
    for (const moment of MOMENTS) {
      let last: number[] = [];
      nav.vibrate = (pattern) => {
        last = pattern;
        return true;
      };
      const result = playHaptic(moment);
      assert.ok(result instanceof Promise, `${moment} returns the Promise`);
      await result;
      played[moment] = last;
    }
    assert.deepEqual(played, {
      like: LIGHT,
      follow: LIGHT,
      send: LIGHT,
      refresh: LIGHT,
      tick: LIGHT,
      post: SUCCESS,
      save: SUCCESS,
    });
  });

  it("the scan reveal: a light snap, a soft purr of ticks across the sweep, a firmer lock, and a success on a sure match", async () => {
    const played: Record<string, number[][]> = {};
    for (const moment of ["snap", "sweep", "lock", "lockSure"] as const) {
      const calls: number[][] = [];
      nav.vibrate = (pattern) => {
        calls.push(pattern);
        return true;
      };
      await playHaptic(moment);
      played[moment] = calls;
    }
    // Capacitor's web patterns: [20] light, [43] medium, [70] a selection tick.
    assert.deepEqual(played.snap, [LIGHT]);
    assert.deepEqual(played.sweep, [[70], [70], [70], [70]], "four soft ticks, never one long buzz");
    assert.deepEqual(played.lock, [[43]]);
    assert.deepEqual(played.lockSure, [SUCCESS]);
  });

  it("the reveal's haptics are a no-op in a browser, like every other moment", () => {
    g.window = {};
    const calls: number[][] = [];
    nav.vibrate = (pattern) => {
      calls.push(pattern);
      return true;
    };
    for (const moment of ["snap", "sweep", "lock", "lockSure"] as const) assert.doesNotThrow(() => haptic(moment));
    assert.deepEqual(calls, []);
  });
});

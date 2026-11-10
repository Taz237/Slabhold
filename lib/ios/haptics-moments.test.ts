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
});

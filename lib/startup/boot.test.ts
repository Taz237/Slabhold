import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BOOT_TIMEOUT_MS, createStartupWatch, startupFallback } from "@/lib/startup/boot";

describe("startupFallback", () => {
  it("takes over screens that would otherwise stay blank", () => {
    assert.equal(startupFallback({ loading: "blank", seeded: false, signedIn: false }), "screen");
    assert.equal(startupFallback({ loading: "bare", seeded: false, signedIn: false }), "screen");
    assert.equal(startupFallback({ loading: "shell", seeded: true, signedIn: false }), "screen");
  });

  it("keeps pages that already show something and adds a notice", () => {
    assert.equal(startupFallback({ loading: "plain", seeded: false, signedIn: false }), "notice");
    assert.equal(startupFallback({ loading: "chromeless", seeded: false, signedIn: false }), "notice");
    assert.equal(startupFallback({ loading: "shell", seeded: false, signedIn: false }), "notice");
    assert.equal(startupFallback({ loading: "blank", seeded: false, signedIn: true }), "notice");
  });
});

describe("createStartupWatch", () => {
  function clock() {
    const timers = new Map<number, () => void>();
    let next = 1;
    return {
      schedule: (fn: () => void, ms: number) => {
        assert.equal(ms, BOOT_TIMEOUT_MS);
        const id = next++;
        timers.set(id, fn);
        return id;
      },
      cancel: (id: number) => void timers.delete(id),
      fireAll: () => {
        for (const [id, fn] of [...timers]) {
          timers.delete(id);
          fn();
        }
      },
      pending: () => timers.size,
    };
  }

  it("fails when the app is still not ready after the timeout", () => {
    const time = clock();
    let failed = 0;
    const watch = createStartupWatch({ onFail: () => failed++, ...time });
    watch.start();
    time.fireAll();
    assert.equal(failed, 1);
  });

  it("does not fail once the app is ready", () => {
    const time = clock();
    let failed = 0;
    const watch = createStartupWatch({ onFail: () => failed++, ...time });
    watch.start();
    watch.ready();
    assert.equal(time.pending(), 0);
    time.fireAll();
    assert.equal(failed, 0);
  });

  it("fails at once when loading breaks, and only once", () => {
    const time = clock();
    let failed = 0;
    const watch = createStartupWatch({ onFail: () => failed++, ...time });
    watch.start();
    watch.fail();
    watch.fail();
    time.fireAll();
    assert.equal(failed, 1);
  });

  it("stop cancels the timer", () => {
    const time = clock();
    let failed = 0;
    const watch = createStartupWatch({ onFail: () => failed++, ...time });
    watch.start();
    watch.stop();
    time.fireAll();
    assert.equal(failed, 0);
  });
});

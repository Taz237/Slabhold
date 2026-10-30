import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IDLE_FALLBACK_MS, IDLE_TIMEOUT_MS, afterFirstIdle } from "./idle";

function fakeHost(withIdle: boolean) {
  const idle: Array<{ run: () => void; timeout?: number }> = [];
  const timers: Array<{ run: () => void; ms: number }> = [];
  const cancelled = { idle: 0, timer: 0 };
  const host = {
    ...(withIdle
      ? {
          requestIdleCallback: (run: () => void, options?: { timeout: number }) => idle.push({ run, timeout: options?.timeout }) - 1,
          cancelIdleCallback: () => void cancelled.idle++,
        }
      : {}),
    setTimeout: (run: () => void, ms: number) => timers.push({ run, ms }) - 1,
    clearTimeout: () => void cancelled.timer++,
  };
  return { host, idle, timers, cancelled };
}

describe("afterFirstIdle", () => {
  it("waits for requestIdleCallback, with a timeout so it always runs", () => {
    const { host, idle, timers } = fakeHost(true);
    let ran = 0;
    afterFirstIdle(() => ran++, host);
    assert.equal(ran, 0);
    assert.equal(timers.length, 0);
    assert.equal(idle[0].timeout, IDLE_TIMEOUT_MS);
    idle[0].run();
    assert.equal(ran, 1);
  });

  it("falls back to setTimeout where requestIdleCallback is missing", () => {
    const { host, timers } = fakeHost(false);
    let ran = 0;
    afterFirstIdle(() => ran++, host);
    assert.equal(timers[0].ms, IDLE_FALLBACK_MS);
    timers[0].run();
    assert.equal(ran, 1);
  });

  it("does nothing once cancelled", () => {
    const withIdle = fakeHost(true);
    let ran = 0;
    afterFirstIdle(() => ran++, withIdle.host)();
    withIdle.idle[0].run();
    assert.equal(withIdle.cancelled.idle, 1);
    const plain = fakeHost(false);
    afterFirstIdle(() => ran++, plain.host)();
    plain.timers[0].run();
    assert.equal(plain.cancelled.timer, 1);
    assert.equal(ran, 0);
  });
});

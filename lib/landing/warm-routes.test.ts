import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FIRST_INTERACTION_EVENTS,
  WARM_FALLBACK_MS,
  prefetchOnce,
  warmOnFirstInteraction,
  type WarmHost,
} from "@/lib/landing/warm-routes";

/** A window stand-in: listeners, timers and idle callbacks run only when the test says. */
function fakeHost(readyState: "loading" | "complete" = "loading") {
  const listeners = new Map<string, { fn: () => void; opts: unknown }[]>();
  const timers = new Map<number, { fn: () => void; ms: number }>();
  const idles = new Map<number, () => void>();
  let next = 1;
  const host: WarmHost = {
    document: { readyState },
    addEventListener(type: string, fn: () => void, opts?: unknown) {
      listeners.set(type, [...(listeners.get(type) ?? []), { fn, opts }]);
    },
    removeEventListener(type: string, fn: () => void) {
      listeners.set(type, (listeners.get(type) ?? []).filter((entry) => entry.fn !== fn));
    },
    setTimeout(fn: () => void, ms: number) {
      timers.set(next, { fn, ms });
      return next++;
    },
    clearTimeout(handle: number) {
      timers.delete(handle);
    },
    requestIdleCallback(fn: () => void) {
      idles.set(next, fn);
      return next++;
    },
    cancelIdleCallback(handle: number) {
      idles.delete(handle);
    },
  };
  return {
    host,
    listening: (type: string) => (listeners.get(type) ?? []).length,
    optionsOf: (type: string) => listeners.get(type)?.[0]?.opts,
    emit(type: string) {
      for (const { fn } of [...(listeners.get(type) ?? [])]) fn();
    },
    runIdle() {
      for (const [handle, fn] of [...idles]) {
        idles.delete(handle);
        fn();
      }
    },
    runTimers() {
      for (const [handle, { fn }] of [...timers]) {
        timers.delete(handle);
        fn();
      }
    },
    timerDelays: () => [...timers.values()].map((timer) => timer.ms),
  };
}

describe("warmOnFirstInteraction", () => {
  it("warms on the first scroll, pointer, key or touch, once, with passive listeners it then removes", () => {
    assert.deepEqual([...FIRST_INTERACTION_EVENTS], ["scroll", "pointerdown", "pointermove", "keydown", "touchstart"]);
    for (const event of FIRST_INTERACTION_EVENTS) {
      const fake = fakeHost();
      let warmed = 0;
      warmOnFirstInteraction(() => warmed++, fake.host);
      assert.equal(fake.listening(event), 1, event);
      assert.deepEqual(fake.optionsOf(event), { capture: true, passive: true, once: true });
      fake.emit(event);
      assert.equal(warmed, 1, event);
      for (const other of FIRST_INTERACTION_EVENTS) fake.emit(other);
      assert.equal(warmed, 1, "only the first interaction warms");
      for (const other of FIRST_INTERACTION_EVENTS) assert.equal(fake.listening(other), 0, `${other} removed`);
      fake.emit("load");
      fake.runIdle();
      fake.runTimers();
      assert.equal(warmed, 1, "the fallback doesn't warm again");
    }
  });

  it("falls back only after load, then the first idle moment, then a short delay", () => {
    const fake = fakeHost("loading");
    let warmed = 0;
    warmOnFirstInteraction(() => warmed++, fake.host);
    fake.runIdle();
    fake.runTimers();
    assert.equal(warmed, 0, "nothing before load");
    fake.emit("load");
    assert.deepEqual(fake.timerDelays(), [], "no timer before the page is idle");
    fake.runIdle();
    assert.deepEqual(fake.timerDelays(), [WARM_FALLBACK_MS]);
    assert.ok(WARM_FALLBACK_MS >= 2000 && WARM_FALLBACK_MS <= 3000);
    fake.runTimers();
    assert.equal(warmed, 1);
    for (const event of FIRST_INTERACTION_EVENTS) assert.equal(fake.listening(event), 0, `${event} removed`);
  });

  it("starts the fallback at once when the page has already loaded", () => {
    const fake = fakeHost("complete");
    let warmed = 0;
    warmOnFirstInteraction(() => warmed++, fake.host);
    fake.runIdle();
    fake.runTimers();
    assert.equal(warmed, 1);
  });

  it("does nothing once cancelled", () => {
    const fake = fakeHost("loading");
    let warmed = 0;
    const cancel = warmOnFirstInteraction(() => warmed++, fake.host);
    cancel();
    for (const event of [...FIRST_INTERACTION_EVENTS, "load"]) fake.emit(event);
    fake.runIdle();
    fake.runTimers();
    assert.equal(warmed, 0);
    for (const event of FIRST_INTERACTION_EVENTS) assert.equal(fake.listening(event), 0);
  });
});

describe("prefetchOnce", () => {
  it("asks each router for each href once", () => {
    const calls: string[] = [];
    const router = { prefetch: (href: string) => calls.push(href) };
    prefetchOnce(router, "/signup?next=%2F");
    prefetchOnce(router, "/signup?next=%2F");
    prefetchOnce(router, "/login?next=%2F");
    prefetchOnce(router, "/login?next=%2F");
    assert.deepEqual(calls, ["/signup?next=%2F", "/login?next=%2F"]);
    const other = { prefetch: (href: string) => calls.push(`other:${href}`) };
    prefetchOnce(other, "/signup?next=%2F");
    assert.equal(calls.at(-1), "other:/signup?next=%2F");
  });

  it("treats every component's useRouter() wrapper of one app router as the same router", () => {
    const calls: string[] = [];
    const prefetch = (href: string) => calls.push(href);
    prefetchOnce({ prefetch }, "/signup");
    prefetchOnce({ prefetch }, "/signup");
    assert.deepEqual(calls, ["/signup"]);
  });

  it("is a no-op without a router", () => {
    assert.doesNotThrow(() => prefetchOnce(null, "/signup"));
  });
});

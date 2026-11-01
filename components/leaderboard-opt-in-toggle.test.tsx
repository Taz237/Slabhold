import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { act, createElement } from "react";
import { installDom } from "@/lib/test/dom";
import {
  LeaderboardOptInControl,
  toggleLeaderboardOptIn,
  type LeaderboardToggleDeps,
} from "@/components/leaderboard-opt-in";

const { win } = installDom();

type SaveResult = { optedIn: boolean; error?: string };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

function harness(save: (next: boolean) => Promise<SaveResult>, previous = false) {
  const log = {
    saves: [] as boolean[],
    busy: [] as boolean[],
    errors: [] as (string | null)[],
    checked: [] as boolean[],
    saved: [] as boolean[],
  };
  const deps: LeaderboardToggleDeps = {
    busyRef: { current: false },
    setBusy: (value) => log.busy.push(value),
    setError: (value) => log.errors.push(value),
    setChecked: (value) => log.checked.push(value),
    previous,
    save: (next) => {
      log.saves.push(next);
      return save(next);
    },
    onSaved: (optedIn) => log.saved.push(optedIn),
  };
  return { deps, log };
}

const echo = async (next: boolean): Promise<SaveResult> => ({ optedIn: next });

describe("leaderboard opt-in toggle", () => {
  it("saves on, then off, and shows what was saved", async () => {
    const on = harness(echo, false);
    await toggleLeaderboardOptIn(true, on.deps);
    assert.deepEqual(on.log.saves, [true]);
    assert.deepEqual(on.log.checked, [true]);
    assert.deepEqual(on.log.saved, [true]);
    const off = harness(echo, true);
    await toggleLeaderboardOptIn(false, off.deps);
    assert.deepEqual(off.log.saves, [false]);
    assert.deepEqual(off.log.checked, [false]);
    assert.deepEqual(off.log.saved, [false]);
  });

  it("keeps the previous state and shows the error when the save fails", async () => {
    const { deps, log } = harness(async () => ({ optedIn: false, error: "x" }), true);
    await toggleLeaderboardOptIn(false, deps);
    assert.deepEqual(log.checked, [true]);
    assert.equal(log.errors.at(-1), "x");
    assert.equal(log.busy.at(-1), false);
    assert.equal(deps.busyRef.current, false);
    assert.deepEqual(log.saved, []);
  });

  it("keeps the previous state and unlocks when the action throws", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => void unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      const { deps, log } = harness(() => Promise.reject(new Error("network")), true);
      await toggleLeaderboardOptIn(false, deps);
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.deepEqual(log.checked, [true]);
      assert.equal(log.errors.at(-1), "Couldn't save that setting.");
      assert.equal(log.busy.at(-1), false);
      assert.equal(deps.busyRef.current, false);
      assert.deepEqual(log.saved, []);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
    assert.deepEqual(unhandled, []);
  });

  it("saves once for two taps before the first save lands", async () => {
    const pending = deferred<SaveResult>();
    const { deps, log } = harness(() => pending.promise);
    const first = toggleLeaderboardOptIn(true, deps);
    const second = toggleLeaderboardOptIn(true, deps);
    assert.deepEqual(log.busy, [true]);
    pending.resolve({ optedIn: true });
    await Promise.all([first, second]);
    assert.deepEqual(log.saves, [true]);
    assert.deepEqual(log.busy, [true, false]);
  });
});

describe("LeaderboardOptInControl", () => {
  it("reflects checked and reports taps", async () => {
    const { createRoot } = await import("react-dom/client");
    const host = win.document.createElement("div");
    win.document.body.appendChild(host);
    const root = createRoot(host);
    const taps: boolean[] = [];
    const draw = async (checked: boolean) => {
      await act(async () => {
        root.render(
          createElement(LeaderboardOptInControl, {
            checked,
            disabled: false,
            onToggle: (next: boolean) => taps.push(next),
            minimums: { minCards: 3, minValue: 100, minAccountDays: 7 },
          }),
        );
      });
      const input = host.querySelector<HTMLInputElement>('input[role="switch"]');
      assert.ok(input);
      return input;
    };
    let input = await draw(false);
    assert.equal(input.checked, false);
    assert.equal(input.getAttribute("aria-checked"), "false");
    await act(async () => input.click());
    input = await draw(true);
    assert.equal(input.checked, true);
    assert.equal(input.getAttribute("aria-checked"), "true");
    await act(async () => input.click());
    assert.deepEqual(taps, [true, false]);
    act(() => root.unmount());
    host.remove();
  });
});

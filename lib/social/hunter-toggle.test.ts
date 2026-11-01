import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toggleHunterSetting, type HunterToggleDeps } from "@/components/hunter-setting";
import type { HunterSettingDb } from "@/lib/social/hunter-setting";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const db = {} as HunterSettingDb;

function harness(load: () => Promise<HunterSettingDb | null>) {
  const log = { saves: 0, busy: [] as boolean[], errors: [] as (string | null)[], checked: [] as boolean[] };
  const deps: HunterToggleDeps = {
    userId: "ada",
    busyRef: { current: false },
    setBusy: (value) => log.busy.push(value),
    setError: (value) => log.errors.push(value),
    setChecked: (value) => log.checked.push(value),
    load,
    save: async (_db, _id, next) => {
      log.saves += 1;
      return { showAsHunter: next };
    },
  };
  return { deps, log };
}

describe("hunter toggle", () => {
  it("saves once for two quick taps while supabase-js is still loading", async () => {
    const client = deferred<HunterSettingDb | null>();
    const { deps, log } = harness(() => client.promise);
    const first = toggleHunterSetting(true, deps);
    const second = toggleHunterSetting(true, deps);
    assert.deepEqual(log.busy, [true]);
    client.resolve(db);
    await Promise.all([first, second]);
    assert.equal(log.saves, 1);
    assert.deepEqual(log.checked, [true]);
    assert.deepEqual(log.busy, [true, false]);
    assert.equal(deps.busyRef.current, false);
  });

  it("clears busy when there is no client", async () => {
    const { deps, log } = harness(async () => null);
    await toggleHunterSetting(true, deps);
    assert.equal(log.saves, 0);
    assert.deepEqual(log.busy, [true, false]);
    assert.equal(deps.busyRef.current, false);
  });

  it("clears busy and shows the error line when the load throws", async () => {
    const { deps, log } = harness(() => Promise.reject(new Error("ChunkLoadError")));
    await toggleHunterSetting(true, deps);
    assert.equal(log.saves, 0);
    assert.deepEqual(log.busy, [true, false]);
    assert.equal(deps.busyRef.current, false);
    assert.equal(log.errors.at(-1), "Couldn't save that setting.");
    // The next tap tries again.
    deps.load = async () => db;
    await toggleHunterSetting(false, deps);
    assert.equal(log.saves, 1);
    assert.deepEqual(log.checked, [false]);
  });

  it("shows a failed save and keeps the switch", async () => {
    const { deps, log } = harness(async () => db);
    deps.save = async () => ({ showAsHunter: false, error: "Couldn't save that setting." });
    await toggleHunterSetting(true, deps);
    assert.deepEqual(log.checked, []);
    assert.equal(log.errors.at(-1), "Couldn't save that setting.");
    assert.deepEqual(log.busy, [true, false]);
  });
});

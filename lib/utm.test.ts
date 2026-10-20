import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { captureFirstTouch, readFreshUtm, UTM_STORAGE_KEY, UTM_TTL_MS } from "./utm";

const start = Date.parse("2026-10-20T15:00:00.000Z");

function memory() {
  let raw: string | null = null;
  let writes = 0;
  return {
    get writes() {
      return writes;
    },
    get raw() {
      return raw;
    },
    getItem() {
      return raw;
    },
    setItem(key: string, value: string) {
      assert.equal(key, UTM_STORAGE_KEY);
      raw = value;
      writes += 1;
    },
  };
}

describe("captureFirstTouch", () => {
  it("keeps the first campaign for 7 days and ignores a later one", () => {
    assert.equal(UTM_TTL_MS, 7 * 24 * 60 * 60 * 1000);
    const store = memory();
    const first = captureFirstTouch(
      "?utm_source=instagram&utm_medium=social&utm_campaign=launch",
      store,
      start,
    );
    assert.deepEqual(first, {
      utm_source: "instagram",
      utm_medium: "social",
      utm_campaign: "launch",
    });

    const later = captureFirstTouch(
      "?utm_source=newsletter&utm_medium=email&utm_campaign=october",
      store,
      start + 1_000,
    );
    assert.deepEqual(later, first);
    assert.equal(store.writes, 1);
    assert.equal(store.raw?.includes("newsletter"), false);

    const onTheDay = captureFirstTouch("?utm_source=google", store, start + UTM_TTL_MS);
    assert.deepEqual(onTheDay, first);
    assert.equal(store.writes, 1);
  });

  it("waits for the first visit that actually has campaign parameters", () => {
    const store = memory();
    assert.deepEqual(captureFirstTouch("", store, start), {});
    assert.deepEqual(captureFirstTouch("?next=/cards", store, start + 1), {});
    assert.equal(store.writes, 0);
    assert.deepEqual(captureFirstTouch("?utm_source=instagram", store, start + 2), {
      utm_source: "instagram",
    });
    assert.equal(store.writes, 1);
  });

  it("replaces an expired touch and refuses emails, ids, and query strings", () => {
    const store = memory();
    captureFirstTouch("?utm_source=instagram", store, start);
    const replaced = captureFirstTouch(
      "?utm_source=google&utm_medium=cpc",
      store,
      start + UTM_TTL_MS + 1,
    );
    assert.deepEqual(replaced, { utm_source: "google", utm_medium: "cpc" });
    assert.equal(store.writes, 2);

    const unsafe = memory();
    const userId = "550e8400-e29b-41d4-a716-446655440000";
    assert.deepEqual(
      captureFirstTouch(
        `?utm_source=maya%40cardflip.app&utm_medium=https%3A%2F%2Fevil.test%2Fx%3Fy%3D1&utm_campaign=${userId}&email=maya%40cardflip.app`,
        unsafe,
        start,
      ),
      {},
    );
    assert.equal(unsafe.writes, 0);

    const mixed = memory();
    assert.deepEqual(
      captureFirstTouch(
        "?utm_source=instagram&utm_medium=a%40b.com&utm_campaign=spring%20sale&username=waxroom",
        mixed,
        start,
      ),
      { utm_source: "instagram" },
    );
    assert.equal(mixed.raw?.includes("waxroom"), false);
    assert.equal(mixed.raw?.includes("@"), false);
    assert.deepEqual(readFreshUtm(mixed, start), { utm_source: "instagram" });
    assert.equal(readFreshUtm(mixed, start + UTM_TTL_MS + 1), null);
  });

  it("does not throw when storage fails", () => {
    const broken = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };
    assert.deepEqual(captureFirstTouch("?utm_source=instagram", broken, start), {});
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INTEREST_READ_RETRY_MS, interestLoadFromError, readInterestsWithRetry } from "@/lib/onboarding/interests-load";

describe("interestLoadFromError", () => {
  it("a missing table is missing; anything else is an error", () => {
    assert.deepEqual(interestLoadFromError({ code: "PGRST205", message: "Could not find the table" }), { status: "missing" });
    assert.deepEqual(interestLoadFromError({ message: "TypeError: Load failed" }), { status: "error" });
    assert.deepEqual(interestLoadFromError(new Error("Failed to fetch")), { status: "error" });
  });
});

describe("readInterestsWithRetry", () => {
  const waits: number[] = [];
  const wait = async (ms: number) => void waits.push(ms);

  it("tries once more after a network error, then reports the error", async () => {
    waits.length = 0;
    let calls = 0;
    const result = await readInterestsWithRetry(async () => {
      calls += 1;
      return { status: "error" };
    }, wait);
    assert.equal(calls, 2);
    assert.deepEqual(waits, [INTEREST_READ_RETRY_MS]);
    assert.deepEqual(result, { status: "error" });
  });

  it("a thrown error (the client failed to load) counts as an error, not missing", async () => {
    waits.length = 0;
    const result = await readInterestsWithRetry(async () => {
      throw new Error("chunk failed");
    }, wait);
    assert.deepEqual(result, { status: "error" });
  });

  it("the retry can succeed", async () => {
    waits.length = 0;
    let calls = 0;
    const result = await readInterestsWithRetry(async () => {
      calls += 1;
      return calls === 1 ? { status: "error" } : { status: "ready", rows: [] };
    }, wait);
    assert.deepEqual(result, { status: "ready", rows: [] });
  });

  it("does not retry a missing table", async () => {
    waits.length = 0;
    let calls = 0;
    await readInterestsWithRetry(async () => {
      calls += 1;
      return { status: "missing" };
    }, wait);
    assert.equal(calls, 1);
  });
});

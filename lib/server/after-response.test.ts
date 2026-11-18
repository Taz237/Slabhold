import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runAfterResponse } from "./after-response";

describe("runAfterResponse", () => {
  it("hands the task to the scheduler and does not wait for it", async () => {
    let scheduled: (() => Promise<void>) | null = null;
    let ran = false;
    await runAfterResponse(
      async () => {
        ran = true;
      },
      (task) => {
        scheduled = task;
      },
    );
    assert.equal(ran, false, "the response must not wait on the task");
    assert.ok(scheduled, "the task was scheduled");
    await (scheduled as unknown as () => Promise<void>)();
    assert.equal(ran, true);
  });

  it("runs the task inline when there is no request scope to schedule it in", async () => {
    let ran = false;
    await runAfterResponse(
      async () => {
        ran = true;
      },
      () => {
        throw new Error("`after` was called outside a request scope");
      },
    );
    assert.equal(ran, true, "falls back to the old awaited behavior");
  });

  it("never throws, inline or scheduled", async () => {
    await runAfterResponse(
      async () => {
        throw new Error("boom");
      },
      () => {
        throw new Error("no scope");
      },
    );
    let scheduled: (() => Promise<void>) | null = null;
    await runAfterResponse(
      async () => {
        throw new Error("boom");
      },
      (task) => {
        scheduled = task;
      },
    );
    await (scheduled as unknown as () => Promise<void>)();
  });
});

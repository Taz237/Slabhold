import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pendingCardPost, queueCardPost } from "@/lib/social/card-post-queue";

describe("card post queue: the feed post runs after the save, in the background", () => {
  it("returns at once and is pending until the post settles", async () => {
    let finish: (value: { postId: string | null }) => void = () => undefined;
    const started = Date.now();
    const running = queueCardPost("card-a", () => new Promise((resolve) => (finish = resolve)));
    assert.ok(Date.now() - started < 50, "queueing never waits for the post");
    assert.equal(pendingCardPost("card-a"), running);
    finish({ postId: "post-1" });
    assert.deepEqual(await running, { postId: "post-1" });
    assert.equal(pendingCardPost("card-a"), null);
  });

  it("a thrown post settles as no post, and never rejects", async () => {
    const running = queueCardPost("card-b", async () => {
      throw new Error("feed down");
    });
    assert.deepEqual(await running, { postId: null });
    assert.equal(pendingCardPost("card-b"), null);
  });

  it("a second queue for the same card while one runs reuses it, so one add posts once", async () => {
    let calls = 0;
    let finish: (value: { postId: string | null }) => void = () => undefined;
    const first = queueCardPost("card-c", () => {
      calls += 1;
      return new Promise((resolve) => (finish = resolve));
    });
    const second = queueCardPost("card-c", async () => {
      calls += 1;
      return { postId: "post-2" };
    });
    assert.equal(second, first);
    finish({ postId: "post-1" });
    await first;
    assert.equal(calls, 1);
  });
});

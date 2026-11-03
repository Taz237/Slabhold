import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nativeShareOrSheet, type SharePayload } from "./sheet";

const data: SharePayload = {
  title: "Silver Leaderboard",
  text: "Just unlocked Silver Leaderboard on Slabhold",
  url: "https://slabhold.app/u/demo/badges/leaderboard/silver?ref=share",
};

function named(name: string) {
  return Object.assign(new Error(name), { name });
}

/** A clock that only moves when the fake share says so. */
function fakeClock() {
  let t = 1000;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

function rejectsAfter(clock: ReturnType<typeof fakeClock>, ms: number, error: Error) {
  return async () => {
    clock.advance(ms);
    throw error;
  };
}

describe("native share fallback", () => {
  it("opens our sheet when the native share aborts too fast to be a person", async () => {
    const clock = fakeClock();
    const result = await nativeShareOrSheet(data, rejectsAfter(clock, 50, named("AbortError")), {
      now: clock.now,
      minCancelMs: 400,
    });
    assert.equal(result, "sheet");
  });

  it("treats a slow abort as the person cancelling", async () => {
    const clock = fakeClock();
    const result = await nativeShareOrSheet(data, rejectsAfter(clock, 900, named("AbortError")), {
      now: clock.now,
      minCancelMs: 400,
    });
    assert.equal(result, "cancelled");
  });

  it("opens our sheet on NotAllowedError", async () => {
    const clock = fakeClock();
    const result = await nativeShareOrSheet(data, rejectsAfter(clock, 900, named("NotAllowedError")), {
      now: clock.now,
      minCancelMs: 400,
    });
    assert.equal(result, "sheet");
  });

  it("keeps today's behaviour with no options", async () => {
    const clock = fakeClock();
    assert.equal(await nativeShareOrSheet(data, rejectsAfter(clock, 0, named("AbortError"))), "cancelled");
    assert.equal(await nativeShareOrSheet(data, rejectsAfter(clock, 0, named("NotAllowedError"))), "sheet");
    const seen: unknown[] = [];
    assert.equal(await nativeShareOrSheet(data, async (payload) => void seen.push(payload)), "shared");
    assert.deepEqual(seen, [data]);
  });
});

describe("native share with the image file", () => {
  const file = new File([new Uint8Array([137, 80, 78, 71])], "slabhold-badge-leaderboard-silver.png", {
    type: "image/png",
  });

  it("shares the file with the link when canShare says yes", async () => {
    const seen: unknown[] = [];
    const asked: unknown[] = [];
    const result = await nativeShareOrSheet(data, async (payload) => void seen.push(payload), {
      files: [file],
      canShare: (payload) => {
        asked.push(payload);
        return true;
      },
    });
    assert.equal(result, "shared");
    assert.deepEqual(asked, [{ ...data, files: [file] }]);
    assert.deepEqual(seen, [{ ...data, files: [file] }]);
  });

  it("shares the link only when canShare says no", async () => {
    const seen: unknown[] = [];
    const result = await nativeShareOrSheet(data, async (payload) => void seen.push(payload), {
      files: [file],
      canShare: () => false,
    });
    assert.equal(result, "shared");
    assert.deepEqual(seen, [data]);
  });

  it("shares the link only when there is no canShare", async () => {
    const seen: unknown[] = [];
    await nativeShareOrSheet(data, async (payload) => void seen.push(payload), { files: [file] });
    assert.deepEqual(seen, [data]);
  });

  it("shares the link only when canShare throws", async () => {
    const seen: unknown[] = [];
    await nativeShareOrSheet(data, async (payload) => void seen.push(payload), {
      files: [file],
      canShare: () => {
        throw new TypeError("bad files");
      },
    });
    assert.deepEqual(seen, [data]);
  });
});

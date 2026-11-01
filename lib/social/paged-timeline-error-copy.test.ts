import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { loadError } from "@/components/use-paged-timeline";

const warned: unknown[][] = [];
const realWarn = console.warn;
beforeEach(() => {
  warned.length = 0;
  console.warn = (...args: unknown[]) => void warned.push(args);
});
afterEach(() => {
  console.warn = realWarn;
});

describe("timeline error line", () => {
  it("shows a plain message for a loader that rejects, and warns the real reason", async () => {
    const loader = () => Promise.reject(new Error("boom"));
    let error: string | null = null;
    await loader().catch((reason: unknown) => {
      error = loadError(reason);
    });
    assert.equal(error, "Could not load posts.");
    assert.deepEqual(warned, [["[timeline]", "boom"]]);
  });

  it("hides chunk-load and PostgREST messages", () => {
    assert.equal(
      loadError(new TypeError("Failed to fetch dynamically imported module: https://x/_next/a.js")),
      "Could not load posts.",
    );
    assert.equal(loadError({ message: "permission denied for table posts" }), "Could not load posts.");
    assert.equal(loadError("odd"), "Could not load posts.");
    assert.equal(warned.length, 3);
    assert.ok(warned.every(([tag]) => tag === "[timeline]"));
  });
});

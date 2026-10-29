import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { photoClass } from "@/components/card-slab-art";

describe("tile photo visibility", () => {
  it("first-screen photos are never hidden waiting for hydration", () => {
    for (const status of ["loading", "loaded", "error"] as const) {
      const cls = photoClass({ eager: true, status });
      assert.doesNotMatch(cls, /opacity-0|transition-opacity/, status);
    }
  });

  it("later photos fade in once loaded", () => {
    assert.match(photoClass({ eager: false, status: "loading" }), /opacity-0/);
    assert.match(photoClass({ eager: false, status: "loaded" }), /opacity-100/);
    assert.match(photoClass({ eager: false, status: "loading" }), /motion-reduce:transition-none/);
  });
});

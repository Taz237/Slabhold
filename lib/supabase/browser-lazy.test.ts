import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lazyBrowserClient } from "./browser-lazy";

const fake = { from() {} } as unknown as SupabaseClient;

describe("lazy supabase-js", () => {
  it("never keeps a failed chunk load: the next call retries", async () => {
    let calls = 0;
    const lazy = lazyBrowserClient(
      async () => {
        calls += 1;
        if (calls === 1) throw new Error("ChunkLoadError");
        return { createSupabaseBrowser: () => fake };
      },
      () => true,
    );
    await assert.rejects(lazy.load(), /ChunkLoadError/);
    assert.equal(lazy.loaded(), null);
    assert.equal(await lazy.load(), fake);
    assert.equal(lazy.loaded(), fake);
    // Once in, it is shared.
    assert.equal(await lazy.load(), fake);
    assert.equal(calls, 2);
  });

  it("shares one load between callers that ask at the same time", async () => {
    let calls = 0;
    const lazy = lazyBrowserClient(
      async () => {
        calls += 1;
        return { createSupabaseBrowser: () => fake };
      },
      () => true,
    );
    const [a, b] = await Promise.all([lazy.load(), lazy.load()]);
    assert.equal(a, fake);
    assert.equal(b, fake);
    assert.equal(calls, 1);
  });

  it("is null without Supabase config, and loads nothing", async () => {
    let calls = 0;
    const lazy = lazyBrowserClient(
      async () => {
        calls += 1;
        return { createSupabaseBrowser: () => fake };
      },
      () => false,
    );
    assert.equal(await lazy.load(), null);
    assert.equal(calls, 0);
  });
});

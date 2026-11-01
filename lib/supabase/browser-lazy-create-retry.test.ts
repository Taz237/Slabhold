import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lazyBrowserClient } from "./browser-lazy";

const fake = { from() {} } as unknown as SupabaseClient;

describe("lazy supabase-js when creating the client throws", () => {
  it("never keeps the failure: the next call imports and creates again", async () => {
    let imports = 0;
    let creates = 0;
    const lazy = lazyBrowserClient(
      async () => {
        imports += 1;
        return {
          createSupabaseBrowser: () => {
            creates += 1;
            if (creates === 1) throw new Error("Invalid supabaseUrl");
            return fake;
          },
        };
      },
      () => true,
    );
    await assert.rejects(lazy.load(), /Invalid supabaseUrl/);
    assert.equal(lazy.loaded(), null);
    assert.equal(await lazy.load(), fake);
    assert.equal(lazy.loaded(), fake);
    assert.equal(imports, 2);
    assert.equal(creates, 2);
  });
});

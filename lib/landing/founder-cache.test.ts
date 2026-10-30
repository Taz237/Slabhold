import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EMPTY_FOUNDER_SHOWCASE } from "@/lib/landing/founder";
import { readFounderShowcase } from "@/lib/landing/founder-load";
import {
  FOUNDER_CACHE_CONTROL,
  FOUNDER_FAILED_CACHE_CONTROL,
  founderResponse,
} from "@/lib/landing/founder-response";

type Result = { data: unknown; error: { message: string } | null };

/** A Supabase stand-in: each from() answers with the next queued result. */
function fakeClient(results: Result[]): SupabaseClient {
  const queue = [...results];
  return {
    from() {
      const result = queue.shift() ?? { data: null, error: null };
      const chain: Record<string, unknown> = {};
      for (const name of ["select", "eq", "not", "order", "limit"]) chain[name] = () => chain;
      chain.maybeSingle = async () => result;
      chain.returns = async () => result;
      return chain;
    },
  } as unknown as SupabaseClient;
}

const profile = { id: "f1", username: "donnietaz", display_name: "Donnie", avatar_url: null };

describe("founder showcase read errors", () => {
  it("throws on a profile read error, so unstable_cache keeps nothing", async () => {
    await assert.rejects(readFounderShowcase(fakeClient([{ data: null, error: { message: "timeout" } }])), /timeout/);
  });

  it("throws on a card read error too", async () => {
    await assert.rejects(
      readFounderShowcase(
        fakeClient([
          { data: profile, error: null },
          { data: null, error: { message: "503" } },
        ]),
      ),
      /503/,
    );
  });

  it("is empty only when the founder genuinely isn't there", async () => {
    assert.deepEqual(await readFounderShowcase(fakeClient([{ data: null, error: null }])), EMPTY_FOUNDER_SHOWCASE);
    const found = await readFounderShowcase(
      fakeClient([
        { data: profile, error: null },
        { data: [], error: null },
      ]),
    );
    assert.equal(found.profile?.username, "donnietaz");
  });

  it("serves a failed read for 60 seconds, never with the hour-long header", async () => {
    const failed = await founderResponse(() => Promise.reject(new Error("read failed")));
    assert.equal(failed.headers.get("Cache-Control"), FOUNDER_FAILED_CACHE_CONTROL);
    assert.match(FOUNDER_FAILED_CACHE_CONTROL, /s-maxage=60$/);
    assert.deepEqual(await failed.json(), EMPTY_FOUNDER_SHOWCASE);

    const ok = await founderResponse(async () => EMPTY_FOUNDER_SHOWCASE);
    assert.equal(ok.headers.get("Cache-Control"), FOUNDER_CACHE_CONTROL);
    assert.match(FOUNDER_CACHE_CONTROL, /s-maxage=3600/);
  });

  it("Home catches the throw and falls back to sample slabs", () => {
    for (const home of ["app/(app)/page.tsx", "app/welcome/page.tsx"]) {
      assert.match(readFileSync(join(process.cwd(), home), "utf8"), /await founderShowcase\(\)|founderShowcase\(\), movers\(\)/, home);
    }
    const page = readFileSync(join(process.cwd(), "lib/landing/founder-page.ts"), "utf8");
    assert.match(page, /try \{\s*return await cachedFounderShowcase\(\);\s*\} catch/);
    assert.match(page, /return EMPTY_FOUNDER_SHOWCASE;/);
    const route = readFileSync(join(process.cwd(), "app/api/landing/founder/route.ts"), "utf8");
    assert.match(route, /founderResponse\(cachedFounderShowcase\)/);
  });
});

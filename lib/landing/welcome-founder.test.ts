import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from "next/constants";
import { EMPTY_FOUNDER_SHOWCASE } from "@/lib/landing/founder";
import { readFounderShowcase } from "@/lib/landing/founder-load";
import { founderFailure, welcomeFounderShowcase } from "@/lib/landing/founder-page";

type Result = { data: unknown; error: { message: string } | null };

/** Same Supabase stand-in as founder-cache.test.ts: each from() answers with the next queued result. */
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
const failing = () => readFounderShowcase(fakeClient([{ data: null, error: { message: "timeout" } }]));
const good = () =>
  readFounderShowcase(
    fakeClient([
      { data: profile, error: null },
      { data: [], error: null },
    ]),
  );

const warned: unknown[][] = [];
const realWarn = console.warn;
beforeEach(() => {
  warned.length = 0;
  console.warn = (...args: unknown[]) => void warned.push(args);
});
afterEach(() => {
  console.warn = realWarn;
});

describe("/welcome founder read", () => {
  it("throws at runtime, so ISR keeps the last good page and the next request retries", async () => {
    await assert.rejects(welcomeFounderShowcase(failing, PHASE_PRODUCTION_SERVER, "production"), /timeout/);
    await assert.rejects(welcomeFounderShowcase(failing, undefined, "production"), /timeout/);
    assert.equal(warned[0]?.[0], "[landing-founder]");
  });

  it("falls back to sample slabs during next build, so a build without Supabase passes", async () => {
    assert.deepEqual(await welcomeFounderShowcase(failing, PHASE_PRODUCTION_BUILD), EMPTY_FOUNDER_SHOWCASE);
    assert.equal(warned[0]?.[0], "[landing-founder]");
  });

  it("returns a good read in both phases", async () => {
    for (const phase of [PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER]) {
      const showcase = await welcomeFounderShowcase(good, phase);
      assert.equal(showcase.profile?.username, "donnietaz");
    }
  });

  it("decides build or runtime in one pure function", () => {
    const error = new Error("x");
    assert.equal(founderFailure(error, PHASE_PRODUCTION_BUILD), EMPTY_FOUNDER_SHOWCASE);
    assert.throws(() => founderFailure(error, PHASE_PRODUCTION_SERVER, "production"), /x/);
    assert.throws(() => founderFailure(error, undefined, "production"), /x/);
  });

  it("is used by /welcome only; Home keeps the never-throwing read", () => {
    const welcome = readFileSync(join(process.cwd(), "app/welcome/page.tsx"), "utf8");
    assert.match(welcome, /await welcomeFounderShowcase\(\)/);
    assert.doesNotMatch(welcome, /[^e]founderShowcase\(\)/i);
    assert.match(welcome, /export const revalidate = 1800;/);
    const home = readFileSync(join(process.cwd(), "app/(app)/page.tsx"), "utf8");
    assert.match(home, /founderShowcase\(\), movers\(\)/);
    assert.doesNotMatch(home, /welcomeFounderShowcase/);
  });
});

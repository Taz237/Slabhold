import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FOUNDER_PICKUP_SELECT } from "@/lib/landing/founder-pickup";
import { landingFounderPickup, readFounderPickup } from "@/lib/landing/founder-pickup-load";

type Result = { data: unknown; error: { message: string } | null };

const PHOTOS = "https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/card-photos";
const profile = { id: "f1", username: "donnietaz", display_name: "Donnie", avatar_url: null };
const card = {
  user_id: "f1",
  player: "Fixture Jordan Love",
  grade: "10",
  grader: "PSA",
  condition_type: "graded",
  image_url: `${PHOTOS}/f1/love.jpg`,
  created_at: "2026-10-01T00:00:00Z",
};

/** Each from() answers with the next queued result and records its table, columns and filters. */
function fakeClient(results: Result[], calls: string[] = []): SupabaseClient {
  const queue = [...results];
  return {
    from(table: string) {
      calls.push(`from ${table}`);
      const result = queue.shift() ?? { data: null, error: null };
      const chain: Record<string, unknown> = {};
      for (const name of ["select", "eq", "ilike", "not", "order", "limit"]) {
        chain[name] = (...args: unknown[]) => {
          if (name === "eq" || name === "ilike" || (name === "select" && table === "public_cards")) calls.push(`${name} ${args.join(" ")}`);
          return chain;
        };
      }
      chain.maybeSingle = async () => result;
      chain.returns = async () => result;
      return chain;
    },
  } as unknown as SupabaseClient;
}

describe("readFounderPickup", () => {
  it("reads his public Jordan Love cards, public columns only", async () => {
    const calls: string[] = [];
    const pickup = await readFounderPickup(fakeClient([{ data: profile, error: null }, { data: [card], error: null }], calls));
    assert.deepEqual(pickup, { player: "Fixture Jordan Love", grader: "PSA", grade: "10", photoUrl: `${PHOTOS}/f1/love.jpg` });
    assert.deepEqual(calls, [
      "from profiles",
      "eq username donnietaz",
      "from public_cards",
      `select ${FOUNDER_PICKUP_SELECT}`,
      "eq user_id f1",
      "ilike player %Jordan Love%",
    ]);
    assert.doesNotMatch(FOUNDER_PICKUP_SELECT, /\bid\b|value|cert|paid|purchase|notes/);
  });

  it("is null without the founder or the card", async () => {
    assert.equal(await readFounderPickup(fakeClient([{ data: null, error: null }])), null);
    assert.equal(await readFounderPickup(fakeClient([{ data: profile, error: null }, { data: [{ ...card, grade: "9" }], error: null }])), null);
    assert.equal(await readFounderPickup(fakeClient([{ data: profile, error: null }, { data: [], error: null }])), null);
  });

  it("throws on a read error, so the hour cache keeps nothing", async () => {
    await assert.rejects(readFounderPickup(fakeClient([{ data: null, error: { message: "timeout" } }])), /timeout/);
    await assert.rejects(readFounderPickup(fakeClient([{ data: profile, error: null }, { data: null, error: { message: "down" } }])), /down/);
  });
});

describe("landingFounderPickup", () => {
  it("turns any failure into the sample slab (null)", async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      assert.equal(await landingFounderPickup(async () => Promise.reject(new Error("down"))), null);
    } finally {
      console.warn = warn;
    }
    assert.equal(await landingFounderPickup(async () => null), null);
  });

  it("is cached for an hour, reads public_cards only and never calls Trawl", () => {
    const source = readFileSync(join(process.cwd(), "lib/landing/founder-pickup-load.ts"), "utf8");
    assert.match(source, /unstable_cache\(loadFounderPickup, \["landing-founder-pickup"\], \{ revalidate: 3600 \}\)/);
    assert.match(source, /from\("public_cards"\)/);
    assert.match(source, /anonClient, readFounderProfile/);
    assert.doesNotMatch(source, /from\("cards"\)|lib\/comps|fetchTrawl|createSupabaseAdmin/);
  });

  it("is read by / and /welcome and handed to the landing", () => {
    for (const page of ["app/(app)/page.tsx", "app/welcome/page.tsx"]) {
      const source = readFileSync(join(process.cwd(), page), "utf8");
      assert.match(source, /landingFounderPickup\(\)/, page);
      assert.match(source, /<LandingCompProvider comp=\{comp\} pickup=\{pickup\}>/, page);
    }
  });
});

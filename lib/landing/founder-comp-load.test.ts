import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicCardComps } from "@/lib/comps/public-types";
import "@/lib/test/image-env";
import { landingCompDemo, landingFounderComp, readFounderComp } from "@/lib/landing/founder-comp-load";

type Result = { data: unknown; error: { message: string } | null };

const PHOTOS = "https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/card-photos";
const NOW = Date.parse("2026-11-05T12:00:00Z");
const profile = { id: "f1", username: "donnietaz", display_name: "Donnie", avatar_url: null };
const card = {
  id: "c1",
  user_id: "f1",
  player: "Fixture Maxey",
  year: 2021,
  year_label: "2021",
  set: "Optic",
  set_name: "Donruss Optic",
  parallel: "Downtown",
  grade: "10",
  grader: "PSA",
  grade_qualifier: null,
  condition_type: "graded",
  estimated_value: 300,
  image_url: `${PHOTOS}/f1/maxey.jpg`,
  created_at: "2026-10-01T00:00:00Z",
};

/** Each from() answers with the next queued result and records its table and filters. */
function fakeClient(results: Result[], calls: string[] = []): SupabaseClient {
  const queue = [...results];
  return {
    from(table: string) {
      calls.push(`from ${table}`);
      const result = queue.shift() ?? { data: null, error: null };
      const chain: Record<string, unknown> = {};
      for (const name of ["select", "eq", "ilike", "not", "order", "limit"]) {
        chain[name] = (...args: unknown[]) => {
          if (name === "eq" || name === "ilike") calls.push(`${name} ${args.join(" ")}`);
          return chain;
        };
      }
      chain.maybeSingle = async () => result;
      chain.returns = async () => result;
      return chain;
    },
  } as unknown as SupabaseClient;
}

function comps(overrides: Partial<PublicCardComps> = {}): PublicCardComps {
  return {
    sales: ["2026-11-03", "2026-11-01", "2026-10-28"].map((soldAt, index) => ({
      priceCents: 30000 + index * 100,
      soldAt,
      grade: "PSA 10",
      source: "Recent sold",
    })),
    medianCents: 30100,
    p25Cents: 30000,
    p75Cents: 30200,
    nSales: 3,
    matchedAt: null,
    status: "ok",
    ...overrides,
  };
}

describe("readFounderComp", () => {
  it("reads his public Maxey cards and the comps for the one picked", async () => {
    const calls: string[] = [];
    const asked: string[] = [];
    const comp = await readFounderComp(
      fakeClient([{ data: profile, error: null }, { data: [card], error: null }], calls),
      async (id) => {
        asked.push(id);
        return comps();
      },
      NOW,
    );
    assert.deepEqual(asked, ["c1"]);
    assert.equal(comp?.player, "Fixture Maxey");
    assert.equal(comp?.count, 3);
    assert.deepEqual(calls, ["from profiles", "eq username donnietaz", "from public_cards", "eq user_id f1", "ilike player %Maxey%"]);
  });

  it("is null without the founder, the card, or enough sales", async () => {
    const never = async () => assert.fail("no comps read without a card");
    assert.equal(await readFounderComp(fakeClient([{ data: null, error: null }]), never), null);
    assert.equal(
      await readFounderComp(fakeClient([{ data: profile, error: null }, { data: [{ ...card, parallel: "Holo" }], error: null }]), never),
      null,
    );
    assert.equal(
      await readFounderComp(
        fakeClient([{ data: profile, error: null }, { data: [card], error: null }]),
        async () => comps({ nSales: 2 }),
        NOW,
      ),
      null,
    );
  });

  it("throws on a read error, so the hour cache keeps nothing", async () => {
    await assert.rejects(readFounderComp(fakeClient([{ data: null, error: { message: "timeout" } }]), async () => comps()), /timeout/);
    await assert.rejects(
      readFounderComp(fakeClient([{ data: profile, error: null }, { data: null, error: { message: "down" } }]), async () => comps()),
      /down/,
    );
    await assert.rejects(
      readFounderComp(fakeClient([{ data: profile, error: null }, { data: [card], error: null }]), async () => comps({ status: "unavailable" })),
      /failed/,
    );
  });
});

describe("landingFounderComp", () => {
  it("turns any failure into the sample (null)", async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      assert.equal(await landingFounderComp(async () => Promise.reject(new Error("down"))), null);
    } finally {
      console.warn = warn;
    }
  });

  it("hands the demo the optimizer's src and srcset, or null for the sample", async () => {
    const comp = await readFounderComp(
      fakeClient([{ data: profile, error: null }, { data: [card], error: null }]),
      async () => comps(),
      NOW,
    );
    const demo = await landingCompDemo(async () => comp);
    assert.ok(demo);
    assert.match(decodeURIComponent(demo.photo.src), /^\/_next\/image\?url=https:\/\/knuwflptobyutrauxblj\.supabase\.co\/.+\/card-photos\/f1\/maxey\.jpg&w=/);
    assert.match(demo.photo.srcSet ?? "", / 2x$/);
    assert.equal(demo.real, true);
    assert.doesNotMatch(JSON.stringify(demo), /donnietaz/);
    assert.equal(await landingCompDemo(async () => null), null);
  });

  it("is cached for an hour and reads the card the way the hero does", () => {
    const source = readFileSync(join(process.cwd(), "lib/landing/founder-comp-load.ts"), "utf8");
    assert.match(source, /unstable_cache\(loadFounderComp, \["landing-founder-comp"\], \{ revalidate: 3600 \}\)/);
    assert.match(source, /from\("public_cards"\)/);
    assert.doesNotMatch(source, /from\("cards"\)|lib\/comps\/(trawl|index)|fetchTrawl/);
  });
});

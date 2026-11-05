import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PublicCardComps } from "@/lib/comps/public-types";
import {
  FOUNDER_COMP_SALES,
  compDemoFromFounder,
  founderComp,
  pickFounderCompCard,
  type FounderCompRow,
} from "@/lib/landing/founder-comp";

const PHOTOS = "https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/card-photos";
const FOUNDER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const NOW = Date.parse("2026-11-05T12:00:00Z");

const profile = { id: FOUNDER_ID, username: "donnietaz", display_name: "Donnie", avatar_url: null };

function row(overrides: Partial<FounderCompRow> = {}): FounderCompRow {
  return {
    id: "c1",
    user_id: FOUNDER_ID,
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
    image_url: `${PHOTOS}/${FOUNDER_ID}/maxey.jpg`,
    created_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

function comps(overrides: Partial<PublicCardComps> = {}): PublicCardComps {
  return {
    sales: [
      { priceCents: 31000, soldAt: "2026-11-03", grade: "PSA 10", source: "Recent sold" },
      { priceCents: 29950, soldAt: "2026-11-01", grade: "PSA 10", source: "Recent sold" },
      { priceCents: 28500, soldAt: "2026-10-28", grade: "PSA 10", source: "Recent sold" },
      { priceCents: 30500, soldAt: "2026-10-25", grade: "PSA 10", source: "Recent sold" },
    ],
    medianCents: 30000,
    p25Cents: 29000,
    p75Cents: 30800,
    nSales: 9,
    matchedAt: "2026-11-04T00:00:00Z",
    status: "ok",
    ...overrides,
  };
}

describe("pickFounderCompCard", () => {
  it("picks the founder's Maxey Downtown with a photo, graded first", () => {
    const raw = row({ id: "raw", condition_type: "raw", grader: null, grade: null, estimated_value: 900 });
    const graded = row({ id: "graded" });
    assert.equal(pickFounderCompCard(profile, [raw, graded])?.id, "graded");
  });

  it("matches Downtown in the set name or the parallel, any case", () => {
    const inSet = row({ id: "set", set_name: "Donruss Optic DOWNTOWN", parallel: null });
    assert.equal(pickFounderCompCard(profile, [inSet])?.id, "set");
  });

  it("skips other owners, other cards, and cards without a stored photo", () => {
    const rows = [
      row({ id: "other", user_id: OTHER_ID }),
      row({ id: "no-downtown", parallel: "Holo" }),
      row({ id: "no-maxey", player: "Fixture Embiid" }),
      row({ id: "no-photo", image_url: null }),
      row({ id: "outside", image_url: "https://example.com/maxey.jpg" }),
    ];
    assert.equal(pickFounderCompCard(profile, rows), null);
    assert.equal(pickFounderCompCard(null, [row()]), null);
  });
});

describe("founderComp", () => {
  it("keeps the public label fields, the photo and the prices only", () => {
    const comp = founderComp(profile, row(), comps(), NOW);
    assert.ok(comp);
    assert.deepEqual(comp, {
      owner: "donnietaz",
      player: "Fixture Maxey",
      year: "2021",
      set: "Donruss Optic Downtown",
      grade: "PSA 10",
      photoUrl: `${PHOTOS}/${FOUNDER_ID}/maxey.jpg`,
      sales: [
        { price: 310, when: "2d ago" },
        { price: 299.5, when: "4d ago" },
        { price: 285, when: "8d ago" },
        { price: 305, when: "11d ago" },
      ],
      median: 300,
      p25: 290,
      p75: 308,
      count: 9,
    });
    const text = JSON.stringify(comp);
    assert.doesNotMatch(text, /user_id|estimated_value|c1|cert|matchedAt|Recent sold/);
  });

  it("shows at most five sales", () => {
    const many = Array.from({ length: 8 }, (_, index) => ({
      priceCents: 30000 + index,
      soldAt: "2026-11-01",
      grade: "PSA 10",
      source: "Recent sold",
    }));
    assert.equal(founderComp(profile, row(), comps({ sales: many }), NOW)?.sales.length, FOUNDER_COMP_SALES);
  });

  it("says sold today for a sale from today", () => {
    const sales = comps().sales.map((sale, index) => (index ? sale : { ...sale, soldAt: "2026-11-05" }));
    assert.equal(founderComp(profile, row(), comps({ sales }), NOW)?.sales[0].when, "today");
  });

  it("is null with fewer than 3 sales, no stats, or comps that aren't real", () => {
    assert.equal(founderComp(profile, row(), comps({ nSales: 2 }), NOW), null);
    assert.equal(founderComp(profile, row(), comps({ sales: comps().sales.slice(0, 2) }), NOW), null);
    assert.equal(founderComp(profile, row(), comps({ medianCents: null }), NOW), null);
    assert.equal(founderComp(profile, row(), comps({ p25Cents: null }), NOW), null);
    for (const status of ["no_sales", "stale", "unavailable", "sample", "hidden"] as const) {
      assert.equal(founderComp(profile, row(), comps({ status }), NOW), null, status);
    }
    assert.equal(founderComp(profile, row({ image_url: null }), comps(), NOW), null);
    assert.equal(founderComp(null, row(), comps(), NOW), null);
  });
});

describe("compDemoFromFounder", () => {
  it("draws the real card: query, line, photo, stats and the real sale count", () => {
    const comp = founderComp(profile, row(), comps(), NOW)!;
    const demo = compDemoFromFounder(comp, { src: "/_next/image?a", srcSet: "x 1x", sizes: "112px" });
    assert.equal(demo.query, "Fixture Maxey 2021 Donruss Optic Downtown PSA 10");
    assert.equal(demo.label, "Fixture Maxey · 2021 Donruss Optic Downtown · PSA 10");
    assert.equal(demo.alt, "Fixture Maxey, 2021 Donruss Optic Downtown, PSA 10");
    assert.equal(demo.owner, "donnietaz");
    assert.equal(demo.basis, "Based on 9 sales");
    assert.deepEqual(demo.photo, { src: "/_next/image?a", srcSet: "x 1x", sizes: "112px" });
    assert.deepEqual(demo.stats, { median: 300, p25: 290, p75: 308, min: 285, max: 310, count: 9 });
  });

  it("leaves out a Base parallel and one already in the set name", () => {
    const base = founderComp(profile, row({ set_name: "Donruss Optic Downtown", parallel: "Base" }), comps(), NOW)!;
    assert.equal(compDemoFromFounder(base, { src: "x" }).query, "Fixture Maxey 2021 Donruss Optic Downtown PSA 10");
    const same = founderComp(profile, row({ set_name: "Optic Downtown", parallel: "downtown" }), comps(), NOW)!;
    assert.equal(compDemoFromFounder(same, { src: "x" }).query, "Fixture Maxey 2021 Optic Downtown PSA 10");
  });
});

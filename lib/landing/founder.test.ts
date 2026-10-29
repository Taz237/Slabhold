import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  FOUNDER_CARD_LIMIT,
  FOUNDER_USERNAME,
  founderShowcase,
  type FounderCardRow,
} from "@/lib/landing/founder";

const PHOTOS = "https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/card-photos";
const FOUNDER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

function row(overrides: Partial<FounderCardRow> = {}): FounderCardRow {
  return {
    id: "c1",
    user_id: FOUNDER_ID,
    player: "Sample Player",
    year: 2023,
    year_label: "2023",
    set: "Prizm",
    set_name: "Prizm",
    grade: "10",
    grader: "PSA",
    grade_qualifier: null,
    condition_type: "graded",
    estimated_value: 100,
    image_url: `${PHOTOS}/${FOUNDER_ID}/a.jpg`,
    accent: "#7c5cff",
    created_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

const profile = {
  id: FOUNDER_ID,
  username: "donnietaz",
  display_name: "Donnie",
  avatar_url: "https://example.com/a.png",
};

describe("founder showcase", () => {
  it("is the @donnietaz account", () => {
    assert.equal(FOUNDER_USERNAME, "donnietaz");
    assert.equal(FOUNDER_CARD_LIMIT, 3);
  });

  it("picks the 3 most valuable cards with photos, newest breaking ties", () => {
    const showcase = founderShowcase(profile, [
      row({ id: "low", estimated_value: 10, image_url: `${PHOTOS}/x/low.jpg` }),
      row({ id: "top", estimated_value: 900, image_url: `${PHOTOS}/x/top.jpg` }),
      row({ id: "tie-old", estimated_value: 50, created_at: "2026-01-01T00:00:00Z", image_url: `${PHOTOS}/x/o.jpg` }),
      row({ id: "tie-new", estimated_value: 50, created_at: "2026-09-01T00:00:00Z", image_url: `${PHOTOS}/x/n.jpg` }),
    ]);
    assert.deepEqual(
      showcase.cards.map((card) => card.id),
      ["top", "tie-new", "tie-old"],
    );
  });

  it("never shows another collector's card, a card with no photo, or a photo outside our storage", () => {
    const showcase = founderShowcase(profile, [
      row({ id: "other", user_id: OTHER_ID, estimated_value: 5000 }),
      row({ id: "none", image_url: null }),
      row({ id: "offsite", image_url: "https://evil.example/x.jpg" }),
      row({ id: "query", image_url: `${PHOTOS}/x/a.jpg?token=1` }),
      row({ id: "ok" }),
    ]);
    assert.deepEqual(showcase.cards.map((card) => card.id), ["ok"]);
  });

  it("keeps the same photo once", () => {
    const showcase = founderShowcase(profile, [row({ id: "a" }), row({ id: "b" })]);
    assert.equal(showcase.cards.length, 1);
  });

  it("sends slab label fields only: no cert, price, or owner id", () => {
    const [card] = founderShowcase(profile, [row({ grade_qualifier: "OC" })]).cards;
    assert.deepEqual(card, {
      id: "c1",
      photoUrl: `${PHOTOS}/${FOUNDER_ID}/a.jpg`,
      playerName: "Sample Player",
      year: 2023,
      yearLabel: "2023",
      setBrand: "Prizm",
      grade: "PSA 10",
      gradeQualifier: "OC",
      certNumber: "",
      accent: "#7c5cff",
      conditionType: "graded",
      grader: "PSA",
    });
    assert.equal(JSON.stringify(card).includes(FOUNDER_ID + '"'), false);
    assert.equal("estimated_value" in card, false);
  });

  it("carries the profile, and nothing when the profile is missing", () => {
    const showcase = founderShowcase(profile, [row()]);
    assert.deepEqual(showcase.profile, {
      username: "donnietaz",
      displayName: "Donnie",
      avatarUrl: "https://example.com/a.png",
    });
    assert.deepEqual(founderShowcase(null, [row()]), { profile: null, cards: [] });
  });

  it("drops an avatar that isn't https and falls back to the handle for a blank name", () => {
    const showcase = founderShowcase({ ...profile, display_name: "  ", avatar_url: "javascript:alert(1)" }, []);
    assert.deepEqual(showcase.profile, { username: "donnietaz", displayName: "donnietaz", avatarUrl: null });
  });

  it("reads public_cards with the anon client and caches for an hour", () => {
    const load = readFileSync(join(process.cwd(), "lib/landing/founder-load.ts"), "utf8");
    assert.match(load, /from\("public_cards"\)/);
    assert.doesNotMatch(load, /from\("cards"\)/);
    assert.doesNotMatch(load, /createSupabaseAdmin|SERVICE_ROLE/);
    assert.match(load, /\.eq\("user_id", /);
    const route = readFileSync(join(process.cwd(), "app/api/landing/founder/route.ts"), "utf8");
    assert.match(route, /export const revalidate = 3600/);
    const response = readFileSync(join(process.cwd(), "lib/landing/founder-response.ts"), "utf8");
    assert.match(response, /s-maxage=3600/);
  });
});

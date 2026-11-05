import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { founderPickup, type FounderPickupRow } from "@/lib/landing/founder-pickup";

const PHOTOS = "https://knuwflptobyutrauxblj.supabase.co/storage/v1/object/public/card-photos";
const profile = { id: "f1", username: "donnietaz", display_name: "Donnie", avatar_url: null };

function row(overrides: Partial<FounderPickupRow> = {}): FounderPickupRow {
  return {
    user_id: "f1",
    player: "Fixture Jordan Love",
    year: 2020,
    year_label: null,
    set: "Prizm",
    set_name: "Panini Prizm",
    parallel: "Silver",
    grade: "10",
    grader: "PSA",
    condition_type: "graded",
    image_url: `${PHOTOS}/f1/love.jpg`,
    created_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

describe("founderPickup", () => {
  it("picks his Jordan Love PSA 10 with a photo and hands over only public fields", () => {
    const pickup = founderPickup(profile, [row()]);
    assert.deepEqual(pickup, {
      player: "Fixture Jordan Love",
      year: "2020",
      set: "Panini Prizm Silver",
      grader: "PSA",
      grade: "10",
      photoUrl: `${PHOTOS}/f1/love.jpg`,
    });
    assert.deepEqual(Object.keys(pickup!).sort(), ["grade", "grader", "photoUrl", "player", "set", "year"]);
  });

  it("builds year and set like the Quick Comp card: label year first, base or repeated parallels left out", () => {
    assert.equal(founderPickup(profile, [row({ year_label: "2020-21" })])?.year, "2020-21");
    assert.equal(founderPickup(profile, [row({ parallel: "Base" })])?.set, "Panini Prizm");
    assert.equal(founderPickup(profile, [row({ parallel: "Prizm" })])?.set, "Panini Prizm");
    assert.equal(founderPickup(profile, [row({ set_name: null })])?.set, "Prizm Silver");
  });

  it("leaves year and set empty when missing", () => {
    const pickup = founderPickup(profile, [row({ year: null, year_label: null, set: null, set_name: null, parallel: null })]);
    assert.equal(pickup?.year, "");
    assert.equal(pickup?.set, "");
  });

  it("reads the grade the way the slab label does, whatever case the name is", () => {
    const pickup = founderPickup(profile, [row({ player: "JORDAN LOVE", grade: "PSA 10", grader: null, condition_type: null })]);
    assert.equal(pickup?.player, "JORDAN LOVE");
    assert.equal(pickup?.grade, "10");
  });

  it("takes the newest match", () => {
    const pickup = founderPickup(profile, [
      row({ image_url: `${PHOTOS}/f1/old.jpg`, created_at: "2025-01-01T00:00:00Z" }),
      row({ image_url: `${PHOTOS}/f1/new.jpg`, created_at: "2026-11-01T00:00:00Z" }),
    ]);
    assert.equal(pickup?.photoUrl, `${PHOTOS}/f1/new.jpg`);
  });

  it("is null without the founder, a PSA 10, his own row, the player or a stored photo", () => {
    assert.equal(founderPickup(null, [row()]), null);
    assert.equal(founderPickup(profile, []), null);
    assert.equal(founderPickup(profile, [row({ grade: "9" })]), null);
    assert.equal(founderPickup(profile, [row({ grader: "BGS" })]), null);
    assert.equal(founderPickup(profile, [row({ grade: null, grader: null, condition_type: "raw" })]), null);
    assert.equal(founderPickup(profile, [row({ user_id: "someone" })]), null);
    assert.equal(founderPickup(profile, [row({ player: "Fixture Maxey" })]), null);
    assert.equal(founderPickup(profile, [row({ image_url: null })]), null);
    assert.equal(founderPickup(profile, [row({ image_url: "https://example.com/love.jpg" })]), null);
  });
});

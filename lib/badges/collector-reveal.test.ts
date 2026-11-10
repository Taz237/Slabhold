import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BADGE_THRESHOLDS, CATEGORY_COPY } from "@/lib/badges/config";
import { COLLECTOR_BRONZE, collectorReveal, collectorRevealCopy } from "@/lib/badges/collector-reveal";

describe("Added reveal: Collector progress", () => {
  it("uses the badge's own threshold and rule", () => {
    assert.equal(COLLECTOR_BRONZE, BADGE_THRESHOLDS.collector[0]);
    assert.equal(COLLECTOR_BRONZE, 10);
    assert.equal(CATEGORY_COPY.collector.rule, "Cards added with a real photo");
  });

  it("counts a new photo card: 4 of 10", () => {
    assert.deepEqual(collectorRevealCopy({ count: 4, counted: true, hasPhoto: true }), {
      kind: "progress",
      text: "Collector: 4 of 10 photo cards to Bronze.",
    });
  });

  it("does not pretend a card with no photo counted", () => {
    const copy = collectorRevealCopy({ count: 3, counted: false, hasPhoto: false });
    assert.equal(copy.kind, "needs_photo");
    assert.match(copy.text, /^Collector: 3 of 10 photo cards to Bronze\./);
    assert.match(copy.text, /This one needs a photo to count\./);
  });

  it("says 9 of 10, then celebrates Bronze at 10", () => {
    assert.equal(collectorRevealCopy({ count: 9, counted: true, hasPhoto: true }).text, "Collector: 9 of 10 photo cards to Bronze.");
    const earned = collectorRevealCopy({ count: 10, counted: true, hasPhoto: true });
    assert.equal(earned.kind, "earned");
    assert.equal(earned.text, "You earned Bronze Collector: 10 cards with a photo.");
  });

  it("past Bronze, uses the existing progress line", () => {
    assert.equal(
      collectorRevealCopy({ count: 12, counted: true, hasPhoto: true }).text,
      "Collector: 12 / 25 cards to Silver.",
    );
    assert.equal(collectorRevealCopy({ count: 10, counted: false, hasPhoto: true }).kind, "progress");
  });

  it("counts from the cards in memory with the badge's real-photo rule", () => {
    const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co";
    try {
      const userId = "user-1";
      const photo = (n: number) =>
        `https://fixture.supabase.co/storage/v1/object/public/card-photos/${userId}/card-${n}.jpg`;
      const card = (n: number, withPhoto: boolean, day: number) => ({
        id: `card-${n}`,
        playerName: `Fixture Player ${n}`,
        year: 2024,
        setBrand: "Panini Prizm",
        parallel: "Base",
        photoDataUrl: withPhoto ? photo(n) : null,
        createdAt: `2026-10-${String(day).padStart(2, "0")}T12:00:00.000Z`,
      });
      const three = [card(1, true, 1), card(2, true, 2), card(3, true, 3)];
      const withPhoto = collectorReveal([...three, card(4, true, 4)], "card-4", userId, new Date("2026-11-10T00:00:00Z"));
      assert.deepEqual(withPhoto, { count: 4, counted: true, hasPhoto: true });
      const noPhoto = collectorReveal([...three, card(5, false, 5)], "card-5", userId, new Date("2026-11-10T00:00:00Z"));
      assert.deepEqual(noPhoto, { count: 3, counted: false, hasPhoto: false });
      // A data URL is not a stored photo, so it does not count yet.
      const local = collectorReveal(
        [{ ...card(6, false, 6), photoDataUrl: "data:image/jpeg;base64,AAAA" }],
        "card-6",
        userId,
        new Date("2026-11-10T00:00:00Z"),
      );
      assert.equal(local.counted, false);
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
    }
  });
});

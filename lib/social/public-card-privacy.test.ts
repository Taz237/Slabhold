import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapPublicCard } from "@/lib/social/cards";

describe("mapPublicCard privacy", () => {
  it("never exposes paid price even if a row somehow includes it", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000001",
      user_id: "user-1",
      player: "Victor Wembanyama",
      year: 2023,
      set: "Panini Prizm",
      grade: "PSA 10",
      parallel: "Base",
      estimated_value: 250,
      image_url: null,
      card_number: "136",
      sport: "Basketball",
      accent: "#7c5cff",
      year_label: "2023-24",
      set_name: "Panini Prizm",
      // Sensitive fields must not leak through the mapper
      paid_price: 999,
      purchase_date: "2024-01-01",
      notes: "secret",
      cert_number: "CERT-123",
    };
    const card = mapPublicCard(row);
    assert.equal(card.purchasePrice, null);
    assert.equal(card.estimatedSellPrice, 250);
    assert.equal(card.cardNumber, "136");
    assert.ok(!("notes" in card));
    assert.ok(!("certNumber" in card));
  });
});

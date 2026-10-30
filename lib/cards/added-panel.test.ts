import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  addedCardPath,
  addedCollectionLine,
  addedValueLine,
  isAddedParam,
  showAddedPanel,
} from "@/lib/cards/added-panel";
import { cardDatesLine } from "@/lib/format";
import type { SportsCard } from "@/lib/types";
import type { CardValueResult } from "@/lib/value/types";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function value(patch: Partial<CardValueResult>): CardValueResult {
  return {
    status: "ok",
    median: 42,
    low: 30,
    high: 50,
    nSales: 6,
    matchedAt: null,
    ...patch,
  };
}

function card(id: string, patch: Partial<SportsCard> = {}): SportsCard {
  return {
    id,
    playerName: "Fixture Player",
    year: 2024,
    yearLabel: "2024",
    setBrand: "Panini Prizm",
    cardNumber: "1",
    grade: "Raw",
    parallel: "Base",
    sport: "Basketball",
    purchasePrice: null,
    purchaseDate: "",
    estimatedSellPrice: 0,
    sellPrice: null,
    sellDate: null,
    notes: "",
    photoDataUrl: null,
    accent: "violet",
    createdAt: "2026-10-28T00:00:00.000Z",
    ...patch,
  } as SportsCard;
}

describe("after Add", () => {
  it("opens the card with added=1", () => {
    assert.equal(addedCardPath("abc-123"), "/cards/abc-123?added=1");
    const form = read("components/card-form.tsx");
    assert.match(form, /router\.push\(existing \? `\/cards\/\$\{card\.id\}` : addedCardPath\(card\.id\)\)/);
  });

  it("reads only added=1", () => {
    assert.equal(isAddedParam("1"), true);
    assert.equal(isAddedParam(["1"]), true);
    assert.equal(isAddedParam("0"), false);
    assert.equal(isAddedParam(undefined), false);
  });

  it("shows the panel only for the owner, once", () => {
    assert.equal(showAddedPanel({ added: true, owned: true, dismissed: false }), true);
    assert.equal(showAddedPanel({ added: true, owned: false, dismissed: false }), false);
    assert.equal(showAddedPanel({ added: false, owned: true, dismissed: false }), false);
    assert.equal(showAddedPanel({ added: true, owned: true, dismissed: true }), false);
  });

  it("drops added=1 from the URL after the first render", () => {
    const detail = read("components/card-detail.tsx");
    // replaceState is wired into the Next router and does not refetch or remount the page,
    // so the panel stays up while a refresh no longer shows it.
    assert.match(detail, /window\.history\.replaceState\(null, "", pathname\)/);
    assert.match(detail, /showAddedPanel\(/);
    const page = read("app/(app)/cards/[id]/page.tsx");
    assert.match(page, /isAddedParam\(/);
  });
});

describe("added value line", () => {
  it("names the value and sale count when sales are in", () => {
    assert.deepEqual(addedValueLine(value({}), false), {
      kind: "ok",
      text: "Worth about $42.00 based on 6 recent sales.",
    });
    assert.equal(addedValueLine(value({ nSales: 1 }), false).text, "Worth about $42.00 based on 1 recent sale.");
  });

  it("waits while the value is loading or pending", () => {
    assert.deepEqual(addedValueLine(null, true), { kind: "pending", text: "Finding recent sales…" });
    assert.deepEqual(addedValueLine(null, false), { kind: "pending", text: "Finding recent sales…" });
    assert.equal(addedValueLine(value({ status: "unavailable", median: null, nSales: 0 }), false).kind, "pending");
    // A value that arrives later replaces the pending line.
    assert.equal(addedValueLine(value({}), true).kind, "ok");
  });

  it("explains a card with no sales yet", () => {
    assert.deepEqual(addedValueLine(value({ status: "no_sales", median: null, nSales: 0 }), false), {
      kind: "no_sales",
      text: "No recent sales found yet. We'll keep checking daily.",
    });
  });
});

describe("added collection line", () => {
  it("counts cards and sums known values like the collection header", () => {
    const cards = [card("a"), card("b"), card("c")];
    const values = new Map<string, CardValueResult>([
      ["a", value({ median: 40 })],
      ["b", value({ median: 10.5 })],
      ["c", value({ status: "no_sales", median: null, nSales: 0 })],
    ]);
    assert.equal(addedCollectionLine(cards, values, true), "Your collection: 3 cards, about $50.50");
  });

  it("shows the count only when the total is unknown", () => {
    const cards = [card("a")];
    assert.equal(addedCollectionLine(cards, new Map(), true), "Your collection: 1 card");
    assert.equal(
      addedCollectionLine(cards, new Map([["a", value({})]]), false),
      "Your collection: 1 card",
    );
  });
});

describe("card dates line", () => {
  it("skips Bought when there is no date", () => {
    assert.equal(cardDatesLine({ purchaseDate: "", sold: false, soldDate: "" }), "Still held");
    assert.equal(cardDatesLine({ purchaseDate: null, sold: true, soldDate: "2026-10-02" }), "Sold Oct 2, 2026");
  });

  it("keeps Bought when there is a date", () => {
    assert.equal(
      cardDatesLine({ purchaseDate: "2026-10-01", sold: false, soldDate: "" }),
      "Bought Oct 1, 2026 · Still held",
    );
    assert.equal(
      cardDatesLine({ purchaseDate: "2026-10-01", sold: true, soldDate: "2026-10-02" }),
      "Bought Oct 1, 2026 · Sold Oct 2, 2026",
    );
    assert.match(read("components/card-detail.tsx"), /cardDatesLine\(/);
  });
});

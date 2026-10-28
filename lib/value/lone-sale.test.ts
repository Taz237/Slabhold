import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { addedCollectionLine, addedValueLine } from "@/lib/cards/added-panel";
import { displayedCollectionTotal } from "@/lib/collection/displayed-value";
import { mapPublicCard } from "@/lib/social/cards";
import type { SportsCard } from "@/lib/types";
import { shownCardValue } from "@/lib/value/format";
import {
  PREMIUM_SINGLE_SALE_FLOOR,
  resolvePriceRead,
  singleSaleTrusted,
  tilePriceText,
} from "@/lib/value/price-fallback";
import type { CardValueResult } from "@/lib/value/types";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function card(patch: Partial<SportsCard> = {}): SportsCard {
  return {
    id: "fixture-1",
    playerName: "Fixture Player",
    year: 2024,
    yearLabel: "2024",
    setBrand: "Panini Prizm",
    setIsCustom: false,
    cardNumber: "SS-FP",
    noNumber: false,
    grade: "Raw",
    parallel: "Red",
    parallelIsCustom: false,
    serialRun: null,
    serialNo: null,
    isRookie: false,
    isAuto: false,
    isRelic: false,
    conditionType: "raw",
    gradeQualifier: "",
    certNumber: "",
    sport: "Basketball",
    purchasePrice: null,
    purchaseDate: "2024-01-01",
    estimatedSellPrice: 0,
    sellPrice: null,
    sellDate: null,
    notes: "",
    photoDataUrl: null,
    accent: "#7c5cff",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...patch,
  };
}

const autoRed99 = card({ isAuto: true, serialRun: 99 });
const base = card({ id: "fixture-2", parallel: "Base" });

function lone(price: number): CardValueResult {
  return {
    status: "ok",
    median: price,
    low: price,
    high: price,
    nSales: 1,
    matchedAt: null,
    sales: [{ price, soldAt: "2026-09-30T18:00:00Z" }],
  };
}

function three(prices: number[]): CardValueResult {
  const sorted = [...prices].sort((a, b) => a - b);
  return {
    status: "ok",
    median: sorted[1],
    low: sorted[0],
    high: sorted[2],
    nSales: 3,
    matchedAt: null,
  };
}

describe("singleSaleTrusted", () => {
  it("starts the premium floor at $10", () => {
    assert.equal(PREMIUM_SINGLE_SALE_FLOOR, 10);
  });

  it("holds back a lone $1.99 sale on an auto /99", () => {
    assert.equal(singleSaleTrusted(autoRed99, lone(1.99)), false);
    assert.equal(singleSaleTrusted(autoRed99, null, [{ price: 1.99 }]), false);
  });

  it("treats any auto, a /99 or lower, and a 1/1 as premium", () => {
    assert.equal(singleSaleTrusted(card({ isAuto: true }), lone(1.99)), false);
    assert.equal(singleSaleTrusted(card({ serialRun: 99 }), lone(1.99)), false);
    assert.equal(singleSaleTrusted(card({ serialRun: 1 }), lone(1.99)), false);
    assert.equal(singleSaleTrusted(card({ serialRun: 199 }), lone(1.99)), true);
  });

  it("trusts a lone premium sale at or above the floor", () => {
    assert.equal(singleSaleTrusted(autoRed99, lone(45)), true);
    assert.equal(singleSaleTrusted(autoRed99, lone(PREMIUM_SINGLE_SALE_FLOOR)), true);
  });

  it("trusts a cheap lone sale on a base card", () => {
    assert.equal(singleSaleTrusted(base, lone(1.99)), true);
  });

  it("trusts more than one sale", () => {
    assert.equal(singleSaleTrusted(autoRed99, three([1.99, 40, 50])), true);
    assert.equal(
      singleSaleTrusted(autoRed99, null, [{ price: 1.99 }, { price: 40 }]),
      true,
    );
  });
});

describe("shownCardValue", () => {
  it("is null for an untrusted lone sale and for no value", () => {
    assert.equal(shownCardValue(autoRed99, lone(1.99)), null);
    assert.equal(shownCardValue(autoRed99, null), null);
    assert.equal(
      shownCardValue(autoRed99, { ...lone(5), status: "no_sales", median: null, nSales: 0 }),
      null,
    );
  });

  it("is the median otherwise", () => {
    assert.equal(shownCardValue(autoRed99, lone(45)), 45);
    assert.equal(shownCardValue(base, lone(1.99)), 1.99);
    assert.equal(shownCardValue(autoRed99, three([1.99, 40, 50])), 40);
  });
});

describe("price read with a lone sale", () => {
  it("does not show Last sold $1.99 on an auto /99", () => {
    const stored = resolvePriceRead({ value: lone(1.99), card: autoRed99 });
    assert.doesNotMatch(stored.text, /\$1\.99/);
    assert.equal(stored.kind, "none");

    const onScreen = resolvePriceRead({
      value: lone(1.99),
      exactSales: [{ price: 1.99, soldAt: "2026-09-30T18:00:00Z" }],
      card: autoRed99,
    });
    assert.doesNotMatch(onScreen.text, /\$1\.99/);

    const countOnly = resolvePriceRead({
      value: { ...lone(1.99), sales: undefined },
      card: autoRed99,
    });
    assert.doesNotMatch(countOnly.text, /\$1\.99/);
    assert.doesNotMatch(tilePriceText(countOnly), /\$1\.99/);
  });

  it("still shows a lone $45 sale on an auto /99", () => {
    const read = resolvePriceRead({ value: lone(45), card: autoRed99 });
    assert.equal(read.kind, "last_sale");
    assert.equal(read.text, "Last sold $45.00 on Sep 30");
  });

  it("still shows a lone $1.99 sale on a base card", () => {
    const read = resolvePriceRead({ value: lone(1.99), card: base });
    assert.equal(read.text, "Last sold $1.99 on Sep 30");
  });

  it("leaves three sales to the outlier filter", () => {
    const read = resolvePriceRead({ value: three([1.99, 40, 50]), card: autoRed99 });
    assert.equal(read.kind, "estimate");
    assert.equal(read.text, "$40.00");
  });
});

describe("added panel with a lone sale", () => {
  it("does not say Worth about $1.99 on an auto /99", () => {
    const line = addedValueLine(lone(1.99), false, autoRed99);
    assert.doesNotMatch(line.text, /\$1\.99/);
    assert.equal(line.text, "No recent sales found yet. We'll keep checking daily.");
  });

  it("keeps the line for a trusted lone sale", () => {
    assert.equal(
      addedValueLine(lone(45), false, autoRed99).text,
      "Worth about $45.00 based on 1 recent sale.",
    );
    assert.equal(
      addedValueLine(lone(1.99), false, base).text,
      "Worth about $1.99 based on 1 recent sale.",
    );
  });
});

describe("collection total with a lone sale", () => {
  it("leaves out an untrusted lone sale like a card with no value", () => {
    const values = new Map<string, CardValueResult>([
      [autoRed99.id, lone(1.99)],
      [base.id, lone(3)],
    ]);
    assert.equal(displayedCollectionTotal([autoRed99, base], values), 3);
    assert.equal(
      addedCollectionLine([autoRed99, base], values, true),
      "Your collection: 2 cards, about $3.00",
    );
  });

  it("only an untrusted lone sale means no total yet", () => {
    const values = new Map<string, CardValueResult>([[autoRed99.id, lone(1.99)]]);
    assert.equal(displayedCollectionTotal([autoRed99], values), 0);
    assert.equal(addedCollectionLine([autoRed99], values, true), "Your collection: 1 card");
  });
});

describe("public cards carry auto and serial run", () => {
  it("maps is_auto and serial_run from public_cards", () => {
    const mapped = mapPublicCard({
      id: "p1",
      user_id: "u1",
      player: "Fixture Player",
      year: 2024,
      set: "Panini Prizm",
      grade: "Raw",
      parallel: "Red",
      estimated_value: 0,
      image_url: null,
      card_number: "SS-FP",
      sport: "Basketball",
      accent: null,
      year_label: "2024",
      set_name: "Panini Prizm",
      grader: null,
      condition_type: "raw",
      is_auto: true,
      serial_run: 99,
    });
    assert.equal(mapped.isAuto, true);
    assert.equal(mapped.serialRun, 99);
    assert.equal(singleSaleTrusted(mapped, lone(1.99)), false);
  });
});

describe("display callers use the lone-sale guard", () => {
  it("routes the card pages through shownCardValue", () => {
    for (const path of ["components/card-detail.tsx", "components/public-card-view.tsx"]) {
      const text = source(path);
      assert.match(text, /storedAmount = shownCardValue\(card, shownValue\)/, path);
    }
  });

  it("passes the card to the added panel line", () => {
    assert.match(source("components/card-added-panel.tsx"), /addedValueLine\(value, loading, card\)/);
  });
});

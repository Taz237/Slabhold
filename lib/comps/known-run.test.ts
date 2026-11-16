import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadProductData, type ProductRecord } from "@/lib/cards/product-data";
import { knownPrintRun, withKnownRun } from "./known-run";
import type { MatchCard } from "./match";
import { sharedCompValue } from "./shared-value";
import type { TrawlSoldResult } from "./types";

const card: MatchCard = {
  playerName: "Fixture Player",
  year: 2025,
  yearLabel: "2025",
  setBrand: "Topps Chrome",
  cardNumber: "48",
  noNumber: false,
  parallel: "Gold Refractor",
  conditionType: "raw",
  grade: "Raw",
  sport: "Baseball",
};

describe("the print run a card's parallel is known to have", () => {
  it("comes from the checklist: 2025 Topps Chrome Gold Refractor is /50", async () => {
    const data = await loadProductData();
    assert.equal(knownPrintRun(data, card), 50);
    assert.equal(knownPrintRun(data, { ...card, parallel: "Gold" }), 50, "sellers' 'Gold' is the list's Gold Refractor");
    assert.equal(knownPrintRun(data, { ...card, parallel: "Orange Refractor" }), 25);
  });

  it("is none for Base, an unnumbered parallel, a parallel the list lacks, or a set with no list", async () => {
    const data = await loadProductData();
    assert.equal(knownPrintRun(data, { ...card, parallel: "Base" }), null);
    assert.equal(knownPrintRun(data, { ...card, parallel: "X-Fractor" }), null);
    assert.equal(knownPrintRun(data, { ...card, parallel: "Fixture Neon" }), null);
    assert.equal(knownPrintRun(data, { ...card, setBrand: "Fixture Set" }), null);
    assert.equal(knownPrintRun(null, card), null);
  });

  it("with no sport saved, every list for that year and set has to agree", () => {
    const two: ProductRecord[] = [
      { sport: "Baseball", yearLabel: "2025", product: "Fixture Chrome", manufacturer: "Fixture", parallels: [{ subset: "Base", name: "Gold", serialRun: 50 }] },
      { sport: "Football", yearLabel: "2025", product: "Fixture Chrome", manufacturer: "Fixture", parallels: [{ subset: "Base", name: "Gold", serialRun: 10 }] },
    ];
    const bare = { ...card, setBrand: "Fixture Chrome", parallel: "Gold", sport: undefined };
    assert.equal(knownPrintRun(two, bare), null);
    assert.equal(knownPrintRun(two, { ...bare, sport: "Football" }), 10);
    assert.equal(knownPrintRun([two[0]], bare), 50);
  });

  it("a run the owner saved always wins", async () => {
    const data = await loadProductData();
    assert.equal(withKnownRun({ ...card, serialRun: 49 }, data).serialRun, 49);
    assert.equal(withKnownRun(card, data).serialRun, 50);
    const base = { ...card, parallel: "Base" };
    assert.equal(withKnownRun(base, data), base);
  });
});

function sold(id: string, title: string): TrawlSoldResult {
  return {
    title,
    sale_price: 40,
    shipping_price: 0,
    currency: "USD",
    condition: "Ungraded",
    condition_raw: null,
    date_sold: "2026-11-10T18:00:00.000Z",
    buying_format: "Auction",
    item_id: id,
    item_link: "",
    image_url: null,
    details: { listing_state: "sold", grading: { graded: false, grader: null, grade: null, condition: null } },
  };
}

describe("a numbered parallel's sold filter", () => {
  const titles = [
    sold("fifty", "2025 Topps Chrome Fixture Player #48 Gold Refractor /50"),
    sold("numbered", "2025 Topps Chrome Fixture Player #48 Gold Refractor 12/50"),
    sold("twentyfive", "2025 Topps Chrome Fixture Player #48 Gold Refractor /25"),
    sold("bare", "2025 Topps Chrome Fixture Player #48 Gold Refractor"),
  ];

  it("before: with no run saved, every /50 sale was dropped", () => {
    assert.deepEqual(sharedCompValue(card, titles).sales.map((sale) => sale.itemId), ["bare"]);
  });

  it("now: the known /50 keeps the /50 sales only", async () => {
    const data = await loadProductData();
    assert.deepEqual(sharedCompValue(withKnownRun(card, data), titles).sales.map((sale) => sale.itemId).sort(), ["fifty", "numbered"]);
  });
});

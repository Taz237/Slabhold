import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CatalogCard } from "@/lib/card-catalog";
import { parallelsIn, type ProductRecord } from "@/lib/cards/product-data";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import { rankScanMatches, type ScanRead } from "./match";
import { readRawCardText } from "./raw-text";

/**
 * A product that prints paper and chrome cards in one box keeps a list per card-number prefix.
 * The rows below are made up for this test: they are not a real checklist.
 */
const TWO_STOCK: ProductRecord = {
  sport: "Baseball",
  yearLabel: "2024",
  product: "Bowman",
  manufacturer: "Topps",
  parallels: [
    { subset: "Base", name: "Base", serialRun: null },
    { subset: "Base", name: "Test Paper A", serialRun: 299 },
    { subset: "Paper Prospects", name: "Test Paper A", serialRun: 299, cardPrefixes: ["BP"] },
    { subset: "Paper Prospects", name: "Test Paper B", serialRun: 150, cardPrefixes: ["BP"] },
    { subset: "Paper Prospects", name: "Test Paper C", serialRun: 150, cardPrefixes: ["BP"] },
    { subset: "Chrome Prospects", name: "Test Chrome A", serialRun: 299, cardPrefixes: ["BCP"] },
    { subset: "Chrome Prospects", name: "Test Chrome B", serialRun: 150, cardPrefixes: ["BCP"] },
  ],
};

const names = (cardNumber?: string) => parallelsIn([TWO_STOCK], "Baseball", "2024", "Bowman", cardNumber).map((item) => item.name);

function card(cardNumber: string): CatalogCard {
  return { id: `miller-${cardNumber}`, playerName: "Aidan Miller", yearLabel: "2024", setBrand: "Bowman", cardNumber, sport: "Baseball", parallel: "Base", isRookie: false };
}

function raw(front: string[], back: string[]): ScanRead {
  return { kind: "raw", front: readRawCardText(front, INDEXED_DIRECTORY), back: readRawCardText(back, INDEXED_DIRECTORY) };
}

function scan(serial: string, cardNumber: string) {
  return rankScanMatches(
    raw(["1ST BOWMAN", "PHILADELPHIA PHILLIES", serial, "AIDAN MILLER"], ["AIDAN MILLER", cardNumber, "© 2024 THE TOPPS COMPANY, INC."]),
    [card(cardNumber)],
    { directory: INDEXED_DIRECTORY, products: [TWO_STOCK] },
  ).matches[0];
}

describe("checklists: a list per card-number prefix", () => {
  it("lists every parallel when no card number is given", () => {
    assert.deepEqual(names(), ["Base", "Test Paper A", "Test Paper B", "Test Paper C", "Test Chrome A", "Test Chrome B"]);
  });

  it("keeps a BP- card to the paper rows and a BCP- card to the chrome rows", () => {
    assert.deepEqual(names("BP-27"), ["Base", "Test Paper A", "Test Paper B", "Test Paper C"]);
    assert.deepEqual(names("BCP-27"), ["Base", "Test Chrome A", "Test Chrome B"]);
  });

  it("keeps a card with no listed prefix to the rows that name none", () => {
    assert.deepEqual(names("27"), ["Base", "Test Paper A"]);
  });
});

describe("scanner: the card number's prefix picks the list its print run is read against", () => {
  it("names the one paper parallel at /299 for a BP- card, not the chrome one", () => {
    const top = scan("137/299", "BP-27");
    assert.equal(top?.parallel, "Test Paper A");
    assert.equal(top?.serialRun, 299);
    assert.equal(top?.sureness.parallel, "sure");
  });

  it("names the one chrome parallel at /150 for a BCP- card", () => {
    const top = scan("088/150", "BCP-27");
    assert.equal(top?.parallel, "Test Chrome B");
    assert.equal(top?.serialRun, 150);
  });

  it("stays open with both as choices when two parallels in the same list share the run", () => {
    const top = scan("088/150", "BP-27");
    assert.equal(top?.parallel, "");
    assert.equal(top?.sureness.parallel, "unsure");
    assert.equal(top?.serialRun, 150);
    assert.deepEqual(top?.parallelOptions.map((option) => option.name), ["Test Paper B", "Test Paper C"]);
  });
});

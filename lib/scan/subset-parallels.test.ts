import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CatalogCard } from "@/lib/card-catalog";
import { loadProductData, parallelsIn, type ProductRecord } from "@/lib/cards/product-data";
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
    { subset: "Paper", name: "Test Paper A", serialRun: 299, cardPrefixes: ["", "BP"] },
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

function scan(serial: string, cardNumber: string, products: readonly ProductRecord[] = [TWO_STOCK]) {
  return rankScanMatches(
    raw(["1ST BOWMAN", "PHILADELPHIA PHILLIES", serial, "AIDAN MILLER"], ["AIDAN MILLER", cardNumber, "© 2024 THE TOPPS COMPANY, INC."]),
    [card(cardNumber)],
    { directory: INDEXED_DIRECTORY, products },
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

  it("keeps a plain number to the rows listed for no prefix", () => {
    assert.deepEqual(names("27"), ["Base", "Test Paper A"]);
  });

  it("offers a prefix no row names only the rows for every card", () => {
    assert.deepEqual(names("CPA-AM"), ["Base"]);
  });
});

describe("scanner: the card number's prefix picks the list its print run is read against", () => {
  it("names the one paper parallel at /299 for a BP- card, not the chrome one", () => {
    const top = scan("137/299", "BP-27");
    assert.equal(top?.parallel, "Test Paper A");
    assert.equal(top?.serialRun, 299);
    assert.equal(top?.sureness.parallel, "likely");
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

/** The shipped 2024 Bowman list (lib/cards/data/SOURCES.md), not the made-up rows above. */
describe("scanner: 2024 Bowman print runs", () => {
  it("reads Aidan Miller #BP-27 137/299 as Fuchsia Border, the only paper /299", async () => {
    const top = scan("137/299", "BP-27", await loadProductData());
    assert.equal(top?.playerName, "Aidan Miller");
    assert.equal(top?.cardNumber, "BP-27");
    assert.equal(top?.parallel, "Fuchsia Border");
    assert.equal(top?.serialRun, 299);
    assert.equal(top?.serialNo, "137");
    // The run alone picked it: likely until the card or a sold title names it.
    assert.equal(top?.sureness.parallel, "likely");
    assert.equal(top?.parallelSource, "run");
  });

  it("reads a Chrome Prospects BCP- card at /299 as Speckle Refractor, not the paper Fuchsia", async () => {
    const top = scan("041/299", "BCP-27", await loadProductData());
    assert.equal(top?.parallel, "Speckle Refractor");
    assert.equal(top?.serialRun, 299);
  });

  it("leaves a Chrome Prospects /150 open: Blue Refractor and Blue Shimmer Refractor share it", async () => {
    const top = scan("088/150", "BCP-27", await loadProductData());
    assert.equal(top?.parallel, "");
    assert.equal(top?.sureness.parallel, "unsure");
    assert.equal(top?.serialRun, 150);
    assert.deepEqual(top?.parallelOptions.map((option) => option.name), ["Blue Refractor", "Blue Shimmer Refractor"]);
  });

  it("leaves a paper /150 open: Blue Border and Blue Pattern share it", async () => {
    const top = scan("088/150", "BP-27", await loadProductData());
    assert.equal(top?.parallel, "");
    assert.deepEqual(top?.parallelOptions.map((option) => option.name), ["Blue Border", "Blue Pattern"]);
  });

  it("leaves a Chrome Prospects /199 open: Fuchsia and Fuchsia Lunar share it", async () => {
    const top = scan("120/199", "BCP-27", await loadProductData());
    assert.equal(top?.parallel, "");
    assert.deepEqual(top?.parallelOptions.map((option) => option.name), ["Fuchsia Refractor", "Fuchsia Lunar Refractor"]);
  });

  it("names no parallel for a card number the list has no rows for (an insert or an autograph)", async () => {
    const top = scan("12/50", "CPA-AM", await loadProductData());
    assert.equal(top?.parallel, "");
    assert.equal(top?.serialRun, 50);
  });
});

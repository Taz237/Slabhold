import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CatalogCard } from "@/lib/card-catalog";
import { sameParallelLoosely } from "@/lib/cards/parallels";
import { loadProductData, onlyParallelAtRun } from "@/lib/cards/product-data";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import type { QuickCompIdentity } from "@/lib/quick-comp/identity";
import { cleanCompFor } from "./clean-sales";
import { lookupScanComp } from "./comp-lookup";
import { lookupLiveSolds } from "./live-solds";
import { rankScanMatches, type ScanRead, type SoldTitle } from "./match";
import { readRawCardText } from "./raw-text";
import { asTrawlResults, groupFor, type ParallelGroup } from "./scan-sales";

/**
 * A parallel picked off the checklist by its print run ("Fuchsia Border", the only paper /299)
 * still prices from sold titles that call it something else ("Pink/Red", "Pink", "Fuchsia").
 * The sold titles below are made up for tests.
 */

const sale = (title: string, price: number, soldAt: string) => ({ title, price, soldAt });

const PINK_RED = [
  sale("Aidan Miller Bowman 1st Paper Pink/Red #'d 232/299 Phillies BP-27", 34.99, "2026-11-04"),
  sale("2024 Bowman 1st Aidan Miller Pink Red /299 BP-27 Phillies Prospect", 38, "2026-10-28"),
  sale("2024 Bowman Paper Prospects Aidan Miller Pink/Red 101/299 #BP-27", 36, "2026-10-20"),
];
const FUCHSIA = [
  sale("2024 Bowman 1st Aidan Miller Fuchsia /299 BP-27", 35, "2026-11-10"),
  sale("Aidan Miller 2024 Bowman Fuchsia 88/299 BP-27 Phillies", 37, "2026-11-08"),
];

function miller(parallel: string, yearLabel = "2024", grade = "Raw"): QuickCompIdentity {
  return { playerName: "Aidan Miller", year: Number(yearLabel), yearLabel, setBrand: "Bowman", cardNumber: "BP-27", parallel, grade };
}

function group(label: string, count = 1): ParallelGroup {
  return { label, sales: Array.from({ length: count }, (_, index) => ({ itemId: `${label}-${index}`, title: label, price: 10, soldAt: null, parallel: label })) };
}

const CARD: CatalogCard = { id: "miller-bp-27", playerName: "Aidan Miller", yearLabel: "2024", setBrand: "Bowman", cardNumber: "BP-27", sport: "Baseball", parallel: "Base", isRookie: false };
const FRONT = ["1ST BOWMAN", "PHILADELPHIA PHILLIES", "137/299", "AIDAN MILLER"];
const BACK = ["AIDAN MILLER", "BP-27", "© 2024 THE TOPPS COMPANY, INC."];

function read(): ScanRead {
  return { kind: "raw", front: readRawCardText(FRONT, INDEXED_DIRECTORY), back: readRawCardText(BACK, INDEXED_DIRECTORY) };
}

function titles(sales: readonly { title: string; price: number; soldAt: string }[]): SoldTitle[] {
  return sales.map((item) => ({ title: item.title, price: item.price, soldAt: item.soldAt }));
}

describe("parallel names: Border and Refractor are optional", () => {
  it("treats a title's color as the checklist name with its finish word", () => {
    assert.equal(sameParallelLoosely("Fuchsia", "Fuchsia Border"), true);
    assert.equal(sameParallelLoosely("Gold Refractor", "Gold"), true);
    assert.equal(sameParallelLoosely("Sky Blue", "Sky Blue Border"), true);
  });

  it("never drops a pattern word, and never matches a bare finish word", () => {
    assert.equal(sameParallelLoosely("Blue", "Blue Shimmer Refractor"), false);
    assert.equal(sameParallelLoosely("Blue Border", "Blue Pattern"), false);
    assert.equal(sameParallelLoosely("Refractor", "Border"), false);
    assert.equal(sameParallelLoosely("Fuchsia Border", "Pink/Red"), false);
  });

  it("finds the group for a checklist name from the color the titles use", () => {
    assert.equal(groupFor([group("Fuchsia", 2), group("Purple")], "Fuchsia Border")?.label, "Fuchsia");
    assert.equal(groupFor([group("Blue"), group("Blue Shimmer")], "Blue Refractor")?.label, "Blue");
    // An exact group wins over a loose one.
    assert.equal(groupFor([group("Gold"), group("Gold Refractor")], "Gold Refractor")?.label, "Gold Refractor");
    assert.equal(groupFor([group("Pink/Red", 3)], "Fuchsia Border"), null);
  });
});

describe("pricing a parallel the print run picked", () => {
  it("prices the run's clear majority when the titles call the parallel something else", () => {
    const results = asTrawlResults([...PINK_RED, sale("2024 Topps Aidan Miller BP-27 Pink /299", 30, "2026-10-30")]);
    const priced = cleanCompFor(miller("Fuchsia Border"), results, INDEXED_DIRECTORY, { serialRun: 299, asOf: null, source: "sold-cache", runPicked: true });
    assert.equal(priced.status, "ok");
    assert.equal(priced.status === "ok" && priced.nSales, 3);
  });

  it("does not when the run did not pick it: a parallel someone chose prices only from its own sales", () => {
    const priced = cleanCompFor(miller("Fuchsia Border"), asTrawlResults(PINK_RED), INDEXED_DIRECTORY, { serialRun: 299, asOf: null, source: "sold-cache" });
    assert.equal(priced.status, "none");
  });

  it("stays unpriced when no group is a clear majority", () => {
    const results = asTrawlResults([PINK_RED[0], FUCHSIA[0]]);
    const priced = cleanCompFor(miller("Purple Border"), results, INDEXED_DIRECTORY, { serialRun: 299, asOf: null, source: "sold-cache", runPicked: true });
    assert.equal(priced.status, "none");
  });

  it("prices 'Fuchsia' titles as Fuchsia Border without the run's help", () => {
    const priced = cleanCompFor(miller("Fuchsia Border"), asTrawlResults(FUCHSIA), INDEXED_DIRECTORY, { serialRun: 299, asOf: null, source: "sold-cache" });
    assert.equal(priced.status === "ok" && priced.nSales, 2);
  });
});

describe("the confirm sheet: a run-picked parallel", () => {
  it("is likely, not sure, when only the run picked it", async () => {
    const top = rankScanMatches(read(), [CARD], { directory: INDEXED_DIRECTORY, products: await loadProductData(), soldTitles: titles(PINK_RED) }).matches[0];
    assert.equal(top?.parallel, "Fuchsia Border");
    assert.equal(top?.sureness.parallel, "likely");
    assert.equal(top?.parallelSource, "run");
  });

  it("is sure once sold titles at that run name it", async () => {
    const top = rankScanMatches(read(), [CARD], { directory: INDEXED_DIRECTORY, products: await loadProductData(), soldTitles: titles(FUCHSIA) }).matches[0];
    assert.equal(top?.parallel, "Fuchsia Border");
    assert.equal(top?.sureness.parallel, "sure");
    assert.equal(top?.parallelSource, undefined);
  });

  it("re-prices the picked parallel from the saved sales, raw only for a raw card", async () => {
    const saved = titles([...PINK_RED, sale("2024 Bowman 1st Aidan Miller Pink Red /299 BP-27 PSA 10", 210, "2026-10-13")]);
    const result = await lookupScanComp(
      miller("Fuchsia Border"),
      "viewer",
      { quickCompCache: async () => null, collectionSales: async () => [], soldCache: async () => saved, directory: INDEXED_DIRECTORY, products: loadProductData },
      { serialRun: 299 },
    );
    assert.equal(result.status === "ok" && result.nSales, 3);
  });
});

describe("the checklist: the only parallel at a print run", () => {
  it("says so for 2024 Bowman paper /299, and not for a shared run or the wrong list", async () => {
    const data = await loadProductData();
    const card = { yearLabel: "2024", setBrand: "Bowman", cardNumber: "BP-27" };
    assert.equal(onlyParallelAtRun(data, { ...card, parallel: "Fuchsia Border" }, 299), true);
    assert.equal(onlyParallelAtRun(data, { ...card, parallel: "Speckle Refractor" }, 299), false);
    assert.equal(onlyParallelAtRun(data, { ...card, parallel: "Blue Border" }, 150), false);
    assert.equal(onlyParallelAtRun(data, { ...card, parallel: "Fuchsia Border" }, null), false);
    assert.equal(onlyParallelAtRun(data, { ...card, yearLabel: "2019", parallel: "Fuchsia Border" }, 299), false);
  });
});

/** 2025 Bowman lists its paper parallels as "… Border" too, with no print runs on the list. */
describe("2025 Bowman '… Border' parallels price from titles that skip 'Border'", () => {
  const sold = [
    sale("2025 Bowman 1st Aidan Miller Sky Blue /499 BP-27", 12, "2026-11-10"),
    sale("Aidan Miller 2025 Bowman Sky Blue 201/499 BP-27", 14, "2026-11-05"),
  ];

  it("prices a picked Sky Blue Border from 'Sky Blue' sales", () => {
    const priced = cleanCompFor(miller("Sky Blue Border", "2025"), asTrawlResults(sold), INDEXED_DIRECTORY, { serialRun: 499, asOf: null, source: "sold-cache" });
    assert.equal(priced.status === "ok" && priced.nSales, 2);
  });

  it("prices a scanned /499 with the real checklist loaded", async () => {
    const result = await lookupLiveSolds(
      { capture: { lines: ["1ST BOWMAN", "PHILADELPHIA PHILLIES", "201/499", "AIDAN MILLER"], backLines: ["AIDAN MILLER", "BP-27", "© 2025 THE TOPPS COMPANY, INC."], kind: "card" }, rows: [{ ...CARD, yearLabel: "2025" }] },
      "test",
      {
        directory: INDEXED_DIRECTORY,
        products: loadProductData,
        cachedTitles: async () => [],
        quickCompCache: async () => null,
        liveSearch: async () => ({
          ok: true,
          fetchedAt: "2026-11-12T20:00:00.000Z",
          results: asTrawlResults(sold).map((item, index) => ({ ...item, item_id: `sky-${index}`, date_sold: `${sold[index].soldAt}T18:00:00.000Z` })),
        }),
        storeQuickComp: async () => {},
      },
    );
    assert.equal(result.comp.status === "ok" && result.comp.nSales, 2);
    // Sky Blue is its own parallel, never read as Blue, and takes the checklist's name.
    assert.equal(result.matches[0]?.parallel, "Sky Blue Border");
    assert.equal(result.comp.status === "ok" && result.comp.parallel, "Sky Blue");
    assert.equal(result.matches[0]?.serialRun, 499);
  });
});

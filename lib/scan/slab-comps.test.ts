import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadChecklistsFor } from "@/lib/cards/checklist-load";
import { loadProductData } from "@/lib/cards/product-data";
import type { TrawlSoldResult } from "@/lib/comps/types";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import { lookupLiveSolds, type LiveSoldsDeps } from "./live-solds";
import { liveSearchLadder, rankScanMatches } from "./match";
import { scanReadFrom, withVersionLine } from "./session";

/**
 * A slab's sold prices come from its label: the search is the label's own wording (year, set,
 * player, card #, parallel, grade) and only sales whose titles name that same parallel count.
 * A label that names no parallel asks "Which version?" first: nothing is searched or priced.
 * Titles are modeled on how sellers word these cards, not copied from real listings.
 */

const LABEL = ["2025 TOPPS CHROME #306", "JAXSON DART", "GEM MT 10", "PSA", "98765432"];
const capture = (lines: string[], kind: "slab" | "card" = "slab") => ({ lines, backLines: [] as string[], kind });

function sold(id: string, title: string, price: number, grade: string | null = "10"): TrawlSoldResult {
  return {
    title,
    sale_price: price,
    shipping_price: 0,
    currency: "USD",
    condition: "Graded",
    condition_raw: null,
    date_sold: "2026-11-10T18:00:00.000Z",
    buying_format: "Auction",
    item_id: id,
    item_link: "",
    image_url: null,
    details: { grading: { graded: grade != null, grader: grade ? "PSA" : null, grade, condition: null } },
  };
}

const SOLDS = [
  sold("base1", "2025 Topps Chrome Jaxson Dart #306 RC PSA 10 Giants", 60),
  sold("base2", "2025 Topps Chrome Football Jaxson Dart Rookie #306 PSA 10 GEM MINT", 64),
  sold("base3", "Jaxson Dart 2025 Topps Chrome #306 Rookie Card PSA 10", 58),
  sold("xf1", "2025 Topps Chrome Jaxson Dart X-Fractor #306 RC PSA 10", 150),
  sold("xf2", "2025 Topps Chrome Jaxson Dart #306 X-Fractor Rookie PSA 10 GEM MINT", 160),
  sold("xf3", "2025 Topps Chrome Football Jaxson Dart Xfractor RC #306 PSA 10", 155),
  sold("xf4", "Jaxson Dart 2025 Topps Chrome X Fractor #306 PSA 10", 148),
  sold("ref1", "2025 Topps Chrome Jaxson Dart #306 Refractor RC PSA 10", 95),
  sold("ref2", "2025 Topps Chrome Jaxson Dart Refractor #306 PSA 10", 99),
  sold("gold1", "2025 Topps Chrome Jaxson Dart #306 Gold Refractor /50 PSA 10", 900),
  sold("nine", "2025 Topps Chrome Jaxson Dart #306 RC PSA 9", 30, "9"),
  sold("raw", "2025 Topps Chrome Jaxson Dart #306 RC", 12, null),
];

function harness() {
  const queries: string[] = [];
  let cacheReads = 0;
  const deps: LiveSoldsDeps = {
    directory: SCAN_DIRECTORY,
    products: loadProductData,
    checklists: (key) => loadChecklistsFor(key),
    cachedTitles: async () => [],
    quickCompCache: async () => {
      cacheReads += 1;
      return null;
    },
    liveSearch: async (query) => {
      queries.push(query);
      return { ok: true, results: SOLDS, fetchedAt: "2026-11-16T12:00:00.000Z" };
    },
    storeQuickComp: async () => {},
  };
  return { deps, queries, cacheReads: () => cacheReads };
}

async function ladder(lines: string[], kind: "slab" | "card" = "slab") {
  const read = scanReadFrom({ ...capture(lines, kind), image: null, alternates: null, backAlternates: null, cert: null }, SCAN_DIRECTORY);
  const top = rankScanMatches(read, [], { directory: SCAN_DIRECTORY, products: await loadProductData(), soldTitles: [], checklists: [] }).matches[0];
  return liveSearchLadder(read, top, SCAN_DIRECTORY);
}

describe("a slab's search is its label's wording", () => {
  it("year, set, player, card #, parallel and grade lead the ladder", async () => {
    const rungs = await ladder([...LABEL, "X-FRACTOR"]);
    assert.equal(rungs[0], "2025 Topps Chrome Jaxson Dart 306 X-Fractor PSA 10");
    assert.ok(rungs.length <= 4);
    // The wider searches stay behind it, for a card whose sellers leave words out.
    assert.ok(rungs.includes("Jaxson Dart Topps Chrome 306 PSA 10"));
  });

  it("Base is never a search word", async () => {
    const rungs = await ladder([...LABEL, "BASE"]);
    assert.equal(rungs[0], "2025 Topps Chrome Jaxson Dart 306 PSA 10");
    assert.ok(!rungs.some((query) => /base/i.test(query)));
  });

  it("a raw card's ladder is as it was: no year, no parallel word", async () => {
    const rungs = await ladder(["JAXSON DART", "TOPPS CHROME", "NEW YORK GIANTS"], "card");
    assert.ok(rungs.length > 0);
    assert.ok(!rungs.some((query) => /2025|x-fractor/i.test(query)), rungs.join(" | "));
  });
});

describe("a slab's sold prices are its own version's", () => {
  it("no parallel on the label: asks which version, and nothing is searched, read from a cache or priced", async () => {
    const { deps, queries, cacheReads } = harness();
    const result = await lookupLiveSolds({ capture: capture(LABEL), rows: [] }, "fixture-user", deps);
    assert.deepEqual(result.comp, { status: "version" });
    assert.equal(result.query, null);
    assert.equal(queries.length, 0);
    assert.equal(cacheReads(), 0);
    assert.equal(result.matches[0]?.parallel, "");
    assert.deepEqual(result.matches[0]?.parallelOptions.map((option) => option.name).slice(0, 3), ["Base", "Refractor", "X-Fractor"]);
  });

  it("X-Fractor picked: one search by the label's wording, and only the 4 X-Fractor PSA 10 sales, in every spelling", async () => {
    const { deps, queries } = harness();
    const result = await lookupLiveSolds({ capture: capture(withVersionLine(capture(LABEL), "X-Fractor").lines), rows: [] }, "fixture-user", deps);
    assert.deepEqual(queries, ["2025 Topps Chrome Jaxson Dart 306 X-Fractor PSA 10"]);
    assert.equal(result.matches[0]?.parallel, "X-Fractor");
    assert.ok(result.comp.status === "ok");
    assert.equal(result.comp.nSales, 4);
    assert.deepEqual(result.comp.sales.map((sale) => sale.priceCents).sort((a, b) => a - b), [14800, 15000, 15500, 16000]);
  });

  it("Base picked: only the 3 base PSA 10 sales. No X-Fractor, Refractor, Gold, PSA 9 or raw", async () => {
    const { deps, queries } = harness();
    const result = await lookupLiveSolds({ capture: capture(withVersionLine(capture(LABEL), "Base").lines), rows: [] }, "fixture-user", deps);
    assert.deepEqual(queries, ["2025 Topps Chrome Jaxson Dart 306 PSA 10"]);
    assert.equal(result.matches[0]?.parallel, "Base");
    assert.ok(result.comp.status === "ok");
    assert.deepEqual(result.comp.sales.map((sale) => sale.priceCents).sort((a, b) => a - b), [5800, 6000, 6400]);
  });

  it("Refractor picked: the 2 Refractor sales, never the Gold Refractor /50", async () => {
    const { deps } = harness();
    const result = await lookupLiveSolds({ capture: capture(withVersionLine(capture(LABEL), "Refractor").lines), rows: [] }, "fixture-user", deps);
    assert.ok(result.comp.status === "ok");
    assert.deepEqual(result.comp.sales.map((sale) => sale.priceCents).sort((a, b) => a - b), [9500, 9900]);
  });

  it("a label that prints its parallel needs no pick", async () => {
    const { deps, queries } = harness();
    const result = await lookupLiveSolds({ capture: capture(["2025 TOPPS CHROME #306", "JAXSON DART", "X-FRACTOR", "GEM MT 10", "PSA", "98765432"]), rows: [] }, "fixture-user", deps);
    assert.equal(queries.length, 1);
    assert.ok(result.comp.status === "ok");
    assert.equal(result.comp.nSales, 4);
  });
});

describe("the picked version is read as a label line", () => {
  it("adds the version in the label's own style, once, and leaves the scan as it was", () => {
    const scan = capture(LABEL);
    const picked = withVersionLine(scan, "X-Fractor");
    assert.deepEqual(picked.lines, [...LABEL, "X-FRACTOR"]);
    assert.deepEqual(scan.lines, LABEL);
    assert.deepEqual(withVersionLine(picked, "Refractor").lines, [...LABEL, "REFRACTOR"]);
    assert.deepEqual(withVersionLine(scan, "  ").lines, LABEL);
  });
});

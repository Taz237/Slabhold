import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checklistProductFrom } from "@/lib/cards/checklist-import";
import type { TrawlSoldResult } from "@/lib/comps/types";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import { liveSearchKey, MAX_LOOKUP_CALLS } from "./live-search";
import { lookupLiveSolds, type LiveSearchResult, type LiveSoldsDeps } from "./live-solds";
import { MAX_LADDER_RUNGS, cardSearchQuery, rankScanMatches, scanCardKey } from "./match";
import { scanReadFrom } from "./session";

/**
 * The search by the card itself (year, set, card #, print run), for a scan whose player is open.
 * A mocked Trawl: nothing reaches Trawl or eBay. What matters here is how few searches it takes.
 */

let id = 1;
function sold(title: string, price: number, date = "2026-11-01"): TrawlSoldResult {
  return {
    title,
    sale_price: price,
    shipping_price: null,
    currency: "USD",
    condition: "Ungraded",
    condition_raw: null,
    date_sold: `${date}T18:00:00.000Z`,
    buying_format: "Auction",
    item_id: `card-search-${id++}`,
    item_link: "",
    image_url: null,
    details: { grading: { graded: false, grader: null, grade: null, condition: null } },
  };
}

const PRIZM_BACK = ["NO. 103", "GUARD", "ALABAMA", "2025-26 PANINI - PRIZM NIL BASKETBALL", "© 2025 Panini America, Inc. Printed in the USA."];
const NO_NAME = { lines: ["PRIZM", "70/175"], backLines: PRIZM_BACK, kind: "card" as const };
const WITH_NAME = { lines: ["PRIZM", "LABARON PHILON", "ALABAMA", "70/175"], backLines: ["NO. 103", "LABARON PHILON", ...PRIZM_BACK.slice(1)], kind: "card" as const };
const CARD_QUERY = "2025-26 Panini Prizm 103 /175";
const PHILON_SALES = [
  sold("2025-26 Panini Prizm NIL LaBaron Philon #103 Orange Pulsar /175 Alabama", 42, "2026-11-10"),
  sold("2025-26 Panini Prizm Basketball LaBaron Philon Orange Pulsar Prizm #103 70/175", 38.5, "2026-11-08"),
  sold("LABARON PHILON 2025-26 Prizm #103 Orange Pulsar /175 Alabama Crimson Tide SP", 45, "2026-11-05"),
  sold("2025-26 Panini Prizm #103 LaBaron Philon Orange Pulsar /175", 40, "2026-11-02"),
];
const CHECKLIST = checklistProductFrom(
  { sport: "Basketball", yearLabel: "2025-26", product: "Panini Prizm", source: "test", read: "2026-11-14" },
  [{ name: "Base", cards: [{ number: "103", player: "LaBaron Philon", team: "Alabama Crimson Tide" }] }],
);

function deps(answer: (query: string) => LiveSearchResult, extra: Partial<LiveSoldsDeps> = {}) {
  const searches: string[] = [];
  const all: LiveSoldsDeps = {
    directory: SCAN_DIRECTORY,
    products: async () => [],
    cachedTitles: async () => [],
    quickCompCache: async () => null,
    liveSearch: async (query) => {
      searches.push(query);
      return answer(query);
    },
    storeQuickComp: async () => {},
    ...extra,
  };
  return { all, searches };
}

const found = (results: TrawlSoldResult[]): LiveSearchResult => ({ ok: true, results, fetchedAt: "2026-11-14T12:00:00.000Z" });

describe("the search by the card, for a scan whose player is open", () => {
  it("is the year, set, card # and print run the card printed, and nothing else", () => {
    const read = scanReadFrom({ ...NO_NAME, image: null }, SCAN_DIRECTORY);
    const top = rankScanMatches(read, [], { directory: SCAN_DIRECTORY, products: null }).matches[0];
    assert.equal(top.playerName, "");
    assert.equal(cardSearchQuery(read, top, SCAN_DIRECTORY), CARD_QUERY);
    assert.deepEqual(scanCardKey(read, SCAN_DIRECTORY), { years: ["2025-26"], yearPrinted: true, setBrand: "Panini Prizm", cardNumber: "103", run: 175, sport: "Basketball" });
  });

  it("is never built on a guess: no card #, no printed year, or no set means no search", () => {
    for (const back of [
      ["GUARD", "ALABAMA", "2025-26 PANINI - PRIZM NIL BASKETBALL"],
      ["NO. 103", "GUARD", "© 2025 Panini America, Inc. Printed in the USA."],
    ]) {
      const read = scanReadFrom({ lines: ["PRIZM", "70/175"], backLines: back, kind: "card", image: null }, SCAN_DIRECTORY);
      const top = rankScanMatches(read, [], { directory: SCAN_DIRECTORY, products: null }).matches[0];
      assert.equal(cardSearchQuery(read, top, SCAN_DIRECTORY), "", back.join(" | "));
    }
  });

  it("one search names the player and prices the card: no second call", async () => {
    const { all, searches } = deps((query) => found(query === CARD_QUERY ? PHILON_SALES : []));
    const result = await lookupLiveSolds({ capture: NO_NAME, rows: [] }, "user", all);
    assert.deepEqual(searches, [CARD_QUERY]);
    assert.equal(result.matches[0].playerName, "Labaron Philon Jr.");
    assert.equal(result.matches[0].playerSource, "sales");
    assert.equal(result.comp.status, "ok");
    assert.equal(result.query, CARD_QUERY);
  });

  it("the same card scanned again asks for the same search, so the shared cache answers it", async () => {
    const first = deps((query) => found(query === CARD_QUERY ? PHILON_SALES : []));
    const second = deps((query) => found(query === CARD_QUERY ? PHILON_SALES : []));
    await lookupLiveSolds({ capture: NO_NAME, rows: [] }, "one collector", first.all);
    // Another collector, the name read this time: still the same first search for the same card.
    await lookupLiveSolds({ capture: WITH_NAME, rows: [] }, "another collector", second.all);
    assert.equal(liveSearchKey(first.searches[0]), liveSearchKey(second.searches[0]));
    assert.equal(liveSearchKey("2025-26  PANINI PRIZM 103 /175"), liveSearchKey(CARD_QUERY));
  });

  it("with the checklist naming the player there is no search by the card: the ladder runs by name", async () => {
    const { all, searches } = deps((query) => found(/philon/i.test(query) ? PHILON_SALES : []), { checklists: async () => [CHECKLIST] });
    const result = await lookupLiveSolds({ capture: NO_NAME, rows: [] }, "user", all);
    assert.equal(result.matches[0].playerName, "Labaron Philon Jr.");
    assert.equal(result.matches[0].playerSource, "checklist");
    assert.equal(searches.length, 1);
    assert.match(searches[0], /^Labaron Philon Panini Prizm 103 \/175$/);
    assert.ok(!searches.includes(CARD_QUERY));
  });

  it("titles that name nobody leave the player open after one search: nothing is priced for nobody", async () => {
    const { all, searches } = deps(() => found([sold("2025-26 Panini Prizm #103 Orange Pulsar /175", 30), sold("2025-26 Panini Prizm #103 /175 SP", 28)]));
    const result = await lookupLiveSolds({ capture: NO_NAME, rows: [] }, "user", all);
    assert.deepEqual(searches, [CARD_QUERY]);
    assert.equal(result.matches[0].playerName, "");
    assert.deepEqual(result.comp, { status: "none", searched: true });
  });

  it("a cap is the cap message, and the search stops there", async () => {
    const { all, searches } = deps(() => ({ ok: false, reason: "safety", resetAt: "2026-11-15T00:00:00.000Z" }));
    const result = await lookupLiveSolds({ capture: NO_NAME, rows: [] }, "user", all);
    assert.equal(searches.length, 1);
    assert.deepEqual(result.comp, { status: "limited", reason: "safety", resetAt: "2026-11-15T00:00:00.000Z" });
    assert.equal(result.matches[0].playerName, "");
  });

  it("never more searches than the ladder's cap, card search included, even when nothing answers", async () => {
    const { all, searches } = deps(() => found([]));
    await lookupLiveSolds({ capture: WITH_NAME, rows: [] }, "user", all);
    assert.equal(searches[0], CARD_QUERY);
    assert.ok(searches.length <= MAX_LADDER_RUNGS, `${searches.length} searches`);
    assert.equal(MAX_LADDER_RUNGS, MAX_LOOKUP_CALLS);
    assert.equal(new Set(searches).size, searches.length);
  });

  it("no name and no card # read: no search at all", async () => {
    const { all, searches } = deps(() => found(PHILON_SALES));
    const result = await lookupLiveSolds({ capture: { lines: ["PRIZM"], backLines: ["GUARD"], kind: "card" }, rows: [] }, "user", all);
    assert.deepEqual(searches, []);
    assert.deepEqual(result.comp, { status: "none" });
  });
});

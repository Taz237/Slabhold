import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadChecklistsFor } from "@/lib/cards/checklist-load";
import { loadProductData } from "@/lib/cards/product-data";
import type { TrawlSoldResult } from "@/lib/comps/types";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import type { QuickCompIdentity } from "@/lib/quick-comp/identity";
import { compIdentityFromMatch, compQueryString } from "./comp";
import { lookupScanComp } from "./comp-lookup";
import { respondScanComp } from "./comp-respond";
import { lookupLiveSolds } from "./live-solds";
import { groupByParallel, scanSalesFor } from "./scan-sales";

/**
 * Device retest of the 2026-27 Topps Rookie Code #RC-3 Cameron Boozer: the ID was right, but the
 * plain version read "Rookie Code · 91 sales $2.25". Card Ladder: plain Rookie Code RC-3 ~$7,
 * Refractor / Holo $15-20. An insert's sales are only titles that name the insert (or its set and
 * code), with the Refractor and Holo on their own rows. Titles are modeled on real listings.
 */

const LEGAL = "© 2026 The Topps Company, Inc.";
const FRONT = ["ROOKIE CODE", "CAMERON BOOZER"];
/** The code read off the back: the scan pins RC-3 ("sure"), so its cache is read first. */
const BACK = ["RC-3", "CAMERON BOOZER", "MEMPHIS GRIZZLIES", LEGAL];

let id = 0;
function sale(title: string, dollars: number): TrawlSoldResult {
  id += 1;
  return {
    title,
    sale_price: dollars,
    shipping_price: null,
    currency: "USD",
    condition: "Ungraded",
    condition_raw: null,
    date_sold: `2026-11-${String(1 + (id % 15)).padStart(2, "0")}T18:00:00.000Z`,
    buying_format: "Auction",
    item_id: `rc3-${id}`,
    item_link: "",
    image_url: null,
    details: { grading: { graded: false, grader: null, grade: null, condition: null } },
  };
}

const PLAIN = [
  sale("2026-27 Topps Rookie Code Cameron Boozer #RC-3 Grizzlies RC", 7),
  sale("Cameron Boozer 2026-27 Topps Basketball Rookie Code RC-3", 6.5),
  sale("2026-27 Topps Cameron Boozer Rookie Code Insert RC-3", 7.5),
  // A seller who skips the insert's name still names the set and the code.
  sale("2026-27 Topps Cameron Boozer RC-3 Grizzlies", 7.25),
];
const SHINY = [
  sale("2026-27 Topps Cameron Boozer Rookie Code Refractor RC-3", 17),
  sale("2026-27 Topps Cameron Boozer Rookie Code Refractor #RC-3 Grizzlies", 16),
  sale("2026-27 Topps Rookie Code Insert Holo Cameron Boozer RC-3", 18),
  sale("Cameron Boozer 2026-27 Topps Rookie Code Holo RC-3", 19),
];
/** Cheap 2026 cards of his that print an RC-3 too, but name neither Topps nor Rookie Code. */
const OTHER_PRODUCTS = Array.from({ length: 40 }, (_, index) =>
  sale(index % 2 ? `2026 Sage Hit Cameron Boozer RC-3 Duke Rookie` : `2026 Wild Card Cameron Boozer RC-3 Duke Draft`, 2.25),
);
/** His plain base card: "RC" is its rookie mark, #258 its number. */
const BASE_258 = Array.from({ length: 30 }, () => sale("2026-27 Topps Cameron Boozer #258 RC Grizzlies Rookie", 1.79));
const ALL = [...PLAIN, ...SHINY, ...OTHER_PRODUCTS, ...BASE_258];

const IDENTITY: QuickCompIdentity = {
  playerName: "Cameron Boozer",
  year: 2026,
  yearLabel: "2026-27",
  setBrand: "Topps",
  cardNumber: "RC-3",
  parallel: "Base",
  grade: "Raw",
  insertName: "Rookie Code",
};

describe("an insert's sold prices: only the insert's own sales", () => {
  it("keeps titles naming Rookie Code (or Topps and RC-3); drops other products' RC-3 and the base #258", () => {
    const { kept, dropped } = scanSalesFor({ playerName: "Cameron Boozer", cardNumber: "RC-3", serialRun: null, yearLabel: "2026-27" }, IDENTITY, ALL, SCAN_DIRECTORY);
    assert.deepEqual(
      kept.map((item) => item.title).sort(),
      [...PLAIN, ...SHINY].map((item) => item.title).sort(),
    );
    assert.equal(dropped.set, OTHER_PRODUCTS.length);
    assert.equal(dropped.number, BASE_258.length);
  });

  it("the plain Rookie Code, the Refractor and the Holo are each their own row", () => {
    const { kept } = scanSalesFor({ playerName: "Cameron Boozer", cardNumber: "RC-3", serialRun: null, yearLabel: "2026-27" }, IDENTITY, ALL, SCAN_DIRECTORY);
    const groups = new Map(groupByParallel(kept).map((group) => [group.label, group.sales.map((item) => item.price)]));
    assert.deepEqual([...groups.keys()].sort(), ["Base", "Holo", "Refractor"]);
    assert.deepEqual(groups.get("Base")?.sort(), [6.5, 7, 7.25, 7.5]);
    assert.deepEqual(groups.get("Refractor")?.sort(), [16, 17]);
    assert.deepEqual(groups.get("Holo")?.sort(), [18, 19]);
  });

  it("a card in no insert keeps its sales exactly as before", () => {
    const plainIdentity = { ...IDENTITY, insertName: undefined };
    const { kept } = scanSalesFor({ playerName: "Cameron Boozer", cardNumber: "RC-3", serialRun: null, yearLabel: "2026-27" }, plainIdentity, ALL, SCAN_DIRECTORY);
    assert.equal(kept.length, PLAIN.length + SHINY.length + OTHER_PRODUCTS.length);
  });

  it("the price lookup carries the insert: the match, the query string and the route", async () => {
    const identity = compIdentityFromMatch(
      { playerName: "Cameron Boozer", yearLabel: "2026-27", setBrand: "Topps", cardNumber: "RC-3", parallel: "", insertName: "Rookie Code" } as never,
      "Raw",
    )!.identity;
    assert.equal(identity.insertName, "Rookie Code");
    const query = compQueryString(identity, null, "Cameron Boozer Topps Rookie Code RC-3");
    assert.match(query, /(?:^|&)insert=Rookie\+Code(?:&|$)/);
    let seen: QuickCompIdentity | null = null;
    await respondScanComp(new Request(`https://slabhold.app/api/scan/comp?${query}`), {
      enabled: () => true,
      userId: async () => "user-1",
      allow: async () => true,
      lookup: async (got) => {
        seen = got;
        return { status: "none" };
      },
    });
    assert.equal((seen as QuickCompIdentity | null)?.insertName, "Rookie Code");
    // A card in no insert sends no insert param.
    assert.doesNotMatch(compQueryString({ ...identity, insertName: undefined }), /insert=/);
  });

  it("picking the plain Rookie Code prices from its own sales (~$7), not 70 cheap ones", async () => {
    const result = await lookupScanComp(IDENTITY, "user-1", {
      quickCompCache: async () => ({ comps: ALL.map((item) => ({ soldPrice: item.sale_price, soldDate: item.date_sold, title: item.title })), fetchedAt: "2026-11-17T20:00:00.000Z" }),
      collectionSales: async () => [],
      directory: SCAN_DIRECTORY,
    });
    assert.equal(result.status, "ok");
    if (result.status === "ok") {
      assert.equal(result.nSales, PLAIN.length);
      assert.ok(result.medianCents != null && result.medianCents >= 650 && result.medianCents <= 750, String(result.medianCents));
    }
  });

  it("the scan's cache-first read never prices an insert as Base: its sales show by version", async () => {
    let searches = 0;
    const result = await lookupLiveSolds({ capture: { lines: FRONT, backLines: BACK, kind: "card" }, rows: [] }, "user-1", {
      directory: SCAN_DIRECTORY,
      products: loadProductData,
      checklists: (key) => loadChecklistsFor(key),
      cachedTitles: async () => [],
      quickCompCache: async () => ({ comps: ALL.map((item) => ({ soldPrice: item.sale_price, soldDate: item.date_sold, title: item.title })), fetchedAt: "2026-11-17T20:00:00.000Z" }),
      liveSearch: async () => {
        searches += 1;
        return { ok: true, results: [], fetchedAt: "2026-11-17T20:00:00.000Z" };
      },
      storeQuickComp: async () => {},
    });
    assert.equal(result.matches[0]?.cardNumber, "RC-3");
    assert.equal(result.matches[0]?.insertName, "Rookie Code");
    assert.equal(searches, 0, "the cache answered: no Trawl call");
    assert.equal(result.comp.status, "split", JSON.stringify(result.comp));
    if (result.comp.status === "split") {
      const rows = new Map(result.comp.groups.map((group) => [group.label, group.nSales]));
      assert.equal(rows.get("Base"), PLAIN.length);
      assert.equal(rows.get("Refractor"), 2);
      assert.equal(rows.get("Holo"), 2);
    }
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadChecklistsFor } from "@/lib/cards/checklist-load";
import { loadProductData } from "@/lib/cards/product-data";
import type { TrawlSoldResult } from "@/lib/comps/types";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import { matchLine } from "./confirm";
import { lookupLiveSolds } from "./live-solds";
import { liveSearchLadder, rankScanMatches, scanChecklistKey, type ScanMatch } from "./match";
import { revealLines } from "./reveal";
import { scanSalesFor } from "./scan-sales";
import { scanReadFrom } from "./session";

/**
 * TestFlight 1.1.1 (7): the 2026-27 Topps Rookie Code #RC-3 Cameron Boozer. The front prints
 * ROOKIE CODE in big letters; the back's RC-3 sits in falling binary digits and didn't read. The
 * scan showed "2026-27 Topps", "#MEM" and "#TB-18" with no Rookie Code row, and priced it as Base.
 * Card text is modeled on the device read; titles are modeled on real Rookie Code listings.
 */

const LEGAL = "© 2026 The Topps Company, Inc.";
/** The device read: the insert name and nameplate on the front, no code on the back. */
const DEVICE_FRONT = ["01", "ROOKIE CODE", "10", "CAMERON BOOZER"];
const DEVICE_BACK = ["0110", "0 0", "CAMERON BOOZER", "MEMPHIS", "MEM", "FORWARD", "Cameron, who scores through contact", LEGAL];

async function scan(front: string[], back: string[] | null, titles: { title: string }[] = []): Promise<ScanMatch[]> {
  const read = scanReadFrom({ lines: front, backLines: back, kind: "card", image: null }, SCAN_DIRECTORY);
  const key = scanChecklistKey(read, SCAN_DIRECTORY);
  const checklists = key ? await loadChecklistsFor(key) : [];
  return rankScanMatches(read, [], { directory: SCAN_DIRECTORY, products: await loadProductData(), soldTitles: titles, checklists }).matches;
}

function sale(title: string, dollars: number, index: number): TrawlSoldResult {
  return {
    title,
    sale_price: dollars,
    shipping_price: null,
    currency: "USD",
    condition: "Ungraded",
    condition_raw: null,
    date_sold: `2026-11-${String(10 - (index % 9)).padStart(2, "0")}T18:00:00.000Z`,
    buying_format: "Auction",
    item_id: `rc3-${index}`,
    item_link: "",
    image_url: null,
    details: { grading: { graded: false, grader: null, grade: null, condition: null } },
  };
}

/** Card Ladder: the plain Rookie Code ~$7, the Refractor and Holo $15-20. Base #258 sells for less. */
const SOLDS: TrawlSoldResult[] = [
  "2026-27 Topps Rookie Code Cameron Boozer #RC-3 Grizzlies RC",
  "Cameron Boozer 2026-27 Topps Basketball Rookie Code RC-3",
  "2026-27 Topps Cameron Boozer Rookie Code Insert RC-3",
]
  .map((title, index) => sale(title, 7 + index * 0.25, index))
  .concat(
    sale("2026-27 Topps Cameron Boozer Rookie Code Refractor RC-3", 17, 3),
    sale("2026-27 Topps Rookie Code Insert Holo Cameron Boozer RC-3", 18, 4),
    sale("2026-27 Topps Cameron Boozer Rookie Code Refractor #RC-3 Grizzlies", 16, 5),
  );

describe("insert names printed on the card: Rookie Code RC-3", () => {
  it("the device read (ROOKIE CODE on the front, no code on the back) is 2026-27 Topps Rookie Code #RC-3", async () => {
    const [top] = await scan(DEVICE_FRONT, DEVICE_BACK);
    assert.equal(top?.playerName, "Cameron Boozer");
    assert.equal(top?.yearLabel, "2026-27");
    assert.equal(top?.setBrand, "Topps");
    assert.equal(top?.cardNumber, "RC-3");
    assert.equal(top?.insertName, "Rookie Code");
  });

  it("an insert name split over two lines still reads (ROOKIE / CODE)", async () => {
    const [top] = await scan(["ROOKIE", "CODE", "CAMERON BOOZER"], DEVICE_BACK);
    assert.equal(top?.cardNumber, "RC-3");
    assert.equal(top?.insertName, "Rookie Code");
  });

  it("never lands on Base: the version stays open, with the insert's own versions to pick", async () => {
    const [top] = await scan(DEVICE_FRONT, DEVICE_BACK);
    assert.equal(top?.parallel, "");
    assert.equal(top?.sureness.parallel, "unsure");
    const names = top!.parallelOptions.map((option) => option.name);
    assert.ok(names.includes("Rainbow Foilboard"), names.join(", "));
    // Never another insert's or the base set's list.
    assert.ok(!names.includes("Refractor"), names.join(", "));
  });

  it("an RC-3 read off the back names its insert too, with no insert name read", async () => {
    const [top] = await scan(["CAMERON BOOZER"], ["RC-3", "CAMERON BOOZER", LEGAL]);
    assert.equal(top?.cardNumber, "RC-3");
    assert.equal(top?.insertName, "Rookie Code");
  });

  it("a base card names no insert, and a bio's words are never an insert name", async () => {
    const [base] = await scan(["CAMERON BOOZER"], ["258", "CAMERON BOOZER", "MEMPHIS GRIZZLIES", LEGAL]);
    assert.equal(base?.cardNumber, "258");
    assert.equal(base?.insertName, undefined);
    // "No Limit" and "The Journey" are 2026-27 Topps inserts with him in them; on the back they're just bio words.
    const bio = await scan(["CAMERON BOOZER"], ["CAMERON BOOZER", "MEMPHIS", "He plays with no limit on the journey", LEGAL]);
    assert.ok(!bio[0] || !bio[0].insertName, JSON.stringify(bio[0]));
    assert.ok(!bio[0] || !["NL-3", "TJ-3"].includes(bio[0].cardNumber), bio[0]?.cardNumber);
  });

  it("an insert name with no year or set read never picks a card on its own", async () => {
    const matches = await scan(["ROOKIE CODE", "CAMERON BOOZER"], null);
    for (const match of matches) assert.notEqual(match.parallel, "Base");
  });

  it("the set line and the reveal name the insert", async () => {
    const [top] = await scan(DEVICE_FRONT, DEVICE_BACK);
    assert.equal(matchLine(top!), "2026-27 Topps Rookie Code #RC-3");
    assert.ok(revealLines(top!).some((line) => line.field === "set" && line.text === "Topps Rookie Code"));
  });

  it("the sold search names the insert: Boozer Topps Rookie Code RC-3", async () => {
    const read = scanReadFrom({ lines: DEVICE_FRONT, backLines: DEVICE_BACK, kind: "card", image: null }, SCAN_DIRECTORY);
    const [top] = await scan(DEVICE_FRONT, DEVICE_BACK);
    const ladder = liveSearchLadder(read, top, SCAN_DIRECTORY);
    assert.equal(ladder[0], "Cameron Boozer Topps Rookie Code RC-3");
    for (const query of ladder) assert.match(query, /Rookie Code/, query);
  });

  it("Refractor and Holo sales are kept apart from the plain insert", async () => {
    const [top] = await scan(DEVICE_FRONT, DEVICE_BACK);
    const kept = scanSalesFor(top!, { grade: "Raw", setBrand: top!.setBrand }, SOLDS, SCAN_DIRECTORY).kept;
    assert.equal(kept.length, SOLDS.length, kept.map((item) => item.title).join(" | "));
    const plain = kept.filter((item) => item.parallel === "Base");
    assert.deepEqual(
      plain.map((item) => item.title),
      SOLDS.slice(0, 3).map((item) => item.title),
    );
    for (const item of kept.filter((sale) => /refractor|holo/i.test(sale.title))) assert.notEqual(item.parallel, "Base", item.title);
  });

  it("the live lookup never prices it as Base: the sales show split by version to pick", async () => {
    const queries: string[] = [];
    const result = await lookupLiveSolds({ capture: { lines: DEVICE_FRONT, backLines: DEVICE_BACK, kind: "card" }, rows: [] }, "device-7", {
      directory: SCAN_DIRECTORY,
      products: loadProductData,
      checklists: (key) => loadChecklistsFor(key),
      cachedTitles: async () => [],
      quickCompCache: async () => null,
      liveSearch: async (query) => {
        queries.push(query);
        return { ok: true, results: SOLDS, fetchedAt: "2026-11-17T20:00:00.000Z" };
      },
      storeQuickComp: async () => {},
    });
    assert.match(queries[0], /Rookie Code RC-3/);
    assert.equal(result.matches[0]?.cardNumber, "RC-3");
    assert.equal(result.matches[0]?.parallel, "");
    assert.equal(result.comp.status, "split");
    if (result.comp.status === "split") {
      const labels = result.comp.groups.map((group) => group.label);
      assert.ok(labels.includes("Base") && labels.includes("Refractor"), labels.join(", "));
    }
  });

  it("with the card # still open, his other cards' sales never price it as Base", async () => {
    // One sale each of four of his 2026-27 Topps cards: no card # for the titles to agree on.
    const mixed = [
      sale("2026-27 Topps Cameron Boozer #258 RC Grizzlies", 1.79, 0),
      sale("2026-27 Topps Bounce Cameron Boozer TB-18", 3, 1),
      sale("2026-27 Topps No Limit Cameron Boozer NL-3", 4, 2),
      sale("2026-27 Topps Rookie Code Cameron Boozer #RC-3", 7, 3),
    ];
    const result = await lookupLiveSolds({ capture: { lines: ["CAMERON BOOZER"], backLines: DEVICE_BACK, kind: "card" }, rows: [] }, "device-7", {
      directory: SCAN_DIRECTORY,
      products: loadProductData,
      checklists: (key) => loadChecklistsFor(key),
      cachedTitles: async () => [],
      quickCompCache: async () => null,
      liveSearch: async () => ({ ok: true, results: mixed, fetchedAt: "2026-11-17T20:00:00.000Z" }),
      storeQuickComp: async () => {},
    });
    const top = result.matches[0];
    // Open, or the one card of his the checklist and his titles back: never base #258 from one sale.
    assert.ok(["", "RC-3"].includes(top?.cardNumber ?? ""), top?.cardNumber);
    assert.equal(result.comp.status, "split", JSON.stringify(result.comp));
  });
});

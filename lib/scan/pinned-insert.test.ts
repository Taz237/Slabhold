import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadChecklistsFor } from "@/lib/cards/checklist-load";
import { loadProductData } from "@/lib/cards/product-data";
import type { TrawlSoldResult } from "@/lib/comps/types";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import { matchLine } from "./confirm";
import { lookupLiveSolds, type LiveSoldsDeps } from "./live-solds";
import { respondLiveSolds } from "./live-solds-respond";
import { rankScanMatches, scanChecklistKey, type ScanMatch } from "./match";
import { downgradesPin, keepPinned, pinFromBody, pinOf } from "./pin";
import { revealLines } from "./reveal";
import { scanReadFrom } from "./session";

/**
 * Device retest after #319 (2026-27 Topps Rookie Code #RC-3 Cameron Boozer): the reveal typed the
 * right card ("Topps Rookie Code / #RC-3"), then the sold lookup's answer replaced it with
 * "2026-27 Topps / Version", no insert, no #, and listed base-set Boozer parallels (Base 52 sales
 * $1.75, Blue, Gold $222.50, Orange $610, Mojo, Shimmer, Pattern). Once the read pins an insert and
 * its #, later steps may only add to it. Titles are modeled on real listings.
 */

const LEGAL = "© 2026 The Topps Company, Inc.";
const FRONT = ["ROOKIE CODE", "CAMERON BOOZER"];
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
    item_id: `pin-${id}`,
    item_link: "",
    image_url: null,
    details: { grading: { graded: false, grader: null, grade: null, condition: null } },
  };
}

/** His base set: what the device listed as 15 rows of parallels. */
const BASE_SET = [
  ...Array.from({ length: 52 }, (_, index) => sale(`2026-27 Topps Cameron Boozer RC Rookie Grizzlies${index % 2 ? " #258" : ""}`, 1.75)),
  ...["Blue /150", "Gold /50", "Orange /25", "Mojo", "Shimmer", "Pattern", "Green /99", "Purple /250", "Black /10", "Red /5"].map((name, index) =>
    sale(`2026-27 Topps Cameron Boozer ${name} RC Grizzlies`, [101, 222.5, 610, 20, 12, 9, 60, 40, 300, 900][index]),
  ),
];
const ROOKIE_CODE = [
  sale("2026-27 Topps Rookie Code Cameron Boozer #RC-3 Grizzlies RC", 7),
  sale("Cameron Boozer 2026-27 Topps Basketball Rookie Code RC-3", 6.5),
  sale("2026-27 Topps Cameron Boozer Rookie Code Insert RC-3", 7.5),
  sale("2026-27 Topps Cameron Boozer Rookie Code Refractor RC-3", 17),
  sale("2026-27 Topps Rookie Code Insert Holo Cameron Boozer RC-3", 18),
];
const titles = (items: readonly TrawlSoldResult[]) => items.map((item) => ({ title: item.title, price: item.sale_price, soldAt: item.date_sold }));
const comps = (items: readonly TrawlSoldResult[]) => ({ comps: items.map((item) => ({ soldPrice: item.sale_price, soldDate: item.date_sold, title: item.title })), fetchedAt: "2026-11-18T00:00:00.000Z" });

/** The phone's own read: the card alone, with the store's checklists. */
async function phoneRead(front = FRONT, back: string[] | null = BACK): Promise<ScanMatch[]> {
  const read = scanReadFrom({ lines: front, backLines: back, kind: "card", image: null }, SCAN_DIRECTORY);
  const key = scanChecklistKey(read, SCAN_DIRECTORY);
  const checklists = key ? await loadChecklistsFor(key) : [];
  return rankScanMatches(read, [], { directory: SCAN_DIRECTORY, products: await loadProductData(), soldTitles: [], checklists }).matches;
}

function deps(overrides: Partial<LiveSoldsDeps> = {}): LiveSoldsDeps & { queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    directory: SCAN_DIRECTORY,
    products: loadProductData,
    checklists: (key) => loadChecklistsFor(key),
    cachedTitles: async () => titles([...BASE_SET, ...ROOKIE_CODE]),
    quickCompCache: async () => comps(BASE_SET),
    liveSearch: async (query) => {
      queries.push(query);
      return { ok: true, results: [...BASE_SET, ...ROOKIE_CODE], fetchedAt: "2026-11-18T00:00:00.000Z" };
    },
    storeQuickComp: async () => {},
    ...overrides,
  };
}

function assertRookieCode(match: ScanMatch | undefined) {
  assert.equal(match?.playerName, "Cameron Boozer");
  assert.equal(match?.yearLabel, "2026-27");
  assert.equal(match?.setBrand, "Topps");
  assert.equal(match?.insertName, "Rookie Code");
  assert.equal(match?.cardNumber, "RC-3");
}

function assertInsertRowsOnly(comp: Awaited<ReturnType<typeof lookupLiveSolds>>["comp"]) {
  assert.equal(comp.status, "split", JSON.stringify(comp));
  if (comp.status !== "split") return;
  const rows = new Map(comp.groups.map((group) => [group.label, group.nSales]));
  assert.deepEqual([...rows.keys()].sort(), ["Base", "Holo", "Refractor"], JSON.stringify(comp.groups));
  assert.equal(rows.get("Base"), 3, "the plain Rookie Code's own 3 sales, not his base set's 52");
}

describe("a pinned insert: later steps only add to it", () => {
  it("end to end: back reads RC-3, every cache holds his base-set parallels: still Rookie Code #RC-3, insert rows only", async () => {
    const d = deps();
    const result = await lookupLiveSolds({ capture: { lines: FRONT, backLines: BACK, kind: "card" }, rows: [] }, "user-1", d);
    assertRookieCode(result.matches[0]);
    assert.equal(matchLine(result.matches[0]!), "2026-27 Topps Rookie Code #RC-3");
    assertInsertRowsOnly(result.comp);
    for (const query of d.queries) assert.match(query, /Rookie Code/, query);
  });

  it("the server's own read came out weaker (its checklists didn't load): the phone's pin holds the card", async () => {
    const phone = await phoneRead();
    const pin = pinOf(phone[0]);
    assert.ok(pin, "the phone's read pins Rookie Code #RC-3");
    // No checklist for the server's read; the pin's own list still loads for its versions.
    let calls = 0;
    const weak = deps({ checklists: async (key) => (calls++ === 0 ? [] : loadChecklistsFor(key)) });
    const front = ["ROOKIE CODE", "CAMERON BOOZER"];
    const back = ["CAMERON BOOZER", "MEMPHIS GRIZZLIES", LEGAL];
    const without = await lookupLiveSolds({ capture: { lines: front, backLines: back, kind: "card" }, rows: [] }, "user-1", deps({ checklists: async () => [] }));
    // The device's failure, reproduced: no pin, and the server reads "2026-27 Topps" with no insert.
    assert.equal(without.matches[0]?.insertName, undefined);
    const result = await lookupLiveSolds({ capture: { lines: front, backLines: back, kind: "card" }, rows: [], pin }, "user-1", weak);
    assertRookieCode(result.matches[0]);
    assertInsertRowsOnly(result.comp);
    assert.ok(result.matches[0]!.parallelOptions.some((option) => option.name === "Rainbow Foilboard"), "the insert's own versions");
  });

  it("no insert sales at all: the version stays open with no price, never base-set parallels", async () => {
    const d = deps({
      cachedTitles: async () => titles(BASE_SET),
      quickCompCache: async () => comps(BASE_SET),
      liveSearch: async () => ({ ok: true, results: BASE_SET, fetchedAt: "2026-11-18T00:00:00.000Z" }),
    });
    const result = await lookupLiveSolds({ capture: { lines: FRONT, backLines: BACK, kind: "card" }, rows: [] }, "user-1", d);
    assertRookieCode(result.matches[0]);
    assert.equal(result.matches[0]?.parallel, "");
    assert.equal(result.comp.status, "none", JSON.stringify(result.comp));
  });

  it("a pin for another player is ignored, and a pin is checked field by field", async () => {
    const phone = await phoneRead();
    const pin = { ...pinOf(phone[0])!, playerName: "AJ Dybantsa" };
    const result = await lookupLiveSolds({ capture: { lines: FRONT, backLines: ["CAMERON BOOZER", LEGAL], kind: "card" }, rows: [], pin }, "user-1", deps({ checklists: async () => [] }));
    assert.notEqual(result.matches[0]?.playerName, "AJ Dybantsa");
    assert.equal(pinFromBody({ ...pin, cardNumber: "RC-3; drop table" }), null);
    assert.equal(pinFromBody({ ...pin, insertName: "" }), null);
    assert.equal(pinFromBody(null), null);
  });

  it("the route passes the phone's pin through", async () => {
    const phone = await phoneRead();
    let got: unknown = null;
    await respondLiveSolds(
      new Request("https://slabhold.app/api/scan/solds", { method: "POST", body: JSON.stringify({ lines: FRONT, backLines: BACK, kind: "card", pin: pinOf(phone[0]) }) }),
      { enabled: () => true, userId: async () => "user-1", allow: async () => true, lookup: async (input) => ((got = input.pin), { matches: [], comp: { status: "none" }, query: null }) },
    );
    assert.deepEqual(got, pinOf(phone[0]));
  });

  it("keepPinned: an answer that dropped the insert and # gets the read back first, keeping what it added", async () => {
    const [read] = await phoneRead();
    const pin = pinOf(read)!;
    const downgraded: ScanMatch = { ...read!, cardNumber: "", insertName: undefined, setBrand: "Topps", sureness: { ...read!.sureness, number: "unsure" } };
    assert.ok(downgradesPin(pin, [downgraded]));
    const kept = keepPinned(pin, [downgraded], read!);
    assertRookieCode(kept[0]);
    assert.equal(kept[1], downgraded, "the other match stays on the list, below");
    // The same card with a parallel the sales named keeps it.
    const priced = { ...read!, parallel: "Rainbow Foilboard", insertName: undefined };
    const merged = keepPinned(pin, [priced], read!);
    assert.equal(merged[0]?.parallel, "Rainbow Foilboard");
    assertRookieCode(merged[0]);
    // The reveal types the whole ID.
    assert.deepEqual(revealLines(kept[0]!).slice(0, 4).map((line) => line.text), ["2026-27", "Topps Rookie Code", "#RC-3", "Cameron Boozer"]);
  });
});

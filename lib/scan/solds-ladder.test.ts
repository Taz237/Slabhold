import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TrawlSoldResult } from "@/lib/comps/types";
import { borderColorName } from "@/lib/ios/scanner";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import type { CacheFn } from "@/lib/quick-comp/cache";
import { makeLiveSearch, MAX_LOOKUP_CALLS, newLookupBudget } from "./live-search";
import { lookupLiveSolds, type LadderLog, type LiveSoldsDeps } from "./live-solds";
import { liveSearchLadder, rankScanMatches } from "./match";
import { groupByParallel, scanSalesFor } from "./scan-sales";
import { scanReadFrom, type ScanCapture } from "./session";

/**
 * The solds ladder against a mocked Trawl with realistic eBay titles,
 * junk included. Nothing reaches Trawl or eBay.
 */

let id = 1;
function sold(title: string, price: number, date = "2026-11-01", grading?: { grader: string; grade: string }): TrawlSoldResult {
  return {
    title,
    sale_price: price,
    shipping_price: null,
    currency: "USD",
    condition: grading ? "Graded" : "Ungraded",
    condition_raw: null,
    date_sold: `${date}T18:00:00.000Z`,
    buying_format: "Auction",
    item_id: `item-${id++}`,
    item_link: "",
    image_url: null,
    details: { grading: grading ? { graded: true, grader: grading.grader, grade: grading.grade, condition: null } : { graded: false, grader: null, grade: null, condition: null } },
  };
}

const MILLER_FRONT = ["3B", "1ST BOWMAN", "PHILADELPHIA PHILLIES", "137/299", "AIDAN MILLER"];
const MILLER_FRONT_NO_LOGO = ["3B", "PHILADELPHIA PHILLIES", "137/299", "AIDAN MILLER"];
const MILLER_BACK = ["AIDAN MILLER", "TOPPS.COM", "BP-27"];

/** What eBay returns for "Aidan Miller BP-27 /299": the card, and a lot of things that aren't it. */
const MILLER_RESULTS = [
  sold("Aidan Miller Bowman 1st Paper Pink/Red #'d 232/299 Phillies BP-27", 34.99, "2026-11-04"),
  sold("2024 Bowman 1st Aidan Miller Pink Red /299 BP-27 Phillies Prospect", 38, "2026-10-28"),
  sold("2024 Bowman Paper Prospects Aidan Miller Pink/Red 101/299 #BP-27", 36, "2026-10-20"),
  // Junk the filter must drop:
  sold("2024 Bowman Aidan Miller BP-27 LOT of 5 base prospects", 9),
  sold("Aidan Miller BP-27 Bowman 1st REPRINT custom /299", 3),
  sold("2024 Bowman Justin Crawford Pink/Red /299 BP-28 Phillies", 25),
  sold("2024 Bowman Aidan Miller BP-28 Pink/Red /299", 30),
  sold("2024 Bowman 1st Aidan Miller Purple /250 BP-27", 45),
  sold("2024 Bowman 1st Aidan Miller Pink Red /299 BP-27 PSA 10", 210, "2026-11-02", { grader: "PSA", grade: "10" }),
  sold("2024 Bowman 1st Aidan Miller BP-27 Phillies", 4),
];

function capture(front: string[], back: string[] | null, border: string | null = null): ScanCapture {
  return { lines: front, backLines: back, image: null, kind: "card", border };
}

function deps(liveByQuery: Record<string, TrawlSoldResult[]>, extra: Partial<LiveSoldsDeps> = {}) {
  const searches: string[] = [];
  const logs: LadderLog[] = [];
  const value: LiveSoldsDeps = {
    directory: INDEXED_DIRECTORY,
    products: async () => [],
    cachedTitles: async () => [],
    quickCompCache: async () => null,
    liveSearch: async (query) => {
      searches.push(query);
      return { ok: true, results: liveByQuery[query] ?? [], fetchedAt: "2026-11-12T20:00:00.000Z" };
    },
    storeQuickComp: async () => {},
    log: (event) => logs.push(event),
    ...extra,
  };
  return { value, searches, logs };
}

describe("the search ladder", () => {
  it("Miller: set + # + run, then # + run, then set + #, then # — no '#', no year", () => {
    const read = scanReadFrom(capture(MILLER_FRONT, ["AIDAN MILLER", "BP-27", "© 2024 THE TOPPS COMPANY, INC."]), INDEXED_DIRECTORY);
    const top = rankScanMatches(read, [], { directory: INDEXED_DIRECTORY, products: null }).matches[0];
    assert.deepEqual(liveSearchLadder(read, top, INDEXED_DIRECTORY), [
      "Aidan Miller Bowman BP-27 /299",
      "Aidan Miller BP-27 /299",
      "Aidan Miller Bowman BP-27",
      "Aidan Miller BP-27",
    ]);
  });

  it("1ST BOWMAN missed: BP- adds Bowman to the search only, never to the sheet", () => {
    const read = scanReadFrom(capture(MILLER_FRONT_NO_LOGO, MILLER_BACK), INDEXED_DIRECTORY);
    const top = rankScanMatches(read, [], { directory: INDEXED_DIRECTORY, products: null }).matches[0];
    assert.equal(top.setBrand, "");
    assert.equal(liveSearchLadder(read, top, INDEXED_DIRECTORY)[0], "Aidan Miller Bowman BP-27 /299");
  });

  it("no card # read: player + run; and never the player alone when anything else is known", () => {
    const read = scanReadFrom(capture(["JAXSON DART", "GIANTS", "RC", "121/199"], null), INDEXED_DIRECTORY);
    const top = rankScanMatches(read, [], { directory: INDEXED_DIRECTORY, products: null }).matches[0];
    assert.deepEqual(liveSearchLadder(read, top, INDEXED_DIRECTORY), ["Jaxson Dart /199"]);
  });

  it("a slab's grade rides along", () => {
    const read = scanReadFrom({ lines: ["PSA", "2024 BOWMAN", "#BP-27", "AIDAN MILLER", "MINT 9", "12345678"], backLines: null, image: null, kind: "slab" }, INDEXED_DIRECTORY);
    const top = rankScanMatches(read, [], { directory: INDEXED_DIRECTORY, products: null }).matches[0];
    assert.equal(liveSearchLadder(read, top, INDEXED_DIRECTORY)[0], "Aidan Miller Bowman BP-27 PSA 9");
  });

  it("stops at the first rung that finds this card's sales", async () => {
    const { value, searches } = deps({ "Aidan Miller BP-27 /299": MILLER_RESULTS });
    const result = await lookupLiveSolds({ capture: capture(MILLER_FRONT_NO_LOGO, MILLER_BACK), rows: [] }, "u1", value);
    assert.deepEqual(searches, ["Aidan Miller Bowman BP-27 /299", "Aidan Miller BP-27 /299"]);
    assert.equal(result.query, "Aidan Miller BP-27 /299");
    assert.equal(result.comp.status, "ok");
  });

  it("logs each rung: query, results back, kept and why the rest were dropped", async () => {
    const { value, logs } = deps({ "Aidan Miller BP-27 /299": MILLER_RESULTS });
    await lookupLiveSolds({ capture: capture(MILLER_FRONT_NO_LOGO, MILLER_BACK), rows: [] }, "u1", value);
    assert.equal(logs.length, 2);
    const hit = logs[1];
    assert.ok(hit.ok);
    assert.equal(hit.results, MILLER_RESULTS.length);
    assert.equal(hit.kept, 3);
    assert.deepEqual(hit.dropped, { junk: 2, player: 1, number: 1, run: 2, year: 0, grade: 1, removed: 0 });
  });
});

describe("the filter keeps only this card's sales", () => {
  it("same player, same #, same /run, raw only: three Pink/Red sales, no junk", () => {
    const { kept } = scanSalesFor(
      { playerName: "Aidan Miller", cardNumber: "BP-27", serialRun: 299, yearLabel: "2024" },
      { grade: "Raw" },
      MILLER_RESULTS,
      INDEXED_DIRECTORY,
    );
    assert.deepEqual(kept.map((sale) => sale.price).sort(), [34.99, 36, 38]);
    for (const sale of kept) assert.equal(sale.parallel, "Pink/Red");
  });

  it("a title naming another year is another card; a title with no year still counts", () => {
    const { kept, dropped } = scanSalesFor(
      { playerName: "Aidan Miller", cardNumber: "BP-27", serialRun: 299, yearLabel: "2024" },
      { grade: "Raw" },
      [sold("2025 Bowman Aidan Miller Pink /299 BP-27", 50), sold("Aidan Miller Bowman Pink/Red /299 BP-27", 33)],
      INDEXED_DIRECTORY,
    );
    assert.deepEqual(kept.map((sale) => sale.price), [33]);
    assert.equal(dropped.year, 1);
  });

  it("groups by the parallel the titles name: Pink/Red apart from Base", () => {
    const groups = groupByParallel(
      scanSalesFor(
        { playerName: "Aidan Miller", cardNumber: "BP-27", serialRun: null, yearLabel: "" },
        { grade: "Raw" },
        [...MILLER_RESULTS, sold("2024 Bowman Aidan Miller BP-27 Base Paper", 3), sold("2024 Bowman Aidan Miller BP-27 1st Paper", 4)],
        INDEXED_DIRECTORY,
      ).kept,
    );
    assert.deepEqual(groups.map((group) => [group.label, group.sales.length]).slice(0, 2), [["Pink/Red", 3], ["Base", 3]]);
  });

  it("the sheet's sales are the Pink/Red /299 group, labelled, with the other groups listed", async () => {
    const { value } = deps({ "Aidan Miller BP-27 /299": MILLER_RESULTS });
    const result = await lookupLiveSolds({ capture: capture(MILLER_FRONT_NO_LOGO, MILLER_BACK), rows: [] }, "u1", value);
    assert.ok(result.comp.status === "ok");
    assert.equal(result.comp.parallel, "Pink/Red");
    assert.deepEqual(result.comp.sales.map((sale) => sale.priceCents), [3499, 3800, 3600]);
    assert.deepEqual(result.comp.groups, [{ label: "Pink/Red", nSales: 3 }]);
  });
});

describe("the parallel, with no guessing", () => {
  it("most matching titles say Pink/Red: preselected, matched from recent sales", async () => {
    const { value } = deps({ "Aidan Miller BP-27 /299": MILLER_RESULTS });
    const result = await lookupLiveSolds({ capture: capture(MILLER_FRONT, MILLER_BACK), rows: [] }, "u1", value);
    const top = result.matches[0];
    assert.equal(top.parallel, "Pink/Red");
    assert.equal(top.parallelSource, "sales");
    assert.equal(top.sureness.parallel, "likely");
  });

  const SPLIT = [
    sold("2024 Bowman Aidan Miller Pink Red /299 BP-27", 36),
    sold("2024 Bowman Aidan Miller Purple /299 BP-27", 40),
  ];

  for (const [border, expected] of [
    ["pink", "Pink/Red"],
    ["red", "Pink/Red"],
    ["purple", "Purple"],
    [null, ""],
    ["green", ""],
  ] as const) {
    it(`titles split Pink/Red vs Purple at /299, border ${border ?? "unread"}: ${expected || "left open"}`, async () => {
      const { value } = deps({ "Aidan Miller Bowman BP-27 /299": SPLIT });
      const result = await lookupLiveSolds({ capture: capture(MILLER_FRONT, MILLER_BACK, border), rows: [] }, "u1", value);
      assert.equal(result.matches[0].parallel, expected);
    });
  }

  it("names the border only when it's a clear color", () => {
    assert.equal(borderColorName([0.95, 0.6, 0.8]), "pink");
    assert.equal(borderColorName([0.99, 0.7, 0.8]), "red");
    assert.equal(borderColorName([0.75, 0.6, 0.6]), "purple");
    assert.equal(borderColorName([0.95, 0.1, 0.9]), null, "washed out");
    assert.equal(borderColorName([0.95, 0.6, 0.1]), null, "too dark");
    assert.equal(borderColorName("pink"), null);
    assert.equal(borderColorName([0.5, 2, 0.5]), null);
  });
});

describe("caps and cache across the ladder", () => {
  function memoryCache() {
    const store = new Map<string, unknown>();
    const cache: CacheFn = (load, keyParts) => async () => {
      const key = keyParts.join("|");
      if (store.has(key)) return store.get(key) as Awaited<ReturnType<typeof load>>;
      const value = await load();
      store.set(key, value);
      return value;
    };
    return cache;
  }

  function search() {
    const fetched: string[] = [];
    const spent = { daily: 0, hourly: 0 };
    const run = makeLiveSearch({
      source: () => "trawl",
      hasTrawlKey: () => true,
      fetchSold: async (query) => {
        fetched.push(query);
        return { ok: true, body: { results: [] } };
      },
      limits: {
        consumeDaily: async () => (spent.daily++, true),
        consumeHourly: async () => (spent.hourly++, true),
      },
      cache: memoryCache(),
      now: () => Date.parse("2026-11-12T20:00:00.000Z"),
    });
    return { run, fetched, spent };
  }

  it("the whole ladder is one lookup: the caps are spent once; at most 4 Trawl calls; every rung cached", async () => {
    const { run, fetched, spent } = search();
    const { value } = deps({}, { liveSearch: run });
    const lookup = () => lookupLiveSolds({ capture: capture(MILLER_FRONT, MILLER_BACK), rows: [] }, "u1", value);
    const first = await lookup();
    assert.deepEqual(first.comp, { status: "none", searched: true });
    assert.equal(fetched.length, 4);
    assert.deepEqual(spent, { daily: 1, hourly: 1 });
    await lookup();
    assert.equal(fetched.length, 4, "the same scan again: every rung from the cache");
    assert.deepEqual(spent, { daily: 1, hourly: 1 });
  });

  it("a fifth Trawl call in one lookup is refused", async () => {
    const { run, fetched } = search();
    const budget = newLookupBudget();
    for (let i = 0; i < MAX_LOOKUP_CALLS; i += 1) assert.ok((await run(`query ${i}`, "u1", budget)).ok);
    assert.deepEqual(await run("query 5", "u1", budget), { ok: false, reason: "unavailable" });
    assert.equal(fetched.length, MAX_LOOKUP_CALLS);
  });
});

describe("review fixes", () => {
  it("one seller's bare 'Topps' never names the set or picks the parallel", async () => {
    const titles = [
      sold("Aidan Miller Bowman 1st Paper Pink/Red /299 BP-27", 35),
      sold("Aidan Miller Bowman 1st Paper Pink/Red /299 BP-27", 36),
      sold("2024 Bowman Aidan Miller Pink/Red /299 BP-27", 38),
      sold("2024 Topps Aidan Miller BP-27 Pink /299", 30),
    ];
    for (const front of [MILLER_FRONT, MILLER_FRONT_NO_LOGO]) {
      for (const back of [MILLER_BACK, null]) {
        const { value } = deps({}, { liveSearch: async () => ({ ok: true, results: titles, fetchedAt: "2026-11-12T20:00:00.000Z" }) });
        const result = await lookupLiveSolds({ capture: capture(front, back), rows: [] }, "u1", value);
        const top = result.matches[0];
        assert.equal(top.setBrand, "Bowman");
        assert.equal(top.parallel, "Pink/Red", "Pink/Red is its own parallel, not Pink");
        assert.equal(top.parallelSource, "sales");
        assert.ok(result.comp.status === "ok");
        assert.deepEqual(result.comp.sales.map((sale) => sale.priceCents).sort(), [3500, 3600, 3800]);
      }
    }
  });

  it("a lone '2024 Topps … /299' title never makes a front-only Bowman card Topps", async () => {
    const { value } = deps({}, {
      liveSearch: async () => ({ ok: true, results: [sold("2024 Topps Aidan Miller BP-27 Pink /299", 30)], fetchedAt: "x" }),
    });
    const result = await lookupLiveSolds({ capture: capture(MILLER_FRONT_NO_LOGO, null), rows: [] }, "u1", value);
    assert.doesNotMatch(JSON.stringify(result.matches), /Topps/);
    assert.equal(result.comp.status, "split", "one sale with the parallel open: shown, not priced");
  });

  it("an empty early rung, then a cap: the cap message, not 'no recent sales'", async () => {
    let calls = 0;
    const { value } = deps({}, {
      liveSearch: async () =>
        calls++ === 0
          ? { ok: true, results: [], fetchedAt: "x" }
          : { ok: false, reason: "hourly", resetAt: "2026-11-12T21:00:00.000Z" },
    });
    const result = await lookupLiveSolds({ capture: capture(MILLER_FRONT, MILLER_BACK), rows: [] }, "u1", value);
    assert.deepEqual(result.comp, { status: "limited", reason: "hourly", resetAt: "2026-11-12T21:00:00.000Z" });
    assert.equal(result.matches[0].cardNumber, "BP-27", "the identity still shows");
  });

  it("an empty early rung, then Trawl failing: unavailable, not 'no recent sales'", async () => {
    let calls = 0;
    const { value } = deps({}, {
      liveSearch: async () => (calls++ === 0 ? { ok: true, results: [], fetchedAt: "x" } : { ok: false, reason: "unavailable" }),
    });
    const result = await lookupLiveSolds({ capture: capture(MILLER_FRONT, MILLER_BACK), rows: [] }, "u1", value);
    assert.deepEqual(result.comp, { status: "unavailable" });
  });

  it("the parallel open and the groups tie: each group shows, nothing priced at random", async () => {
    const titles = [
      sold("2024 Bowman Aidan Miller Pink/Red /299 BP-27", 36),
      sold("2024 Bowman Aidan Miller Pink/Red /299 BP-27", 37),
      sold("2024 Bowman Aidan Miller Purple /299 BP-27", 40),
      sold("2024 Bowman Aidan Miller Purple /299 BP-27", 41),
    ];
    const { value } = deps({}, { liveSearch: async () => ({ ok: true, results: titles, fetchedAt: "x" }) });
    const result = await lookupLiveSolds({ capture: capture(MILLER_FRONT, MILLER_BACK), rows: [] }, "u1", value);
    assert.equal(result.matches[0].parallel, "");
    assert.equal(result.comp.status, "split");
    assert.ok(result.comp.status === "split");
    assert.deepEqual(result.comp.groups.map((group) => [group.label, group.nSales]).sort(), [["Pink/Red", 2], ["Purple", 2]]);
  });

  it("the border breaks a tie on titles with no year or set, only between parallels they offer", async () => {
    const titles = [sold("Aidan Miller Pink/Red /299 BP-27", 36), sold("Aidan Miller Purple /299 BP-27", 40)];
    const parallel = async (border: string | null) => {
      const { value } = deps({}, { liveSearch: async () => ({ ok: true, results: titles, fetchedAt: "x" }) });
      return (await lookupLiveSolds({ capture: capture(MILLER_FRONT, MILLER_BACK, border), rows: [] }, "u1", value)).matches[0].parallel;
    };
    assert.equal(await parallel("pink"), "Pink/Red");
    assert.equal(await parallel("purple"), "Purple");
    assert.equal(await parallel("green"), "", "green isn't on offer: open");
    assert.equal(await parallel(null), "");
  });

  it("picking a parallel after a split re-filters the same search the scan's way, never Trawl", async () => {
    const { lookupScanComp } = await import("./comp-lookup");
    const results = [
      sold("Aidan Miller Bowman 1st Paper Pink/Red #'d 232/299 Phillies BP-27", 34.99),
      sold("Aidan Miller Bowman Pink/Red /299 BP-27", 36),
      sold("2024 Bowman Aidan Miller Purple /299 BP-27", 40),
    ];
    const comp = await lookupScanComp(
      { playerName: "Aidan Miller", year: 2024, yearLabel: "2024", setBrand: "Bowman", cardNumber: "BP-27", parallel: "Pink/Red", grade: "Raw" },
      "u1",
      { quickCompCache: async () => null, collectionSales: async () => [], liveCache: async () => results, directory: INDEXED_DIRECTORY },
      { serialRun: 299, query: "Aidan Miller BP-27 /299" },
    );
    assert.ok(comp.status === "ok");
    assert.deepEqual(comp.sales.map((sale) => sale.priceCents).sort(), [3499, 3600]);
  });
});

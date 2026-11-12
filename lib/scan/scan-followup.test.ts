import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TrawlSoldResult } from "@/lib/comps/types";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import type { CacheFn } from "@/lib/quick-comp/cache";
import { COMP_COPY } from "./comp";
import { cachedSalesFor, lookupScanComp } from "./comp-lookup";
import { matchesKey } from "./confirm";
import { LIVE_SEARCH_RETRY_MS, makeLiveSearch, MAX_LOOKUP_CALLS, newLookupBudget, type LiveSearchDeps } from "./live-search";
import { lookupLiveSolds, type LiveSearchResult, type LiveSoldsDeps } from "./live-solds";
import { liveSearchLadder, rankScanMatches } from "./match";
import { scanSalesFor } from "./scan-sales";
import { scanReadFrom, type ScanCapture } from "./session";

/**
 * Donnie's phone, Nov 12, 4:54-4:55 PM ET, on the 2024 Bowman Aidan Miller BP-27 /299:
 * a failed 4th search wiped out the result, a misread /298 dropped every sale, and Fuchsia
 * /299 sales were labelled Base. Mocked Trawl only.
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
    item_id: `f-${id++}`,
    item_link: "",
    image_url: null,
    details: { grading: { graded: false, grader: null, grade: null, condition: null } },
  };
}

const FRONT = ["3B", "1ST BOWMAN", "PHILADELPHIA PHILLIES", "137/299", "AIDAN MILLER"];
const FRONT_298 = ["3B", "1ST BOWMAN", "PHILADELPHIA PHILLIES", "137/298", "AIDAN MILLER"];
const BACK = ["AIDAN MILLER", "TOPPS.COM", "BP-27"];

/** #248's Pink/Red /299 titles. */
const PINK_RED = [
  sold("Aidan Miller Bowman 1st Paper Pink/Red #'d 232/299 Phillies BP-27", 34.99, "2026-11-04"),
  sold("2024 Bowman 1st Aidan Miller Pink Red /299 BP-27 Phillies Prospect", 38, "2026-10-28"),
  sold("2024 Bowman Paper Prospects Aidan Miller Pink/Red 101/299 #BP-27", 36, "2026-10-20"),
];

/** The Nov 12 Quick Comp sales. */
const FUCHSIA = [
  sold("2024 Bowman Aidan Miller Fuchsia /299 BP-27 1st", 12.99, "2026-11-10"),
  sold("2024 Bowman 1st Aidan Miller BP-27 Fuchsia 88/299", 13, "2026-11-06"),
  sold("Aidan Miller 2024 Bowman Fuchsia #BP-27 /299", 10, "2026-11-02"),
];

function capture(front: string[], back: string[] | null): ScanCapture {
  return { lines: front, backLines: back, image: null, kind: "card", border: null };
}

function deps(liveSearch: LiveSoldsDeps["liveSearch"], extra: Partial<LiveSoldsDeps> = {}): LiveSoldsDeps {
  return {
    directory: INDEXED_DIRECTORY,
    products: async () => [],
    cachedTitles: async () => [],
    quickCompCache: async () => null,
    liveSearch,
    storeQuickComp: async () => {},
    ...extra,
  };
}

const ok = (results: TrawlSoldResult[]): LiveSearchResult => ({ ok: true, results, fetchedAt: "2026-11-12T21:54:00.000Z" });
const cents = (comp: { status: string; sales?: { priceCents: number }[] }) => (comp.sales ?? []).map((sale) => sale.priceCents).sort((a, b) => a - b);

describe("1) one failed search never wipes out the result", () => {
  it("rungs 1-3 empty, rung 4 fails: 'No recent eBay sales' (searched), not unavailable", async () => {
    const queries: string[] = [];
    const result = await lookupLiveSolds({ capture: capture(FRONT, BACK), rows: [] }, "u1", deps(async (query) => {
      queries.push(query);
      return queries.length < 4 ? ok([]) : { ok: false, reason: "unavailable" };
    }));
    assert.equal(queries.length, 4);
    assert.deepEqual(result.comp, { status: "none", searched: true });
    assert.equal(result.query, queries[2], "the last search that answered");
  });

  it("the first rung fails, the next finds the sales: priced", async () => {
    let call = 0;
    const result = await lookupLiveSolds({ capture: capture(FRONT, BACK), rows: [] }, "u1", deps(async () =>
      call++ === 0 ? { ok: false, reason: "unavailable" } : ok(PINK_RED)));
    assert.equal(result.comp.status, "ok");
    assert.deepEqual(cents(result.comp as never), [3499, 3600, 3800]);
  });

  it("no search answered: unavailable", async () => {
    const result = await lookupLiveSolds({ capture: capture(FRONT, BACK), rows: [] }, "u1", deps(async () => ({ ok: false, reason: "unavailable" })));
    assert.deepEqual(result.comp, { status: "unavailable" });
  });

  it("a cap still shows the limited message", async () => {
    let call = 0;
    const result = await lookupLiveSolds({ capture: capture(FRONT, BACK), rows: [] }, "u1", deps(async () =>
      call++ === 0 ? ok([]) : { ok: false, reason: "daily", resetAt: "2026-11-13T05:00:00.000Z" }));
    assert.deepEqual(result.comp, { status: "limited", reason: "daily", resetAt: "2026-11-13T05:00:00.000Z" });
  });
});

describe("1) a throttled or failed Trawl search gets one retry, inside the cap, and is logged", () => {
  const passthrough: CacheFn = (load) => async () => load();
  type Fetch = LiveSearchDeps["fetchSold"];

  function search(responses: Awaited<ReturnType<Fetch>>[]) {
    const calls: string[] = [];
    const waits: number[] = [];
    const warnings: unknown[] = [];
    const run = makeLiveSearch({
      source: () => "trawl",
      hasTrawlKey: () => true,
      fetchSold: async (query) => {
        calls.push(query);
        return responses.shift() ?? { ok: true, body: { results: [] } };
      },
      limits: { consumeDaily: async () => true, consumeHourly: async () => true },
      cache: passthrough,
      now: () => Date.parse("2026-11-12T21:54:00.000Z"),
      sleep: async (ms) => {
        waits.push(ms);
      },
      warn: (event) => warnings.push(event),
    });
    return { run, calls, waits, warnings };
  }

  it("a 429, then an answer: the answer, after ~400 ms, and the first failure logged", async () => {
    const { run, calls, waits, warnings } = search([{ ok: false, status: 429, error: "rate limited" }, { ok: true, body: { results: PINK_RED } }]);
    const result = await run("Aidan Miller BP-27", "u1");
    assert.equal(result.ok, true);
    assert.equal(calls.length, 2);
    assert.deepEqual(waits, [LIVE_SEARCH_RETRY_MS]);
    assert.equal(LIVE_SEARCH_RETRY_MS, 400);
    assert.deepEqual(warnings, [{ query: "Aidan Miller BP-27", status: 429, reason: "rate limited", retried: false }]);
    assert.doesNotMatch(JSON.stringify(warnings), /u1/, "never the user");
  });

  it("a 503 twice: unavailable, both logged", async () => {
    const { run, calls, warnings } = search([{ ok: false, status: 503, error: "down" }, { ok: false, status: 503, error: "down" }]);
    assert.deepEqual(await run("Aidan Miller BP-27", "u1"), { ok: false, reason: "unavailable" });
    assert.equal(calls.length, 2);
    assert.equal(warnings.length, 2);
  });

  it("a 400 isn't retried", async () => {
    const { run, calls, waits, warnings } = search([{ ok: false, status: 400, error: "bad query" }]);
    assert.deepEqual(await run("Aidan Miller BP-27", "u1"), { ok: false, reason: "unavailable" });
    assert.equal(calls.length, 1);
    assert.deepEqual(waits, []);
    assert.equal(warnings.length, 1);
  });

  it("the retry counts toward the 4-call cap and is skipped at the cap", async () => {
    const { run, calls } = search([{ ok: false, status: 429, error: "rate limited" }]);
    const budget = newLookupBudget();
    budget.spent = true;
    budget.calls = MAX_LOOKUP_CALLS - 1;
    assert.deepEqual(await run("Aidan Miller BP-27", "u1", budget), { ok: false, reason: "unavailable" });
    assert.equal(calls.length, 1);
    assert.equal(budget.calls, MAX_LOOKUP_CALLS);
  });
});

describe("2) a misread print run (OCR /298, the card is /299)", () => {
  it("137/298 with the Pink/Red /299 titles: 2024 Bowman #BP-27, 137/299, Pink/Red, priced from them", async () => {
    const result = await lookupLiveSolds({ capture: capture(FRONT_298, BACK), rows: [] }, "u1", deps(async () => ok(PINK_RED)));
    const top = result.matches[0];
    assert.equal(top.setBrand, "Bowman");
    assert.equal(top.yearLabel, "2024");
    assert.equal(top.cardNumber, "BP-27");
    assert.equal(top.serialNo, "137");
    assert.equal(top.serialRun, 299);
    assert.equal(top.runUnsure, true);
    assert.equal(top.parallel, "Pink/Red");
    assert.equal(result.comp.status, "ok");
    assert.deepEqual(cents(result.comp as never), [3499, 3600, 3800]);
  });

  it("the run sold titles agree on is what later searches and the filter use", () => {
    const read = scanReadFrom(capture(FRONT_298, BACK), INDEXED_DIRECTORY);
    const soldTitles = PINK_RED.map((item) => ({ title: item.title, price: item.sale_price, soldAt: item.date_sold }));
    const top = rankScanMatches(read, [], { directory: INDEXED_DIRECTORY, products: null, soldTitles }).matches[0];
    assert.equal(top.serialRun, 299);
    assert.ok(liveSearchLadder(read, top, INDEXED_DIRECTORY).every((query) => !query.includes("/298")));
    assert.ok(liveSearchLadder(read, top, INDEXED_DIRECTORY).some((query) => query.includes("/299")));
  });

  it("only 1 title, or a run 3 off, or a read run a title backs: the read run stays", () => {
    const rank = (front: string[], titles: string[]) =>
      rankScanMatches(scanReadFrom(capture(front, BACK), INDEXED_DIRECTORY), [], {
        directory: INDEXED_DIRECTORY,
        products: null,
        soldTitles: titles.map((title) => ({ title, price: 30, soldAt: null })),
      }).matches[0];
    assert.equal(rank(FRONT_298, [PINK_RED[0].title]).serialRun, 298);
    const off = rank(["1ST BOWMAN", "137/296", "AIDAN MILLER"], PINK_RED.map((item) => item.title));
    assert.equal(off.serialRun, 296);
    assert.equal(off.runUnsure, undefined);
    const backed = rank(FRONT_298, [...PINK_RED.map((item) => item.title), "2024 Bowman Aidan Miller BP-27 /298"]);
    assert.equal(backed.serialRun, 298);
  });

  it("a numbered card keeps only titles naming its run, even when the run was corrected", () => {
    const titles = [sold("2024 Bowman Aidan Miller Pink/Red BP-27", 35), sold("2024 Bowman Aidan Miller Pink/Red /299 BP-27", 36)];
    const card = { playerName: "Aidan Miller", cardNumber: "BP-27", serialRun: 299, yearLabel: "2024" };
    const raw = { grade: "Raw" };
    assert.equal(scanSalesFor(card, raw, titles, INDEXED_DIRECTORY).kept.length, 1);
    assert.equal(scanSalesFor({ ...card, runUnsure: true }, raw, titles, INDEXED_DIRECTORY).kept.length, 1);
  });

  it("137/298, only rung c answers, 2 /299 sales and 5 unnumbered: /299, priced from the 2, never Base", async () => {
    const answer = [
      sold("2024 Bowman Aidan Miller BP-27 /299 Phillies", 30),
      sold("Aidan Miller Bowman 1st BP-27 #'d 55/299", 32),
      ...[3, 3.5, 4, 4.5, 5].map((price) => sold("2024 Bowman 1st Aidan Miller BP-27 Phillies", price)),
    ];
    const queries: string[] = [];
    const result = await lookupLiveSolds({ capture: capture(FRONT_298, ["AIDAN MILLER", "BP-27"]), rows: [] }, "u1", deps(async (query) => {
      queries.push(query);
      return ok(query === "Aidan Miller Bowman BP-27" ? answer : []);
    }));
    assert.ok(queries.includes("Aidan Miller Bowman BP-27"));
    const top = result.matches[0];
    assert.equal(top.serialRun, 299);
    assert.equal(top.parallel, "", "no color named: the chip stays open");
    assert.ok(result.comp.status === "ok");
    assert.deepEqual(cents(result.comp), [3000, 3200]);
    assert.equal(result.comp.parallel, "/299, parallel not named");
    assert.ok(!(result.comp.groups ?? []).some((group) => group.label === "Base"));
    assert.doesNotMatch(JSON.stringify(result), /"Base"/);
  });
});

describe("2b) a numbered card is never Base", () => {
  it("/299 titles naming no color: grouped by the run, the chip left open", async () => {
    const plain = [sold("2024 Bowman Aidan Miller BP-27 /299", 28), sold("2024 Bowman 1st Aidan Miller BP-27 12/299", 31)];
    const result = await lookupLiveSolds({ capture: capture(FRONT, BACK), rows: [] }, "u1", deps(async () => ok(plain)));
    assert.equal(result.matches[0].parallel, "");
    assert.ok(result.comp.status === "ok");
    assert.equal(result.comp.parallel, "/299, parallel not named");
    assert.doesNotMatch(JSON.stringify(result), /"Base"/);
  });

  it("an unnumbered card's plain titles are still Base", () => {
    const titles = [sold("2024 Bowman Aidan Miller BP-27", 4)];
    const kept = scanSalesFor({ playerName: "Aidan Miller", cardNumber: "BP-27", serialRun: null, yearLabel: "2024" }, { grade: "Raw" }, titles, INDEXED_DIRECTORY).kept;
    assert.equal(kept[0].parallel, "Base");
  });

  it("another grade on the sheet re-filters to the run's group, not Base", async () => {
    const results = [sold("2024 Bowman Aidan Miller BP-27 /299", 28), sold("2024 Bowman Aidan Miller BP-27", 4)];
    const comp = await lookupScanComp(
      { playerName: "Aidan Miller", year: 2024, yearLabel: "2024", setBrand: "Bowman", cardNumber: "BP-27", parallel: "Base", grade: "Raw" },
      "u1",
      { quickCompCache: async () => null, collectionSales: async () => [], liveCache: async () => results, directory: INDEXED_DIRECTORY },
      { serialRun: 299, query: "Aidan Miller Bowman BP-27" },
    );
    assert.ok(comp.status === "ok");
    assert.deepEqual(cents(comp), [2800]);
  });
});

describe("3) the price names the parallel it came from", () => {
  it("3 Fuchsia /299 sales, parallel open: Fuchsia preselected from sales, priced and labelled Fuchsia, never Base", async () => {
    const result = await lookupLiveSolds({ capture: capture(FRONT, BACK), rows: [] }, "u1", deps(async () => ok(FUCHSIA)));
    const top = result.matches[0];
    assert.equal(top.parallel, "Fuchsia");
    assert.equal(top.parallelSource, "sales");
    assert.equal(top.parallelOptions[0].name, "Fuchsia");
    assert.ok(result.comp.status === "ok");
    assert.equal(result.comp.parallel, "Fuchsia");
    assert.deepEqual(cents(result.comp), [1000, 1299, 1300]);
    assert.doesNotMatch(JSON.stringify(result), /"Base"/);
    assert.equal(COMP_COPY.matchedFromSalesTap, "Matched from recent sales. Tap yours if it's different.");
  });

  it("no group is most of the sales: split, nothing priced", async () => {
    const mixed = [FUCHSIA[0], FUCHSIA[1], PINK_RED[0], PINK_RED[1], sold("2024 Bowman Aidan Miller Purple /299 BP-27", 20)];
    const result = await lookupLiveSolds({ capture: capture(FRONT, BACK), rows: [] }, "u1", deps(async () => ok(mixed)));
    assert.equal(result.comp.status, "split");
    assert.equal(result.matches[0].parallel, "");
  });

  it("Base only when the sales really are Base: an unnumbered card", async () => {
    const base = [sold("2024 Bowman Aidan Miller BP-27", 4), sold("2024 Bowman 1st Aidan Miller BP-27 Phillies", 5)];
    const unnumbered = ["3B", "1ST BOWMAN", "PHILADELPHIA PHILLIES", "AIDAN MILLER"];
    const result = await lookupLiveSolds({ capture: capture(unnumbered, BACK), rows: [] }, "u1", deps(async () => ok(base)));
    assert.ok(result.comp.status === "ok");
    assert.equal(result.comp.parallel, "Base");
  });

  it("Quick Comp's cache for Base holding the Fuchsia sales never prices as Base", async () => {
    const cached = {
      comps: FUCHSIA.map((item) => ({ soldPrice: item.sale_price, soldDate: item.date_sold, title: item.title })),
      fetchedAt: "2026-11-12T21:54:00.000Z",
    };
    assert.deepEqual(cachedSalesFor({ parallel: "Base" }, cached.comps, INDEXED_DIRECTORY), []);
    assert.equal(cachedSalesFor({ parallel: "Fuchsia" }, cached.comps, INDEXED_DIRECTORY).length, 3);

    // The scan: the cache is skipped and the live search names the parallel.
    const scan = await lookupLiveSolds({ capture: capture(FRONT, BACK), rows: [] }, "u1", deps(async () => ok(FUCHSIA), { quickCompCache: async () => cached }));
    assert.ok(scan.comp.status === "ok");
    assert.equal(scan.comp.parallel, "Fuchsia");

    // The sheet's Base pick: not priced from Fuchsia sales.
    const comp = await lookupScanComp(
      { playerName: "Aidan Miller", year: 2024, yearLabel: "2024", setBrand: "Bowman", cardNumber: "BP-27", parallel: "Base", grade: "Raw" },
      "u1",
      { quickCompCache: async () => cached, collectionSales: async () => [], directory: INDEXED_DIRECTORY },
    );
    assert.notEqual(comp.status, "ok");
  });

  it("the sheet starts over when the solds settle a different parallel or run", () => {
    const read = scanReadFrom(capture(FRONT, BACK), INDEXED_DIRECTORY);
    const open = rankScanMatches(read, [], { directory: INDEXED_DIRECTORY, products: null, soldTitles: [] }).matches;
    assert.notEqual(matchesKey(open), matchesKey([{ ...open[0], parallel: "Fuchsia" }, ...open.slice(1)]));
    assert.notEqual(matchesKey(open), matchesKey([{ ...open[0], serialRun: 298 }, ...open.slice(1)]));
    assert.equal(matchesKey(open), matchesKey([...open]));
  });
});

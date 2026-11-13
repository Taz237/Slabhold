import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TrawlSoldResult } from "@/lib/comps/types";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import type { CacheFn } from "@/lib/quick-comp/cache";
import { COMP_COPY, lastSale } from "./comp";
import { cachedSalesFor, lookupScanComp } from "./comp-lookup";
import { matchesKey } from "./confirm";
import { LIVE_SEARCH_RETRY_MS, makeLiveSearch, MAX_LOOKUP_CALLS, newLookupBudget, type LiveSearchDeps } from "./live-search";
import { lookupLiveSolds, type LiveSearchResult, type LiveSoldsDeps } from "./live-solds";
import { liveSearchLadder, rankScanMatches } from "./match";
import { scanSalesFor, titleParallel } from "./scan-sales";
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

  it("a 429 that's out of credits (no Retry-After) isn't retried: 1 call, unavailable", async () => {
    const { run, calls, waits } = search([{ ok: false, status: 429, error: "rate limited", outOfCredits: true }]);
    assert.deepEqual(await run("Aidan Miller BP-27", "u1"), { ok: false, reason: "unavailable" });
    assert.equal(calls.length, 1);
    assert.deepEqual(waits, []);
  });

  it("a 429 whose error says credits or quota isn't retried either", async () => {
    for (const error of ["Out of credits", "Monthly quota exceeded"]) {
      const { run, calls } = search([{ ok: false, status: 429, error, outOfCredits: false }]);
      assert.deepEqual(await run("Aidan Miller BP-27", "u1"), { ok: false, reason: "unavailable" });
      assert.equal(calls.length, 1, error);
    }
  });

  it("a 429 with Retry-After is still retried once", async () => {
    const { run, calls } = search([{ ok: false, status: 429, error: "slow down", outOfCredits: false }, { ok: true, body: { results: PINK_RED } }]);
    assert.equal((await run("Aidan Miller BP-27", "u1")).ok, true);
    assert.equal(calls.length, 2);
  });

  it("a 402 'Out of credits' isn't retried either, and marks the lookup spent", async () => {
    const { run, calls, waits } = search([{ ok: false, status: 402, error: "Out of credits" }]);
    const budget = newLookupBudget();
    assert.deepEqual(await run("Aidan Miller BP-27", "u1", budget), { ok: false, reason: "unavailable" });
    assert.equal(calls.length, 1);
    assert.deepEqual(waits, []);
    assert.equal(budget.outOfCredits, true);
    // The rest of this lookup never calls Trawl again.
    assert.deepEqual(await run("Aidan Miller Bowman BP-27", "u1", budget), { ok: false, reason: "unavailable" });
    assert.equal(calls.length, 1);
  });

  it("out of credits on every call: one scan makes exactly 1 Trawl call, 0 waits, caps spent once, unavailable", async () => {
    const calls: string[] = [];
    const waits: number[] = [];
    const spent = { daily: 0, hourly: 0 };
    const liveSearch = makeLiveSearch({
      source: () => "trawl",
      hasTrawlKey: () => true,
      fetchSold: async (query) => {
        calls.push(query);
        return { ok: false, status: 429, error: "rate limited", outOfCredits: true };
      },
      limits: { consumeDaily: async () => (spent.daily++, true), consumeHourly: async () => (spent.hourly++, true) },
      cache: passthrough,
      now: () => Date.parse("2026-11-13T02:30:00.000Z"),
      sleep: async (ms) => {
        waits.push(ms);
      },
      warn: () => {},
    });
    const result = await lookupLiveSolds({ capture: capture(FRONT, BACK), rows: [] }, "u1", deps(liveSearch));
    assert.equal(calls.length, 1);
    assert.deepEqual(waits, []);
    assert.deepEqual(spent, { daily: 1, hourly: 1 });
    assert.deepEqual(result.comp, { status: "unavailable" });
  });

  it("a 503, then an answer, still recovers", async () => {
    const { run, calls } = search([{ ok: false, status: 503, error: "down" }, { ok: true, body: { results: PINK_RED } }]);
    assert.equal((await run("Aidan Miller BP-27", "u1")).ok, true);
    assert.equal(calls.length, 2);
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

describe("4) an unnumbered card is never flipped to a parallel by sold titles", () => {
  const DART_ROW = { id: "dart-prizm", playerName: "Jaxson Dart", yearLabel: "2025", setBrand: "Panini Prizm", cardNumber: "332", sport: "Football", parallel: "Base", isRookie: true };
  const DART_FRONT = ["PRIZM", "JAXSON DART", "GIANTS", "QB", "RC"];
  const DART_BACK = ["JAXSON DART", "332", "© 2025 PANINI AMERICA, INC."];
  /** The Nov 11-12 sales Donnie's phone priced as Silver: 10 Silver Prizm titles, and a few base ones. */
  const SILVER = [65, 49.12, 62.5, 57.5, 67, 58, 61, 55, 63, 59].map((price, index) =>
    sold(`2025 Panini Prizm Jaxson Dart Silver Prizm #332 RC Giants ${index}`, price, index < 4 ? "2026-11-12" : "2026-11-11"),
  );
  const BASE = [
    sold("2025 Panini Prizm Jaxson Dart #332 RC Rookie Giants", 9, "2026-11-10"),
    sold("2025 Prizm Jaxson Dart Rookie #332 base", 8, "2026-11-08"),
    sold("Jaxson Dart 2025 Panini Prizm RC #332", 10, "2026-11-05"),
  ];
  const scan = (results: TrawlSoldResult[], extra: Partial<LiveSoldsDeps> = {}) =>
    lookupLiveSolds({ capture: capture(DART_FRONT, DART_BACK), rows: [DART_ROW] }, "u1", deps(async () => ok(results), extra));

  it("Dart #332 base, 10 Silver and 3 base sales: Base stays, priced from the base sales, Silver offered", async () => {
    const result = await scan([...SILVER, ...BASE]);
    const top = result.matches[0];
    assert.equal(top.playerName, "Jaxson Dart");
    assert.equal(top.cardNumber, "332");
    assert.equal(top.serialRun, null);
    assert.notEqual(top.parallelSource, "sales", "never 'Matched from recent sales'");
    assert.ok(!/silver/i.test(top.parallel), `parallel: ${top.parallel}`);
    assert.ok(result.comp.status === "ok");
    assert.equal(result.comp.parallel, "Base");
    assert.deepEqual(cents(result.comp), [800, 900, 1000]);
    assert.deepEqual(result.comp.groups?.find((group) => /silver/i.test(group.label))?.nSales, 10, "Silver is offered to tap");
  });

  it("Dart #332, only Silver sales: 'No recent Base sales', the groups to tap, nothing priced as Base", async () => {
    const result = await scan(SILVER);
    assert.notEqual(result.matches[0].parallelSource, "sales");
    assert.ok(!/silver/i.test(result.matches[0].parallel));
    assert.equal(result.comp.status, "split");
    assert.ok(result.comp.status === "split");
    assert.equal(result.comp.missing, "Base");
    assert.deepEqual(result.comp.groups.map((group) => [group.label, group.nSales]), [["Silver", 10]]);
    assert.equal(COMP_COPY.noBase, "No recent Base sales");
  });

  it("saved Silver titles never preselect Silver on an unnumbered card either", () => {
    const read = scanReadFrom(capture(DART_FRONT, DART_BACK), INDEXED_DIRECTORY);
    const soldTitles = SILVER.map((item) => ({ title: item.title, price: item.sale_price, soldAt: item.date_sold }));
    const top = rankScanMatches(read, [DART_ROW], { directory: INDEXED_DIRECTORY, products: null, soldTitles }).matches[0];
    assert.notEqual(top.parallelSource, "sales");
    assert.ok(!/silver/i.test(top.parallel));
  });

  it("Mosaic, Optic and Select: a Silver/Holo majority never flips an unnumbered base", async () => {
    for (const [set, word] of [["Mosaic", "Silver"], ["Donruss Optic", "Holo"], ["Select", "Silver"]] as const) {
      const row = { ...DART_ROW, id: `dart-${set}`, setBrand: `Panini ${set}`, cardNumber: "362" };
      const front = [set.toUpperCase().replace("DONRUSS ", ""), "JAXSON DART", "GIANTS", "RC"];
      const titles = [
        ...[30, 32, 35, 31].map((price, index) => sold(`2025 Panini ${set} Jaxson Dart ${word} #362 RC ${index}`, price)),
        sold(`2025 Panini ${set} Jaxson Dart #362 RC`, 6),
      ];
      const result = await lookupLiveSolds({ capture: capture(front, ["JAXSON DART", "362"]), rows: [row] }, "u1", deps(async () => ok(titles)));
      assert.ok(!new RegExp(word, "i").test(result.matches[0].parallel), `${set}: ${result.matches[0].parallel}`);
      assert.notEqual(result.matches[0].parallelSource, "sales", set);
      assert.ok(result.comp.status === "ok", set);
      assert.equal(result.comp.parallel, "Base", set);
      assert.deepEqual(cents(result.comp), [600], set);
    }
  });

  it("the border never picks Silver/Refractor/Holo, even on a numbered chrome card", () => {
    const read = scanReadFrom({ ...capture(["PRIZM", "JAXSON DART", "GIANTS", "12/199"], DART_BACK), border: "red" }, INDEXED_DIRECTORY);
    const soldTitles = [
      { title: "2025 Panini Prizm Jaxson Dart Red Prizm /199 #332", price: 40, soldAt: null },
      { title: "2025 Panini Prizm Jaxson Dart Silver Refractor /199 #332", price: 30, soldAt: null },
    ];
    const top = rankScanMatches(read, [DART_ROW], { directory: INDEXED_DIRECTORY, products: null, soldTitles }).matches[0];
    assert.ok(!/silver|refractor/i.test(top.parallel), top.parallel);
  });

  it("numbered consensus still holds: Miller Fuchsia /299 preselects Fuchsia", async () => {
    const result = await lookupLiveSolds({ capture: capture(FRONT, BACK), rows: [] }, "u1", deps(async () => ok(FUCHSIA)));
    assert.equal(result.matches[0].parallel, "Fuchsia");
    assert.equal(result.matches[0].parallelSource, "sales");
  });
});

describe("5) junk never shows or prices: one clean list for Add card and Quick Comp", () => {
  const DART_ROW = { id: "dart-prizm", playerName: "Jaxson Dart", yearLabel: "2025", setBrand: "Panini Prizm", cardNumber: "332", sport: "Football", parallel: "Base", isRookie: true };
  const DART_FRONT = ["PRIZM", "JAXSON DART", "GIANTS", "QB", "RC"];
  const DART_BACK = ["JAXSON DART", "#332", "© 2025 PANINI AMERICA, INC."];
  /** Donnie's phone after #250: a PSA 10 at $140 and a lot at $0.60 showed as Base sales. */
  const POLLUTED = [
    sold("2025 Panini Prizm Jaxson Dart #332 RC PSA 10 Gem Mint", 140, "2026-11-12"),
    sold("2025 Panini Prizm Jaxson Dart #332 RC lot of 3", 0.6, "2026-11-12"),
    sold("2025 Panini Prizm Jaxson Dart Silver Prizm #332 RC", 12, "2026-11-11"),
    sold("2025 Panini Prizm Jaxson Dart #332 RC Rookie", 2.8, "2026-11-12"),
    sold("2025 Prizm Jaxson Dart Rookie #332 Giants", 3.1, "2026-11-09"),
    sold("Jaxson Dart 2025 Panini Prizm RC #332", 2.5, "2026-11-06"),
  ];
  const DART_IDENTITY = { playerName: "Jaxson Dart", year: 2025, yearLabel: "2025", setBrand: "Panini Prizm", cardNumber: "332", parallel: "Base", grade: "Raw" };
  const asCache = (results: TrawlSoldResult[]) => ({
    comps: results.map((item) => ({ soldPrice: item.sale_price, soldDate: item.date_sold, title: item.title })),
    fetchedAt: "2026-11-12T23:00:00.000Z",
  });
  const scanDart = (extra: Partial<LiveSoldsDeps>, results: TrawlSoldResult[] = POLLUTED) =>
    lookupLiveSolds({ capture: capture(DART_FRONT, DART_BACK), rows: [DART_ROW] }, "u1", deps(async () => ok(results), extra));

  it("Dart raw base: the PSA 10 and the lot are gone, Silver is its own group, priced from the 3 raw base sales", async () => {
    const result = await scanDart({});
    assert.ok(result.comp.status === "ok");
    assert.equal(result.comp.parallel, "Base");
    assert.deepEqual(cents(result.comp), [250, 280, 310]);
    assert.equal(result.comp.sales[0].priceCents, 280, "the newest clean sale is what Add card shows");
    assert.deepEqual(result.comp.groups?.find((group) => group.label !== "Base"), { label: "Silver", nSales: 1 });
  });

  it("the same polluted sales from Quick Comp's cache or saved titles clean the same way", async () => {
    const fromCache = await scanDart({ quickCompCache: async () => asCache(POLLUTED) });
    const fromSaved = await scanDart({
      cachedTitles: async () => POLLUTED.map((item) => ({ title: item.title, price: item.sale_price, soldAt: item.date_sold })),
    }, []);
    for (const result of [fromCache, fromSaved]) {
      assert.ok(result.comp.status === "ok", JSON.stringify(result.comp));
      assert.deepEqual(cents(result.comp), [250, 280, 310]);
    }
  });

  it("Quick Comp's own lookup for the same card, parallel and grade gets the same list as the scan", async () => {
    const scan = await scanDart({});
    const viaCache = await lookupScanComp(DART_IDENTITY, "u1", { quickCompCache: async () => asCache(POLLUTED), collectionSales: async () => [], directory: INDEXED_DIRECTORY });
    const viaLive = await lookupScanComp(
      DART_IDENTITY,
      "u1",
      { quickCompCache: async () => null, collectionSales: async () => [], liveCache: async () => POLLUTED, directory: INDEXED_DIRECTORY },
      { query: scan.query },
    );
    const viaSaved = await lookupScanComp(DART_IDENTITY, "u1", {
      quickCompCache: async () => null,
      collectionSales: async () => [],
      soldCache: async () => POLLUTED.map((item) => ({ title: item.title, price: item.sale_price, soldAt: item.date_sold })),
      directory: INDEXED_DIRECTORY,
    });
    assert.ok(scan.comp.status === "ok");
    for (const comp of [viaCache, viaLive, viaSaved]) {
      assert.ok(comp.status === "ok", JSON.stringify(comp));
      assert.deepEqual(comp.sales, scan.comp.sales);
    }
  });

  it("a PSA 10 chip keeps only PSA 10 sales", async () => {
    const graded = [...POLLUTED, sold("2025 Panini Prizm Jaxson Dart #332 RC PSA 9", 60), sold("Jaxson Dart 2025 Prizm #332 BGS 10", 150), sold("2025 Prizm Jaxson Dart #332 PSA 10", 130)];
    const comp = await lookupScanComp({ ...DART_IDENTITY, grade: "PSA 10" }, "u1", {
      quickCompCache: async () => null,
      collectionSales: async () => [],
      liveCache: async () => graded,
      directory: INDEXED_DIRECTORY,
    }, { query: "q" });
    assert.ok(comp.status === "ok");
    assert.deepEqual(cents(comp), [13000, 14000]);
  });

  it("junk titles never count", () => {
    const junk = [
      "lot", "lots of 5", "bundle", "x2", "x3", "2x", "you pick", "pick your card", "choose your player", "complete set", "team set",
      "break spot", "random case hit", "reprint", "RP", "custom", "proxy", "digital",
    ].map((word, index) => sold(`2025 Panini Prizm Jaxson Dart #332 RC ${word}`, 5 + index));
    const kept = scanSalesFor({ playerName: "Jaxson Dart", cardNumber: "332", serialRun: null, yearLabel: "2025" }, { grade: "Raw" }, junk, INDEXED_DIRECTORY).kept;
    assert.deepEqual(kept.map((sale) => sale.title), []);
  });

  it("raw drops every grader, 'graded' and 'gem mint'", () => {
    const graded = ["PSA 10", "BGS 9.5", "SGC 10", "CGC 9", "CSG 10", "HGA 9", "TAG 10", "graded", "Gem Mint"].map((word) =>
      sold(`2025 Panini Prizm Jaxson Dart #332 RC ${word}`, 50),
    );
    const kept = scanSalesFor({ playerName: "Jaxson Dart", cardNumber: "332", serialRun: null, yearLabel: "2025" }, { grade: "Raw" }, graded, INDEXED_DIRECTORY).kept;
    assert.deepEqual(kept.map((sale) => sale.title), []);
  });

  it("a title naming any finish never lands in Base", () => {
    const finishes = ["Silver", "Refractor", "Holo", "Red Prizm", "Mojo", "Shimmer", "Wave", "Disco", "Hyper", "Cracked Ice", "Neon Green", "Camo"];
    const kept = scanSalesFor(
      { playerName: "Jaxson Dart", cardNumber: "332", serialRun: null, yearLabel: "2025" },
      { grade: "Raw" },
      finishes.map((word) => sold(`2025 Panini Prizm Jaxson Dart ${word} #332 RC`, 10)),
      INDEXED_DIRECTORY,
    ).kept;
    assert.equal(kept.length, finishes.length);
    for (const sale of kept) assert.notEqual(sale.parallel, "Base", sale.title);
  });

  it("outliers: with 3+ sales, over 4x or under 1/4 of the median is dropped", async () => {
    const results = [2.5, 2.8, 3.1, 3, 14].map((price, index) => sold(`2025 Panini Prizm Jaxson Dart #332 RC ${index}`, price, `2026-11-0${index + 1}`));
    const result = await scanDart({}, [...results, sold("2025 Panini Prizm Jaxson Dart #332 RC", 0.5, "2026-11-08")]);
    assert.ok(result.comp.status === "ok");
    assert.deepEqual(cents(result.comp), [250, 280, 300, 310]);
  });

  it("2 sales more than 10x apart: both show, but neither is a clean last sold", async () => {
    const result = await scanDart({}, [sold("2025 Panini Prizm Jaxson Dart #332 RC", 3, "2026-11-10"), sold("2025 Prizm Jaxson Dart #332 RC Giants", 45, "2026-11-12")]);
    assert.ok(result.comp.status === "ok");
    assert.equal(result.comp.sales.length, 2);
    assert.equal(result.comp.unclean, true);
    assert.equal(lastSale(result.comp), null, "Add card says 'Not enough clean sales yet'");
    assert.equal(COMP_COPY.notClean, "Not enough clean sales yet");
  });

  it("Miller /299 is unchanged: Pink/Red, the 3 Pink/Red sales", async () => {
    const result = await lookupLiveSolds({ capture: capture(FRONT, BACK), rows: [] }, "u1", deps(async () => ok(PINK_RED)));
    assert.equal(result.matches[0].parallel, "Pink/Red");
    assert.ok(result.comp.status === "ok");
    assert.deepEqual(cents(result.comp), [3499, 3600, 3800]);
    assert.equal(result.comp.unclean, undefined);
  });
});

describe("5b) the Base group holds only titles naming no parallel or finish", () => {
  const dart = { playerName: "Jaxson Dart", cardNumber: "332", serialRun: null, yearLabel: "2025" };

  it("a parallel with no color word (Choice Prizm, Zebra, Snakeskin...) is never Base", () => {
    // "Stars" counts only when the set's checklist lists it (and never "Dallas Stars"): see 5d.
    const names = ["Choice Prizm", "Zebra", "Tiger Stripe", "Tiger", "Snakeskin", "Nebula", "No Huddle", "Kaboom", "Vinyl", "Fast Break", "Blue Ice", "Ice"];
    for (const name of names) {
      const title = `2025 Panini Prizm Jaxson Dart #332 ${name}`;
      assert.notEqual(titleParallel(title, INDEXED_DIRECTORY, "Panini Prizm"), "Base", title);
      assert.notEqual(titleParallel(title, INDEXED_DIRECTORY), "Base", `${title} (no set)`);
    }
    assert.equal(titleParallel("2025 Panini Prizm Jaxson Dart #332 RC", INDEXED_DIRECTORY, "Panini Prizm"), "Base");
  });

  it("any parallel the set's checklist names is not Base, with the checklist's spelling", () => {
    assert.equal(titleParallel("2024 Bowman Chrome Prospects BCP-2 X Fractor", INDEXED_DIRECTORY, "Bowman Chrome"), "X-Fractor");
    assert.equal(titleParallel("2024 Bowman Chrome BCP-2 Speckle Refractor", INDEXED_DIRECTORY, "Bowman Chrome") === "Base", false);
    assert.equal(titleParallel("2024 Bowman Chrome BCP-2 Atomic", INDEXED_DIRECTORY, "Bowman Chrome"), "Atomic");
  });

  it("Choice and Fast Break sales are kept (not junk), outside Base; RPA and Breakaway are kept too", () => {
    const titles = [
      sold("2025 Panini Prizm Jaxson Dart #332 Choice Prizm", 20),
      sold("2025 Panini Prizm Jaxson Dart #332 Fast Break", 18),
      sold("2025 Panini Prizm Jaxson Dart #332 RPA", 300),
      sold("2025 Panini Prizm Jaxson Dart #332 Breakaway", 9),
    ];
    const kept = scanSalesFor(dart, { grade: "Raw", setBrand: "Panini Prizm" }, titles, INDEXED_DIRECTORY).kept;
    assert.deepEqual(kept.map((sale) => sale.price), [20, 18, 300, 9]);
    assert.notEqual(kept[0].parallel, "Base");
    assert.notEqual(kept[1].parallel, "Base");
  });
});

describe("5c) an X-Fractor after a one-digit card # is not '2x'", () => {
  const bcp2 = { playerName: "Aidan Miller", cardNumber: "BCP-2", serialRun: null, yearLabel: "2024" };

  it("BCP-2 X-Fractor and #2 X Fractor are kept; 2x, x2 and 2 x are still dropped", () => {
    const keep = [
      sold("2024 Bowman Chrome Prospects Aidan Miller BCP-2 X-Fractor", 15),
      sold("2024 Bowman Chrome Prospects Aidan Miller BCP-2 X Fractor", 16),
      sold("2024 Bowman Chrome Aidan Miller BCP-2 Xfractor", 17),
    ];
    const drop = [
      sold("2024 Bowman Chrome Aidan Miller BCP-2 2x", 8),
      sold("2024 Bowman Chrome Aidan Miller BCP-2 x2", 8),
      sold("2024 Bowman Chrome Aidan Miller BCP-2 2 x lot", 8),
      sold("2024 Bowman Chrome Aidan Miller BCP-2 2 x", 8),
    ];
    const kept = scanSalesFor(bcp2, { grade: "Raw", setBrand: "Bowman Chrome" }, [...keep, ...drop], INDEXED_DIRECTORY).kept;
    assert.deepEqual(kept.map((sale) => sale.price), [15, 16, 17]);
    for (const sale of kept) assert.equal(sale.parallel, "X-Fractor", sale.title);
  });

  it("#2 X Fractor on a card numbered 2", () => {
    const kept = scanSalesFor(
      { playerName: "Aidan Miller", cardNumber: "2", serialRun: null, yearLabel: "2024" },
      { grade: "Raw", setBrand: "Bowman Chrome" },
      [sold("2024 Bowman Chrome Aidan Miller #2 X Fractor", 15)],
      INDEXED_DIRECTORY,
    ).kept;
    assert.equal(kept.length, 1);
  });
});

describe("5d) base levels, team names and Stars are never parallels", () => {
  const base = (title: string, set: string, checklist?: readonly string[]) => titleParallel(title, INDEXED_DIRECTORY, set, checklist);

  it("Dallas Stars base is Base, even when the set's checklist lists Stars", () => {
    assert.equal(base("2023 Upper Deck Jason Robertson Dallas Stars #55", "Upper Deck"), "Base");
    assert.equal(base("2023 Upper Deck Jason Robertson Dallas Stars #55", "Upper Deck", ["Base", "Stars"]), "Base");
    assert.equal(base("1990 Upper Deck Mike Modano Minnesota North Stars #46", "Upper Deck", ["Base", "Stars"]), "Base");
  });

  it("a Prizm 'Stars' parallel is non-Base when the checklist lists it", () => {
    assert.notEqual(base("2025 Panini Prizm Jaxson Dart #332 Stars Prizm", "Panini Prizm", ["Base", "Stars", "Silver"]), "Base");
  });

  it("Optic Rated Rookie and Select's levels are Base", () => {
    assert.equal(base("2024 Donruss Optic Rated Rookie J.J. McCarthy #203", "Donruss Optic"), "Base");
    assert.equal(base("2024 Panini Select Premier Level Jaxson Dart #150", "Panini Select"), "Base");
    assert.equal(base("2024 Panini Select Concourse Jaxson Dart #50", "Panini Select"), "Base");
    assert.equal(base("2024 Panini Select Courtside Victor Wembanyama #200", "Panini Select"), "Base");
    assert.equal(base("2024 Panini Select Field Level Jaxson Dart #250", "Panini Select"), "Base");
    // A real parallel on a base level still isn't Base.
    assert.notEqual(base("2024 Panini Select Premier Level Jaxson Dart #150 Zebra", "Panini Select"), "Base");
    assert.notEqual(base("2024 Donruss Optic Rated Rookie J.J. McCarthy #203 Holo", "Donruss Optic"), "Base");
  });

  it("team names with color words aren't parallels: Tulane Green Wave, Red Sox, Green Bay", () => {
    assert.equal(base("2025 Panini Prizm Draft Picks Tulane Green Wave Jaxson Dart #332", "Panini Prizm"), "Base");
    assert.equal(base("2024 Topps Chrome Red Sox Roman Anthony #1", "Topps Chrome"), "Base");
    assert.equal(base("2024 Panini Prizm Green Bay Packers Jordan Love #10", "Panini Prizm"), "Base");
    assert.equal(base("2024 Panini Prizm Green Bay Packers Jordan Love #10 Red Wave", "Panini Prizm"), "Red Wave");
  });

  it("Gold Vinyl reads Gold Vinyl", () => {
    assert.equal(base("2025 Panini Prizm Jaxson Dart #332 Gold Vinyl 1/1", "Panini Prizm"), "Gold Vinyl");
  });

  it("Choice, Zebra and Snakeskin are still non-Base; BCP-2 X-Fractor is still kept", () => {
    for (const name of ["Choice Prizm", "Zebra", "Snakeskin"]) {
      assert.notEqual(base(`2025 Panini Prizm Jaxson Dart #332 ${name}`, "Panini Prizm"), "Base", name);
    }
    const kept = scanSalesFor(
      { playerName: "Aidan Miller", cardNumber: "BCP-2", serialRun: null, yearLabel: "2024" },
      { grade: "Raw", setBrand: "Bowman Chrome" },
      [sold("2024 Bowman Chrome Prospects Aidan Miller BCP-2 X-Fractor", 15)],
      INDEXED_DIRECTORY,
    ).kept;
    assert.equal(kept.length, 1);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CatalogCard } from "@/lib/card-catalog";
import type { TrawlSoldResult } from "@/lib/comps/types";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import type { CacheFn } from "@/lib/quick-comp/cache";
import type { QuickCompIdentity } from "@/lib/quick-comp/identity";
import { QUICK_COMP_DAILY_LIMIT } from "@/lib/quick-comp/limits";
import { lookupScanComp } from "./comp-lookup";
import { LIVE_SEARCH_DAYS, LIVE_SEARCH_MAX_PAGES, liveSearchKey, makeLiveCacheRead, makeLiveSearch } from "./live-search";
import { lookupLiveSolds, type LiveSoldsDeps, type LiveSoldsInput } from "./live-solds";
import { liveSearchQuery, type ScanMatch, type SoldTitle } from "./match";
import { scanReadFrom } from "./session";

/**
 * The live eBay lookup with fixture Trawl responses. Nothing here reaches Trawl
 * or eBay. Titles are made up, written like the ones Card Ladder showed.
 */

let nextId = 1;
function sold(title: string, price: number, date: string, grading?: { grader: string; grade: string }): TrawlSoldResult {
  const id = `fixture-${nextId++}`;
  return {
    title,
    sale_price: price,
    shipping_price: null,
    currency: "USD",
    condition: grading ? "Graded" : "Ungraded",
    condition_raw: null,
    date_sold: `${date}T18:00:00.000Z`,
    buying_format: "Auction",
    item_id: id,
    item_link: `https://example.test/item/${id}`,
    image_url: null,
    details: grading
      ? { grading: { graded: true, grader: grading.grader, grade: grading.grade, condition: null } }
      : { grading: { graded: false, grader: null, grade: null, condition: null } },
  };
}

type Calls = { searches: string[]; stored: { identity: QuickCompIdentity; prices: number[] }[]; cacheReads: QuickCompIdentity[] };

function deps(options: {
  live?: TrawlSoldResult[] | "daily" | "hourly" | "unavailable";
  saved?: SoldTitle[];
  quickCompCache?: (identity: QuickCompIdentity) => { comps: { soldPrice: number; soldDate: string }[]; fetchedAt: string } | null;
} = {}) {
  const calls: Calls = { searches: [], stored: [], cacheReads: [] };
  const value: LiveSoldsDeps = {
    directory: INDEXED_DIRECTORY,
    products: async () => [],
    cachedTitles: async () => options.saved ?? [],
    quickCompCache: async (identity) => {
      calls.cacheReads.push(identity);
      return options.quickCompCache?.(identity) ?? null;
    },
    liveSearch: async (query) => {
      calls.searches.push(query);
      const live = options.live ?? [];
      if (live === "daily" || live === "hourly") return { ok: false, reason: live, resetAt: "2026-11-13T00:00:00.000Z" };
      if (live === "unavailable") return { ok: false, reason: "unavailable" };
      return { ok: true, results: live, fetchedAt: "2026-11-12T16:00:00.000Z" };
    },
    storeQuickComp: async (identity, sales) => {
      calls.stored.push({ identity, prices: sales.map((sale) => sale.price) });
    },
  };
  return { value, calls };
}

function input(lines: string[], backLines: string[] | null = null, kind: "card" | "slab" | null = "card", rows: CatalogCard[] = []): LiveSoldsInput {
  return { capture: { lines, backLines, kind }, rows };
}

function line(match: Pick<ScanMatch, "yearLabel" | "setBrand" | "cardNumber"> | undefined) {
  if (!match) return "";
  return [match.yearLabel, match.setBrand, match.cardNumber ? `#${match.cardNumber}` : ""].filter(Boolean).join(" ");
}

function row(partial: Partial<CatalogCard> & Pick<CatalogCard, "id" | "playerName">): CatalogCard {
  return { yearLabel: "", setBrand: "", cardNumber: "", sport: "Football", parallel: "Base", isRookie: false, ...partial };
}

const MILLER_FRONT = ["3B", "1ST BOWMAN", "PHILADELPHIA PHILLIES", "137/299", "AIDAN MILLER", "B"];
const MILLER_BACK = ["AIDAN MILLER", "PHILADELPHIA PHILLIES - 3B", "BP-27", "© 2024 THE TOPPS COMPANY, INC."];
const DART_FRONT = ["JAXSON DART", "GIANTS", "QB", "RC", "121/199"];
const VJ_FRONT = ["VJ EDGECOMBE", "ROOKIE", "INSTINCT", "28/99"];
const MCCARTHY_FRONT = ["J.J. MCCARTHY", "VIKINGS", "RATED ROOKIE"];
const MCCARTHY_BACK = ["#303", "J.J. MCCARTHY", "QUARTERBACK", "© 2024 Panini America, Inc."];

describe("live eBay solds: the four Nov 12 misses, empty cache", () => {
  it("Aidan Miller: 2024 Bowman #BP-27, magenta from the sold titles, and the last sold", async () => {
    const { value, calls } = deps({
      live: [
        sold("2024 Bowman 1st Aidan Miller Magenta /299 #BP-27 Phillies", 38, "2026-11-01"),
        sold("Aidan Miller 2024 Bowman 1st Prospect Magenta 41/299 BP-27", 42, "2026-10-20"),
        sold("2024 Bowman Aidan Miller #BP-27 1st Bowman Base", 4, "2026-10-28"),
      ],
    });
    const result = await lookupLiveSolds(input(MILLER_FRONT, MILLER_BACK), "u1", value);
    // The first rung of the ladder found the sales: no '#', no year (eBay titles often skip them).
    assert.deepEqual(calls.searches, ["Aidan Miller Bowman BP-27 /299"]);
    for (const match of result.matches) assert.equal(match.playerName, "Aidan Miller");
    const top = result.matches[0];
    assert.equal(line(top), "2024 Bowman #BP-27");
    assert.equal(top.parallel, "Magenta");
    assert.equal(result.comp.status, "ok");
    assert.ok(result.comp.status === "ok");
    assert.deepEqual(result.comp.sales.map((sale) => sale.priceCents), [3800, 4200], "the /299 magenta sales only, newest first");
    assert.equal(result.comp.source, "live");
  });

  it("Jaxson Dart: a logo-only Mosaic is found from the sold titles, with the $45 Aug 5 sale", async () => {
    const { value, calls } = deps({
      live: [
        sold("Jaxson Dart /199 Rookie 2025 Panini Mosaic - Orange Prizm #362 RC Giants", 45, "2026-08-05"),
        sold("2025 Panini Mosaic Jaxson Dart Orange Prizm 88/199 #362 Rookie", 52, "2026-08-20"),
        sold("2025 Panini Prizm Jaxson Dart Orange /199 #332", 60, "2026-08-22"),
      ],
    });
    const rows = [
      row({ id: "dart-prizm", playerName: "Jaxson Dart", yearLabel: "2025", setBrand: "Panini Prizm", cardNumber: "332", isRookie: true }),
      row({ id: "dart-chrome", playerName: "Jaxson Dart", yearLabel: "2025", setBrand: "Topps Chrome", cardNumber: "306", isRookie: true }),
    ];
    const result = await lookupLiveSolds(input(DART_FRONT, null, "card", rows), "u1", value);
    assert.deepEqual(calls.searches, ["Jaxson Dart /199"], "only what the card showed, not the catalog's guess");
    const top = result.matches[0];
    assert.equal(line(top), "2025 Panini Mosaic #362");
    assert.equal(top.parallel, "Orange");
    assert.ok(result.comp.status === "ok");
    assert.deepEqual(
      result.comp.sales.map((sale) => [sale.priceCents, sale.soldAt?.slice(0, 10)]),
      [
        [5200, "2026-08-20"],
        [4500, "2026-08-05"],
      ],
    );
  });

  it("VJ Edgecombe: Topps Chrome Instinct Green /99, and its last sold", async () => {
    const { value, calls } = deps({
      live: [
        sold("2025-26 Topps Chrome VJ Edgecombe Instinct Green Refractor /99 #INS-7 RC 76ers", 120, "2026-10-30"),
        sold("VJ Edgecombe 2025-26 Topps Chrome Instinct Green 61/99 Rookie #INS-7", 110, "2026-10-12"),
      ],
    });
    const result = await lookupLiveSolds(input(VJ_FRONT), "u1", value);
    assert.deepEqual(calls.searches, ["VJ Edgecombe Instinct /99"]);
    const top = result.matches[0];
    assert.equal(line(top), "2025-26 Topps Chrome #INS-7");
    assert.equal(top.parallel, "Instinct Green");
    assert.equal(top.serialRun, 99);
    assert.equal(result.comp.status, "ok");
  });

  it("Jaylen Brown: Topps Now from the sold titles when only the logo shows", async () => {
    const { value } = deps({
      live: [
        sold("2024 Topps Now Jaylen Brown #NBA-12 Finals MVP Celtics", 14, "2026-06-20"),
        sold("Jaylen Brown 2024 Topps Now NBA-12 Finals MVP", 12, "2026-06-25"),
      ],
    });
    const rows = [row({ id: "jb-topps", playerName: "Jaylen Brown", sport: "Basketball", yearLabel: "2024-25", setBrand: "Topps", cardNumber: "12" })];
    const result = await lookupLiveSolds(input(["JAYLEN BROWN", "CELTICS"], null, "card", rows), "u1", value);
    assert.equal(result.matches[0]?.setBrand, "Topps Now");
    assert.equal(result.matches[0]?.cardNumber, "NBA-12");
    assert.equal(result.comp.status, "ok");
  });
});

describe("live eBay solds: never invent a set or a price", () => {
  it("a logo-only Mosaic with no live titles and no cache: no set, no price", async () => {
    const { value } = deps({ live: [] });
    const result = await lookupLiveSolds(input(DART_FRONT), "u1", value);
    // The printed name shows, with no set, no number and no price invented.
    assert.equal(result.matches[0]?.playerName, "Jaxson Dart");
    assert.equal(result.matches[0]?.setBrand, "");
    assert.equal(result.matches[0]?.cardNumber, "");
    assert.deepEqual(result.comp, { status: "none", searched: true });
  });

  it("J.J. McCarthy: Optic Preview Pink titles beat a plain Donruss Base, offered to tap, never auto-picked", async () => {
    const { value } = deps({
      live: [
        sold("2024 Panini Donruss Optic Preview Pink J.J. McCarthy #303 RC Vikings", 22, "2026-11-02"),
        sold("J.J. McCarthy 2024 Donruss Optic Preview Pink #303 Rated Rookie", 19, "2026-10-25"),
        sold("2024 Donruss Optic Preview J.J. McCarthy Pink Rated Rookie #303", 24, "2026-10-18"),
      ],
    });
    const rows = [row({ id: "jj-donruss", playerName: "J.J. McCarthy", yearLabel: "2024", setBrand: "Panini Donruss", cardNumber: "303", isRookie: true })];
    const result = await lookupLiveSolds(input(MCCARTHY_FRONT, MCCARTHY_BACK, "card", rows), "u1", value);
    const top = result.matches[0];
    // Card-page comps read Optic Preview on a Donruss card as a parallel, not the Optic set.
    assert.equal(line(top), "2024 Panini Donruss #303");
    // Unnumbered: sold titles never pick the parallel (a base can look like its parallels). No Base
    // sales came back, so none is priced as Base, and Optic Preview Pink is one tap away.
    assert.equal(top.parallel, "");
    assert.equal(top.catalogId, "jj-donruss");
    assert.ok(result.comp.status === "split");
    assert.equal(result.comp.missing, "Base");
    assert.deepEqual(result.comp.groups.map((group) => [group.label, group.nSales]), [["Optic Preview Pink", 3]]);
  });

  it("J.J. McCarthy with no titles: no set invented, no price", async () => {
    const { value } = deps({ live: [] });
    const result = await lookupLiveSolds(input(MCCARTHY_FRONT, MCCARTHY_BACK), "u1", value);
    const top = result.matches[0];
    assert.equal(top?.playerName, "J.J. McCarthy");
    assert.equal(top?.setBrand, "", "the card printed no set word");
    assert.deepEqual(result.comp, { status: "none", searched: true });
  });

  it("never searches without a player name", async () => {
    const { value, calls } = deps({ live: [sold("2024 Bowman Aidan Miller #BP-27", 5, "2026-11-01")] });
    const result = await lookupLiveSolds(input(["1ST BOWMAN", "PHILADELPHIA PHILLIES", "137/299"]), "u1", value);
    assert.deepEqual(calls.searches, []);
    assert.deepEqual(result.matches, []);
    assert.deepEqual(result.comp, { status: "none" });
  });

  it("keeps the printed player on every row, whatever the titles say", async () => {
    const { value } = deps({ live: [sold("2024 Bowman Scott Daly #BP-27 /299", 9, "2026-11-01")] });
    const result = await lookupLiveSolds(input(MILLER_FRONT, MILLER_BACK), "u1", value);
    for (const match of result.matches) assert.equal(match.playerName, "Aidan Miller");
    assert.deepEqual(result.comp, { status: "none", searched: true });
  });
});

describe("live eBay solds: cache first", () => {
  const SLAB = ["PSA", "2018 PANINI PRIZM", "#280", "LUKA DONCIC", "SILVER PRIZM", "GEM MT 10", "45678912"];

  it("a Quick Comp cache hit shows those sales: no Trawl call, no cap spent", async () => {
    const { value, calls } = deps({
      live: "daily",
      quickCompCache: () => ({
        // Quick Comp stores each sale's title; the scan cleans them like a live search.
        comps: [
          { soldPrice: 900, soldDate: "2026-11-01", title: "2018 Panini Prizm Luka Doncic Silver Prizm #280 PSA 10" },
          { soldPrice: 950, soldDate: "2026-11-03", title: "2018 Panini Prizm Luka Doncic Silver #280 PSA 10 Gem Mint" },
          { soldPrice: 1000, soldDate: "2026-11-05", title: "Luka Doncic 2018 Prizm Silver Prizm #280 RC PSA 10" },
        ],
        fetchedAt: "2026-11-06T00:00:00.000Z",
      }),
    });
    const result = await lookupLiveSolds(input(SLAB, null, "slab"), "u1", value);
    assert.deepEqual(calls.searches, []);
    assert.equal(calls.cacheReads[0]?.grade, "PSA 10");
    assert.ok(result.comp.status === "ok" && result.comp.source === "quick-comp");
  });

  it("saved sold listings for the exact card count too, with no Trawl call", async () => {
    const { value, calls } = deps({
      saved: [
        { title: "2018 Panini Prizm Luka Doncic Silver Prizm #280 PSA 10", price: 1200, soldAt: "2026-11-01", grader: "PSA", grade: "10" },
        { title: "2018 Panini Prizm Luka Doncic Silver #280 PSA 10 Gem Mint", price: 1150, soldAt: "2026-10-20", grader: "PSA", grade: "10" },
      ],
    });
    const result = await lookupLiveSolds(input(SLAB, null, "slab"), "u1", value);
    assert.deepEqual(calls.searches, []);
    assert.ok(result.comp.status === "ok" && result.comp.source === "sold-cache");
  });

  it("doesn't trust a cached price for a card the scan didn't pin down: Dart goes live", async () => {
    const { value, calls } = deps({
      quickCompCache: () => ({ comps: [{ soldPrice: 5, soldDate: "2026-11-01" }], fetchedAt: "2026-11-01T00:00:00.000Z" }),
      live: [],
    });
    const rows = [row({ id: "dart-prizm", playerName: "Jaxson Dart", yearLabel: "2025", setBrand: "Panini Prizm", cardNumber: "332" })];
    await lookupLiveSolds(input(DART_FRONT, null, "card", rows), "u1", value);
    assert.deepEqual(calls.cacheReads, [], "Prizm #332 was only a catalog guess");
    assert.equal(calls.searches.length, 1);
  });

  it("stores the live sales in Quick Comp's shared cache for the next scan", async () => {
    const { value, calls } = deps({
      live: [sold("2024 Bowman 1st Aidan Miller Magenta /299 #BP-27", 38, "2026-11-01")],
    });
    await lookupLiveSolds(input(MILLER_FRONT, MILLER_BACK), "u1", value);
    assert.equal(calls.stored.length, 1);
    assert.equal(calls.stored[0].identity.setBrand, "Bowman");
    assert.equal(calls.stored[0].identity.cardNumber, "BP-27");
    assert.deepEqual(calls.stored[0].prices, [38]);
  });
});

describe("live eBay solds: caps and failures", () => {
  it("the daily cap: the identity shows, the cap message, no price", async () => {
    const { value } = deps({ live: "daily" });
    const result = await lookupLiveSolds(input(MILLER_FRONT, MILLER_BACK), "u1", value);
    assert.equal(line(result.matches[0]), "2024 Bowman #BP-27");
    assert.deepEqual(result.comp, { status: "limited", reason: "daily", resetAt: "2026-11-13T00:00:00.000Z" });
  });

  it("the hourly cap says so too", async () => {
    const { value } = deps({ live: "hourly" });
    const result = await lookupLiveSolds(input(MILLER_FRONT, MILLER_BACK), "u1", value);
    assert.equal(result.comp.status, "limited");
    assert.ok(result.comp.status === "limited" && result.comp.reason === "hourly");
  });

  it("Trawl failing or timing out: the identity shows, prices honestly unavailable", async () => {
    const { value } = deps({ live: "unavailable" });
    const result = await lookupLiveSolds(input(MILLER_FRONT, MILLER_BACK), "u1", value);
    assert.equal(result.matches[0]?.playerName, "Aidan Miller");
    assert.deepEqual(result.comp, { status: "unavailable" });
  });
});

describe("live eBay solds: raw and graded never mix", () => {
  const RESULTS = [
    sold("2024 Bowman 1st Aidan Miller Magenta /299 #BP-27", 40, "2026-11-01"),
    sold("2024 Bowman 1st Aidan Miller Magenta /299 #BP-27 PSA 10", 300, "2026-11-02", { grader: "PSA", grade: "10" }),
    sold("2024 Bowman 1st Aidan Miller Magenta /299 #BP-27 PSA 9", 90, "2026-11-03", { grader: "PSA", grade: "9" }),
  ];

  it("a raw card shows raw sales only", async () => {
    const { value } = deps({ live: RESULTS });
    const result = await lookupLiveSolds(input(MILLER_FRONT, MILLER_BACK), "u1", value);
    assert.ok(result.comp.status === "ok");
    assert.deepEqual(result.comp.sales.map((sale) => sale.priceCents), [4000]);
  });

  it("a PSA 9 slab shows PSA 9 sales only", async () => {
    const { value } = deps({ live: RESULTS });
    const slab = ["PSA", "2024 BOWMAN", "#BP-27", "AIDAN MILLER", "MAGENTA", "MINT 9", "12345678"];
    const result = await lookupLiveSolds(input(slab, null, "slab"), "u1", value);
    assert.equal(result.matches[0]?.grade?.number, "9");
    assert.ok(result.comp.status === "ok");
    assert.deepEqual(result.comp.sales.map((sale) => sale.priceCents), [9000]);
  });

  it("saved listings follow the same rule: a slab never shows a raw $3.25", async () => {
    const identity: QuickCompIdentity = {
      playerName: "Aidan Miller",
      year: 2024,
      yearLabel: "2024",
      setBrand: "Bowman",
      cardNumber: "BP-27",
      parallel: "Base",
      grade: "PSA 9",
    };
    const saved: SoldTitle[] = [
      { title: "2024 Bowman Aidan Miller #BP-27", price: 3.25, soldAt: "2026-11-01" },
      { title: "2024 Bowman Aidan Miller #BP-27 PSA 10", price: 60, soldAt: "2026-11-02", grader: "PSA", grade: "10" },
    ];
    const result = await lookupScanComp(identity, "viewer", { quickCompCache: async () => null, collectionSales: async () => [], soldCache: async () => saved });
    assert.deepEqual(result, { status: "none" });
  });
});

describe("the live search itself", () => {
  function memoryCache() {
    const store = new Map<string, unknown>();
    const cache: CacheFn = (load, keyParts) => async () => {
      const key = keyParts.join("|");
      if (store.has(key)) return store.get(key) as Awaited<ReturnType<typeof load>>;
      const value = await load();
      store.set(key, value);
      return value;
    };
    return { cache, store };
  }

  function search(options: { daily?: boolean; hourly?: boolean; fail?: boolean; source?: string } = {}) {
    const { cache, store } = memoryCache();
    const spent: string[] = [];
    const fetched: { query: string; options: { days: number; maxPages: number } }[] = [];
    const run = makeLiveSearch({
      source: () => options.source ?? "trawl",
      hasTrawlKey: () => true,
      fetchSold: async (query, opts) => {
        fetched.push({ query, options: opts });
        return options.fail ? { ok: false } : { ok: true, body: { results: [sold("2025 Panini Mosaic Jaxson Dart #362", 45, "2026-08-05")] } };
      },
      limits: {
        consumeDaily: async () => (spent.push("daily"), options.daily !== false),
        consumeHourly: async () => (spent.push("hourly"), options.hourly !== false),
      },
      cache,
      now: () => Date.parse("2026-11-12T16:00:00.000Z"),
    });
    return { run, spent, fetched, store, cache };
  }

  it("is Quick Comp's shape: one page, details, the last 90 days", async () => {
    const { run, fetched, spent } = search();
    const result = await run("Jaxson Dart /199", "u1");
    assert.ok(result.ok);
    assert.deepEqual(fetched, [{ query: "Jaxson Dart /199", options: { days: 90, maxPages: 1 } }]);
    assert.equal(LIVE_SEARCH_DAYS, 90);
    assert.equal(LIVE_SEARCH_MAX_PAGES, 1);
    assert.deepEqual(spent, ["daily", "hourly"], "the daily cap, then the shared hourly Trawl cap");
    assert.equal(QUICK_COMP_DAILY_LIMIT, 10, "the cap isn't raised here");
  });

  it("the same search again is free: no cap, no Trawl", async () => {
    const { run, fetched, spent } = search();
    await run("Jaxson Dart /199", "u1");
    await run("jaxson  dart /199", "u2");
    assert.equal(fetched.length, 1);
    assert.equal(spent.length, 2);
  });

  it("a cap stops it before Trawl", async () => {
    const { run, fetched } = search({ daily: false });
    const result = await run("Jaxson Dart /199", "u1");
    assert.ok(!result.ok && result.reason === "daily");
    assert.equal(fetched.length, 0);
    const hourly = search({ hourly: false });
    const second = await hourly.run("Jaxson Dart /199", "u1");
    assert.ok(!second.ok && second.reason === "hourly");
    assert.equal(hourly.fetched.length, 0);
  });

  it("a Trawl failure is unavailable and isn't cached", async () => {
    const { run, store } = search({ fail: true });
    assert.deepEqual(await run("Jaxson Dart /199", "u1"), { ok: false, reason: "unavailable" });
    assert.equal(store.size, 0);
  });

  it("never searches in sample or off mode", async () => {
    const { run, fetched, spent } = search({ source: "sample" });
    assert.deepEqual(await run("Jaxson Dart /199", "u1"), { ok: false, reason: "unavailable" });
    assert.equal(fetched.length + spent.length, 0);
  });

  it("another parallel on the sheet reads the same search from the cache, never Trawl", async () => {
    const { run, cache } = search();
    await run("Jaxson Dart /199", "u1");
    const read = makeLiveCacheRead(cache);
    assert.equal((await read("Jaxson Dart /199"))?.length, 1);
    assert.equal(await read("Someone Else"), null);
    assert.equal(liveSearchKey(" Jaxson  DART /199 "), "scan-live-v1|jaxson dart /199");
  });
});

describe("liveSearchQuery", () => {
  it("uses only what the card backed", () => {
    const read = scanReadFrom({ lines: MILLER_FRONT, backLines: MILLER_BACK, image: null, kind: "card" }, INDEXED_DIRECTORY);
    // BP- is a Bowman-only code: Bowman goes in the search, never on the sheet by itself.
    assert.equal(liveSearchQuery(read, null, INDEXED_DIRECTORY), "Aidan Miller Bowman BP-27 /299");
  });
});

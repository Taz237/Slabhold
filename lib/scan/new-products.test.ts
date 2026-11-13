import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { soldNotice, soldNoticeTitle, respondSoldComps, SOLD_NEEDS_NUMBER_MESSAGE, SOLD_UNAVAILABLE_MESSAGE, type SoldCompsLoaders } from "@/lib/comps/sold-response";
import type { TrawlSoldResult } from "@/lib/comps/types";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import { COMP_COPY } from "./comp";
import { comparableSales, ESTIMATE_MAX_CALLS, estimateFrom, estimateQueries, yearAgoParallels } from "./estimate";
import { parallelStillOpen, scanHandoffFrom } from "./handoff";
import { makeLiveSearch, newLookupBudget, MAX_LOOKUP_CALLS } from "./live-search";
import { lookupLiveSolds, type LiveSearchResult, type LiveSoldsDeps } from "./live-solds";
import { liveSearchLadder, rankScanMatches, yearBefore, type ScanMatch } from "./match";
import { readRawCardText } from "./raw-text";
import { schoolOnLine } from "./schools";
import { scanReadFrom } from "./session";

/**
 * Brand-new products with no sales yet: Donnie's two device misses (a 2026 Bowman U Chrome
 * 1st Bowman /10 and a 2026 Topps Inception rookie auto variation). Made-up sales throughout.
 */

const KNIGHT_FRONT = ["BOWMAN", "1ST", "WAYNE KNIGHT", "RB", "03/10"];
const KNIGHT_BACK = [
  "BCP-68",
  "RUNNING BACK",
  "WAYNE KNIGHT",
  "UCLA",
  "© 2026 THE TOPPS COMPANY, INC. ALL RIGHTS RESERVED.",
  "TOPPS AND BOWMAN CHROME ARE REGISTERED TRADEMARKS OF THE TOPPS COMPANY, INC.",
  "WWW.TOPPS.COM",
  "CMP#148134",
];
const LEMON_FRONT = ["INCEPTION", "MAKAI LEMON", "PHILADELPHIA EAGLES", "WR", "RC", "TOPPS CERTIFIED AUTOGRAPH ISSUE"];
const LEMON_BACK = ["RAV-ML", "INCEPTION", "MAKAI LEMON", "ROOKIE AUTOGRAPH VARIATIONS CARD", "FROM 2026 TOPPS INCEPTION FOOTBALL", "© 2026 THE TOPPS COMPANY, INC."];

function top(lines: string[], backLines: string[] | null, soldTitles: { title: string; price: number }[] = []): ScanMatch | undefined {
  const read = scanReadFrom({ lines, backLines, image: null, kind: "card", border: null }, INDEXED_DIRECTORY);
  return rankScanMatches(read, [], { directory: INDEXED_DIRECTORY, products: null, soldTitles }).matches[0];
}

describe("a position or a school is never the player", () => {
  it("skips RUNNING BACK and takes the name beside it, title-cased and marked new to us", () => {
    for (const back of [KNIGHT_BACK, ["RUNNING BACK", "WAYNE KNIGHT", "UCLA", "BCP-68", "© 2026 THE TOPPS COMPANY"]]) {
      const match = top(["1ST BOWMAN", "03/10"], back);
      assert.equal(match?.playerName, "Wayne Knight");
      assert.equal(match?.playerNew, true);
      assert.equal(match?.sport, "Football");
    }
  });

  it("never names a player from position words, long or short", () => {
    for (const line of ["RUNNING BACK", "QUARTERBACK", "WIDE RECEIVER", "TIGHT END", "DEFENSIVE END", "POINT GUARD", "RB", "QB", "WR", "TE", "INF", "OF", "SS", "C-1B", "P", "LEFT WING"]) {
      const read = readRawCardText([line, "UCLA", "© 2026 THE TOPPS COMPANY"], INDEXED_DIRECTORY, { side: "back" });
      assert.equal(read.printedName, "", line);
      assert.deepEqual(read.players, [], line);
    }
  });

  it("only a position and a school: no player, no match", () => {
    assert.equal(top(["BOWMAN", "1ST"], ["QUARTERBACK", "ALABAMA", "© 2026 THE TOPPS COMPANY"]), undefined);
  });

  it("prefers the name beside the position or team line over another name-like line", () => {
    const read = readRawCardText(["GOLDEN ARM", "HT 6-2 WT 205", "WIDE RECEIVER", "JORDAN TESTMAN", "ALABAMA"], INDEXED_DIRECTORY, { side: "back" });
    assert.equal(read.printedName, "Jordan Testman");
  });

  it("reads a school as the team, with or without its nickname, and never a pro team's city", () => {
    assert.equal(schoolOnLine("UCLA"), "UCLA");
    assert.equal(schoolOnLine("UCLA BRUINS"), "UCLA");
    assert.equal(schoolOnLine("OHIO STATE"), "Ohio State");
    assert.equal(schoolOnLine("WAYNE KNIGHT"), "");
    assert.equal(readRawCardText(["HOUSTON TEXANS"], INDEXED_DIRECTORY).school, "");
    assert.equal(readRawCardText(["ALABAMA"], INDEXED_DIRECTORY).school, "Alabama");
  });
});

describe("Bowman U Chrome is named by the card, never by a maker word", () => {
  it("the Chrome trademark line, a BCP code and a school: Bowman U Chrome, not Bowman", () => {
    const match = top(KNIGHT_FRONT, KNIGHT_BACK);
    assert.equal(match?.setBrand, "Bowman U Chrome");
    assert.equal(match?.yearLabel, "2026");
    assert.equal(match?.cardNumber, "BCP-68");
    assert.equal(match?.serialRun, 10);
    assert.equal(match?.firstBowman, true);
    assert.equal(match?.parallel, "");
  });

  it("a Bowman U or Bowman Chrome U logo read names it", () => {
    for (const logo of ["BOWMAN U", "BOWMAN CHROME U", "BOWMAN UNIVERSITY CHROME"]) {
      assert.equal(top([logo, "WAYNE KNIGHT", "03/10"], ["WAYNE KNIGHT", "RUNNING BACK", "BCP-68", "© 2026 THE TOPPS COMPANY"])?.setBrand, "Bowman U Chrome", logo);
    }
  });

  it("a pro Bowman card with a BCP code is not Bowman U: no school, so the old rule holds", () => {
    const match = top(["1ST BOWMAN", "ETHAN SALAS", "SAN DIEGO PADRES"], ["ETHAN SALAS", "BCP-103", "© 2024 THE TOPPS COMPANY, INC."]);
    assert.equal(match?.setBrand, "Bowman");
    assert.notEqual(match?.setBrand, "Bowman U Chrome");
  });

  it("the word CHROME alone never guesses Bowman U Chrome, and a maker word alone names no set", () => {
    assert.ok(!readRawCardText(["CHROME", "JOSH ALLEN"], INDEXED_DIRECTORY).setNames.includes("Bowman U Chrome"));
    assert.deepEqual(readRawCardText(["WAYNE KNIGHT", "© 2026 THE TOPPS COMPANY", "WWW.TOPPS.COM"], INDEXED_DIRECTORY, { side: "back" }).setNames, []);
  });
});

describe("checklist codes, autographs and variations", () => {
  it("reads RAV-ML as the card # because ML is the player's initials, and never the SKU", () => {
    const lemon = top(LEMON_FRONT, LEMON_BACK);
    assert.equal(lemon?.cardNumber, "RAV-ML");
    assert.equal(lemon?.sureness.number, "sure");
    const knight = top(KNIGHT_FRONT, KNIGHT_BACK);
    assert.doesNotMatch(JSON.stringify(knight), /148134/);
  });

  it("a letter code that isn't the player's initials is never the card #", () => {
    const match = top(LEMON_FRONT, ["RAV-XZ", "INCEPTION", "MAKAI LEMON", "FROM 2026 TOPPS INCEPTION FOOTBALL"]);
    assert.equal(match?.cardNumber, "");
  });

  it("marks the autograph, the rookie and the subset, and never Base", () => {
    const match = top(LEMON_FRONT, LEMON_BACK);
    assert.equal(match?.isAuto, true);
    assert.equal(match?.isRookie, true);
    assert.equal(match?.subset, "Rookie Autograph Variations");
    assert.equal(match?.setBrand, "Topps Inception");
    assert.equal(match?.yearLabel, "2026");
    assert.equal(match?.parallel, "");
    assert.ok(!match?.parallelOptions.some((option) => option.name === "Base"));
  });

  it("legal autograph text is not the subset", () => {
    assert.equal(readRawCardText(["TOPPS CERTIFIED AUTOGRAPH ISSUE"], INDEXED_DIRECTORY).subset, "");
    assert.equal(readRawCardText(["ROOKIE AUTOGRAPH VARIATIONS CARD"], INDEXED_DIRECTORY).subset, "Rookie Autograph Variations");
  });

  it("sold titles that agree name the color; one title that disagrees leaves it open", () => {
    const green = [
      { title: "Makai Lemon 2026 Topps Inception Variation Green Rookie RC Auto #RAV-ML", price: 310 },
      { title: "2026 Topps Inception Makai Lemon Green Rookie Auto Variation RAV-ML", price: 285 },
    ];
    assert.equal(top(LEMON_FRONT, LEMON_BACK, green)?.parallel, "Green");
    const mixed = [green[0], { title: "2026 Topps Inception Makai Lemon Purple Rookie Auto Variation RAV-ML", price: 400 }];
    assert.equal(top(LEMON_FRONT, LEMON_BACK, mixed)?.parallel, "");
  });

  it("an open parallel on an auto, a variation or a numbered card is never auto-saved as Base", () => {
    const lemon = top(LEMON_FRONT, LEMON_BACK)!;
    assert.equal(parallelStillOpen(lemon), true);
    assert.equal(scanHandoffFrom(lemon, "scan-1", { autoSave: true }).autoSave, false);
    assert.equal(scanHandoffFrom({ ...lemon, parallel: "Green" }, "scan-1", { autoSave: true }).autoSave, true);
    assert.equal(parallelStillOpen({ parallel: "", isAuto: false, serialRun: null }), false);
  });

  it("searches an autograph the way sellers list it", () => {
    const read = scanReadFrom({ lines: LEMON_FRONT, backLines: LEMON_BACK, image: null, kind: "card", border: null }, INDEXED_DIRECTORY);
    assert.equal(liveSearchLadder(read, top(LEMON_FRONT, LEMON_BACK), INDEXED_DIRECTORY)[0], "Makai Lemon Inception RAV-ML auto");
  });
});

function sold(title: string, price: number, soldAt = "2026-10-01"): TrawlSoldResult {
  return {
    title,
    sale_price: price,
    shipping_price: null,
    currency: "USD",
    condition: "Ungraded",
    condition_raw: null,
    date_sold: `${soldAt}T18:00:00.000Z`,
    buying_format: "Auction",
    item_id: title,
    item_link: "",
    image_url: null,
    details: null,
  } as TrawlSoldResult;
}

const KNIGHT_CARD = { playerName: "Wayne Knight", sport: "Football", yearLabel: "2026", setBrand: "Bowman U Chrome", serialRun: 10, parallel: "", isAuto: false, isRookie: false, firstBowman: true };
const YEAR_AGO = [
  sold("2025 Bowman U Chrome Arch Manning 1st Bowman Black /10 Texas", 900, "2026-10-20"),
  sold("2025 Bowman Chrome University Jeremiah Smith 1st Sapphire Black 04/10", 700, "2026-10-12"),
  sold("2025 Bowman U Chrome Ryan Williams 1st Bowman Gold Wave /10 Alabama", 300, "2026-10-05"),
  sold("2025 Bowman U Chrome Arch Manning 1st Bowman Black /10", 950, "2026-09-28"),
  // Not comparable: graded, a lot, another run, an auto, another year, another product, no player we know.
  sold("2025 Bowman U Chrome Arch Manning 1st Black /10 PSA 10", 4000),
  sold("2025 Bowman U Chrome 1st Bowman /10 lot of 3 Arch Manning", 2000),
  sold("2025 Bowman U Chrome Arch Manning 1st Bowman Gold /50", 250),
  sold("2025 Bowman U Chrome Arch Manning 1st Bowman Auto /10", 5000),
  sold("2024 Bowman U Chrome Arch Manning 1st Bowman /10", 600),
  sold("2025 Bowman Chrome Arch Manning 1st /10", 800),
  sold("2025 Bowman U Chrome Basketball Cooper Flagg 1st Bowman /10 Duke", 3000),
  sold("2025 Bowman U Chrome 1st Bowman Black Refractor /10", 5),
];

describe("the estimate from similar cards", () => {
  it("is last year's same product and run, raw, same flags, players we know, never this player", () => {
    const sales = comparableSales(KNIGHT_CARD, YEAR_AGO, INDEXED_DIRECTORY);
    assert.deepEqual(sales.map((sale) => sale.price), [900, 700, 300, 950]);
    assert.ok(sales.every((sale) => sale.player !== "Wayne Knight"));
    const own = comparableSales({ ...KNIGHT_CARD, playerName: "Arch Manning" }, YEAR_AGO, INDEXED_DIRECTORY);
    assert.ok(own.every((sale) => sale.player !== "Arch Manning"));
  });

  it("gives the median, the range and three example sales with player names, labelled by what was compared", () => {
    const estimate = estimateFrom(KNIGHT_CARD, comparableSales(KNIGHT_CARD, YEAR_AGO, INDEXED_DIRECTORY));
    assert.ok(estimate);
    assert.equal(estimate.nSales, 4);
    assert.equal(estimate.medianCents, 80000);
    assert.equal(estimate.lowCents, 30000);
    assert.equal(estimate.highCents, 95000);
    assert.deepEqual(estimate.examples.map((sale) => sale.player), ["Arch Manning", "Jeremiah Smith", "Ryan Williams"]);
    assert.equal(estimate.basis, "2025 Bowman U Chrome /10 1st Bowman");
  });

  it("offers last year's parallels at the same run as quick picks, most sold first", () => {
    assert.deepEqual(yearAgoParallels(KNIGHT_CARD, comparableSales(KNIGHT_CARD, YEAR_AGO, INDEXED_DIRECTORY)), ["Black", "Sapphire Black", "Gold Wave"]);
    assert.deepEqual(yearAgoParallels({ ...KNIGHT_CARD, parallel: "Black" }, comparableSales(KNIGHT_CARD, YEAR_AGO, INDEXED_DIRECTORY)), []);
  });

  it("needs three sales: fewer is no estimate, never a number from one or two", () => {
    assert.equal(estimateFrom(KNIGHT_CARD, comparableSales(KNIGHT_CARD, YEAR_AGO.slice(0, 2), INDEXED_DIRECTORY)), null);
  });

  it("searches last year's product at most twice, and never for a plain base card", () => {
    assert.deepEqual(estimateQueries(KNIGHT_CARD), ["2025 Bowman U Chrome /10 1st"]);
    assert.deepEqual(estimateQueries({ ...KNIGHT_CARD, parallel: "Black" }), ["2025 Bowman U Chrome Black /10 1st", "2025 Bowman U Chrome /10 1st"]);
    assert.deepEqual(
      estimateQueries({ playerName: "Makai Lemon", sport: "Football", yearLabel: "2026", setBrand: "Topps Inception", serialRun: null, parallel: "Green", isAuto: true, isRookie: true }),
      ["2025 Inception Green auto", "2025 Inception auto"],
    );
    assert.deepEqual(estimateQueries({ ...KNIGHT_CARD, serialRun: null, firstBowman: false }), []);
    assert.deepEqual(estimateQueries({ ...KNIGHT_CARD, yearLabel: "" }), []);
    assert.equal(ESTIMATE_MAX_CALLS, 2);
    assert.equal(yearBefore("2026"), "2025");
    assert.equal(yearBefore("2025-26"), "2024-25");
    assert.equal(yearBefore("2000-01"), "1999-00");
  });
});

function deps(liveSearch: LiveSoldsDeps["liveSearch"]): LiveSoldsDeps {
  return {
    directory: INDEXED_DIRECTORY,
    products: async () => [],
    cachedTitles: async () => [],
    quickCompCache: async () => null,
    liveSearch,
    now: () => Date.parse("2026-11-12T20:00:00.000Z"),
    storeQuickComp: async () => {
      throw new Error("an estimate is never stored as the card's price");
    },
  };
}

const KNIGHT_INPUT = { capture: { lines: KNIGHT_FRONT, backLines: KNIGHT_BACK, kind: "card" as const }, rows: [] };

describe("solds states: no sales yet is not unavailable", () => {
  it("a search that worked and found nothing says none (searched), with the estimate; nothing is stored", async () => {
    const queries: string[] = [];
    const result = await lookupLiveSolds(KNIGHT_INPUT, "user", deps(async (query) => {
      queries.push(query);
      return { ok: true, results: query.startsWith("2025") ? YEAR_AGO : [], fetchedAt: "2026-11-12T20:00:00.000Z" };
    }));
    assert.deepEqual(result.comp, { status: "none", searched: true });
    assert.equal(result.similar?.estimate?.medianCents, 80000);
    assert.deepEqual(result.similar?.parallels, ["Black", "Sapphire Black", "Gold Wave"]);
    // The card's own ladder (4 at most), then the estimate (2 at most).
    assert.deepEqual(queries.slice(-1), ["2025 Bowman U Chrome /10 1st"]);
    assert.ok(queries.length <= MAX_LOOKUP_CALLS + ESTIMATE_MAX_CALLS);
    // The card itself is unchanged: the estimate never becomes its parallel or its price.
    assert.equal(result.matches[0].parallel, "");
  });

  it("a lookup that failed says unavailable, with no estimate and no extra search", async () => {
    const queries: string[] = [];
    const result = await lookupLiveSolds(KNIGHT_INPUT, "user", deps(async (query) => {
      queries.push(query);
      return { ok: false, reason: "unavailable" };
    }));
    assert.deepEqual(result.comp, { status: "unavailable" });
    assert.equal(result.similar, undefined);
    assert.ok(queries.every((query) => !query.startsWith("2025")));
  });

  it("the estimate rides on the same lookup budget, makes at most 2 more calls, and stops when out of credits", async () => {
    const budgets = new Set<unknown>();
    let estimateCalls = 0;
    await lookupLiveSolds(KNIGHT_INPUT, "user", deps(async (query, _user, budget) => {
      budgets.add(budget);
      if (query.startsWith("2025")) {
        estimateCalls += 1;
        return { ok: true, results: [], fetchedAt: "2026-11-12T20:00:00.000Z" };
      }
      return { ok: true, results: [], fetchedAt: "2026-11-12T20:00:00.000Z" };
    }));
    assert.equal(budgets.size, 1);
    assert.ok(estimateCalls >= 1 && estimateCalls <= ESTIMATE_MAX_CALLS);

    let after = 0;
    const out = await lookupLiveSolds(KNIGHT_INPUT, "user", deps(async (query, _user, budget): Promise<LiveSearchResult> => {
      if (query.startsWith("2025")) {
        after += 1;
        if (budget) budget.outOfCredits = true;
        return { ok: false, reason: "unavailable" };
      }
      return { ok: true, results: [], fetchedAt: "2026-11-12T20:00:00.000Z" };
    }));
    assert.equal(after, 1);
    assert.deepEqual(out.comp, { status: "none", searched: true });
    assert.equal(out.similar, undefined);
  });

  it("the copy differs: No sales yet, and We couldn't load sold prices", () => {
    assert.equal(COMP_COPY.noneSearched, "No sales yet");
    assert.notEqual(COMP_COPY.noneSearched, COMP_COPY.unavailable);
    assert.match(COMP_COPY.estimate, /^Estimate from similar cards$/);
    assert.match(COMP_COPY.estimateNote, /Not this card's value/);
    for (const text of Object.values(COMP_COPY)) assert.doesNotMatch(text, /\bfree\b|\bAI\b|\bbest\b|number one|eBay data/i);
  });

  it("the live search honors a raised call cap, logs why it is unavailable, and never the key or a user", async () => {
    const warned: string[] = [];
    let fetched = 0;
    const search = makeLiveSearch({
      source: () => "trawl",
      hasTrawlKey: () => true,
      fetchSold: async () => {
        fetched += 1;
        return { ok: true, body: { results: [] } };
      },
      limits: { consumeDaily: async () => true, consumeHourly: async () => true },
      cache: ((fn: () => Promise<unknown>) => fn) as never,
      now: () => 0,
      warn: (event) => warned.push(event.reason),
    });
    const budget = newLookupBudget();
    for (let i = 0; i < MAX_LOOKUP_CALLS; i += 1) assert.equal((await search(`q${i}`, "user-1", budget)).ok, true);
    assert.equal((await search("over", "user-1", budget)).ok, false);
    assert.deepEqual(warned, ["lookup call cap reached"]);
    budget.maxCalls = budget.calls + ESTIMATE_MAX_CALLS;
    assert.equal((await search("e1", "user-1", budget)).ok, true);
    assert.equal((await search("e2", "user-1", budget)).ok, true);
    assert.equal((await search("e3", "user-1", budget)).ok, false);
    assert.equal(fetched, MAX_LOOKUP_CALLS + ESTIMATE_MAX_CALLS);

    const off = makeLiveSearch({
      source: () => "off",
      hasTrawlKey: () => true,
      fetchSold: async () => ({ ok: true, body: { results: [] } }),
      limits: { consumeDaily: async () => true, consumeHourly: async () => true },
      cache: ((fn: () => Promise<unknown>) => fn) as never,
      now: () => 0,
      warn: (event) => warned.push(event.reason),
    });
    assert.equal((await off("q", "user-1")).ok, false);
    assert.equal(warned.at(-1), "sold source is not live");
    assert.doesNotMatch(warned.join(" "), /user-1/);
  });
});

describe("the card page: a card with no card # is not an outage", () => {
  const loaders = (reason: string): SoldCompsLoaders => ({
    lookupAccess: async () => "owner",
    loadRefresh: async () => ({ attempt: { reason }, payload: null }),
    beforeRequest: async () => true,
    beforeTrawl: async () => true,
  });

  it("says to add the card #, with its own heading; a real failure still says unavailable", async () => {
    const skipped = await respondSoldComps("card-1", "user-1", loaders("no_number"));
    assert.equal(skipped.status, 409);
    assert.equal(((await skipped.json()) as { error: string }).error, SOLD_NEEDS_NUMBER_MESSAGE);
    const failed = await respondSoldComps("card-1", "user-1", loaders("trawl_error"));
    assert.equal(failed.status, 503);
    assert.equal(((await failed.json()) as { error: string }).error, SOLD_UNAVAILABLE_MESSAGE);
    assert.equal(soldNotice("unavailable", SOLD_NEEDS_NUMBER_MESSAGE), SOLD_NEEDS_NUMBER_MESSAGE);
    assert.equal(soldNoticeTitle(SOLD_NEEDS_NUMBER_MESSAGE), "Sold prices need the card #");
    assert.equal(soldNoticeTitle(SOLD_UNAVAILABLE_MESSAGE), "Sales are taking a break");
  });
});

describe("never an invented player", () => {
  const LONE = ["GOLDEN ARM", "03/10"];

  it("a name-like line the card doesn't back, with no title naming it: the player stays open, the card still shows", () => {
    const match = top(LONE, ["BCP-68", "© 2026 THE TOPPS COMPANY"]);
    assert.equal(match?.playerName, "");
    assert.equal(match?.sureness.player, "unsure");
    assert.equal(match?.playerNew, undefined);
    assert.equal(match?.cardNumber, "BCP-68");
    assert.equal(match?.serialRun, 10);
    assert.equal(match?.yearLabel, "2026");
    const prizm = top(["PRIZM", "JOHN DOEMAN"], null);
    assert.equal(prizm?.playerName, "");
    assert.equal(prizm?.setBrand, "Panini Prizm");
  });

  it("the same line counts once a sold title names it, and is marked new to us", () => {
    const match = top(LONE, ["BCP-68", "© 2026 THE TOPPS COMPANY"], [{ title: "2026 Bowman Chrome Golden Arm 1st BCP-68 /10", price: 40 }]);
    assert.equal(match?.playerName, "Golden Arm");
    assert.equal(match?.playerNew, true);
    // A title for somebody else doesn't make it real, and never puts that somebody on the card.
    assert.equal(top(LONE, ["BCP-68", "© 2026 THE TOPPS COMPANY"], [{ title: "2026 Bowman Chrome Arch Manning 1st BCP-68 /10", price: 40 }])?.playerName, "");
  });

  it("a name beside its position, team or school line, or printed on both sides, needs no title", () => {
    assert.equal(top(["1ST BOWMAN"], ["RUNNING BACK", "WAYNE KNIGHT", "UCLA", "BCP-68"])?.playerName, "Wayne Knight");
    assert.equal(top(["WAYNE KNIGHT", "03/10"], ["BCP-68", "WAYNE KNIGHT", "© 2026 THE TOPPS COMPANY"])?.playerName, "Wayne Knight");
  });

  it("the live lookup still searches the unverified name, and shows the player only if titles come back with it", async () => {
    const input = { capture: { lines: LONE, backLines: ["BCP-68", "© 2026 THE TOPPS COMPANY"], kind: "card" as const }, rows: [] };
    const queries: string[] = [];
    const none = await lookupLiveSolds(input, "user", deps(async (query) => {
      queries.push(query);
      return { ok: true, results: [], fetchedAt: "2026-11-12T20:00:00.000Z" };
    }));
    assert.ok(queries.length > 0 && queries[0].startsWith("Golden Arm"));
    // The card still shows with the player open; nothing is priced or estimated for nobody, and no photo.
    assert.equal(none.matches[0]?.playerName, "");
    assert.deepEqual(none.comp, { status: "none", searched: true });
    assert.equal(none.similar, undefined);
    assert.ok(queries.every((query) => !query.startsWith("2025")));
    assert.equal(none.matches[0]?.listing, undefined);
    const named = await lookupLiveSolds(input, "user", deps(async () => ({
      ok: true,
      results: [sold("2026 Bowman Chrome Golden Arm 1st Bowman BCP-68 /10", 40)],
      fetchedAt: "2026-11-12T20:00:00.000Z",
    })));
    assert.equal(named.matches[0]?.playerName, "Golden Arm");
  });
});

describe("review fixes for #261", () => {
  const TM = "TOPPS AND BOWMAN CHROME ARE REGISTERED TRADEMARKS OF THE TOPPS COMPANY, INC.";

  it("Bowman U Chrome is never picked by the school rule when anything says Baseball", () => {
    const cases: [string, string[], string[]][] = [
      ["a baseball position line", ["BOWMAN CHROME", "CHARLIE CONDON"], ["BCP-12", "CHARLIE CONDON", "OUTFIELD", "GEORGIA", TM]],
      ["a short position", ["BOWMAN CHROME", "COLE TESTERMAN"], ["BCP-88", "COLE TESTERMAN", "LSU", "SS", TM]],
      ["an MLB nickname line", ["BOWMAN CHROME", "SEBASTIAN WALCOTT", "TEXAS", "RANGERS"], ["BCP-41", "SEBASTIAN WALCOTT", "TEXAS", "RANGERS", TM]],
      ["the nickname on the front only", ["BOWMAN CHROME", "COLE TESTERMAN", "RANGERS"], ["BCP-88", "COLE TESTERMAN", "TEXAS", TM]],
      ["the product line", ["BOWMAN CHROME", "COLE TESTERMAN"], ["BCP-88", "COLE TESTERMAN", "LSU", "2025 BOWMAN CHROME BASEBALL", TM]],
    ];
    for (const [name, front, back] of cases) {
      const match = top(front, back);
      assert.equal(match?.setBrand, "Bowman Chrome", name);
      assert.match(match?.cardNumber ?? "", /^BCP-/, name);
    }
  });

  it("the school must sit in the header: a school alone in a stat table doesn't name Bowman U Chrome", () => {
    const table = top(["BOWMAN CHROME", "COLE TESTERMAN"], ["BCP-88", "COLE TESTERMAN", "YR CLUB G AB", "GEORGIA", "24 60 229 84", TM]);
    assert.equal(table?.setBrand, "Bowman Chrome");
    const read = readRawCardText(["WAYNE KNIGHT", "RUNNING BACK", "UCLA"], INDEXED_DIRECTORY, { side: "back" });
    assert.equal(read.schoolInHeader, true);
    assert.equal(readRawCardText(["YR CLUB G AB", "GEORGIA", "24 60 229"], INDEXED_DIRECTORY, { side: "back" }).schoolInHeader, false);
  });

  it("the logo still names it, and football with a school in the header still does", () => {
    assert.equal(top(["BOWMAN CHROME U", "WAYNE KNIGHT", "03/10"], ["WAYNE KNIGHT", "RUNNING BACK", "BCP-68"])?.setBrand, "Bowman U Chrome");
    assert.equal(top(KNIGHT_FRONT, KNIGHT_BACK)?.setBrand, "Bowman U Chrome");
  });

  it("a college Bowman card with nothing saying Chrome leaves the set open, never Bowman U Chrome", () => {
    const match = top(["BOWMAN", "1ST", "WAYNE KNIGHT", "03/10"], ["RUNNING BACK", "WAYNE KNIGHT", "UCLA", "© 2026 THE TOPPS COMPANY"]);
    assert.equal(match?.playerName, "Wayne Knight");
    assert.equal(match?.setBrand, "");
  });

  it("auto counts only as its own word on a short line, or as AUTOGRAPH in full", () => {
    const auto = (line: string) => readRawCardText([line], INDEXED_DIRECTORY, { side: "back" }).isAuto;
    for (const line of ["AUTO", "ROOKIE AUTO", "TOPPS CERTIFIED AUTOGRAPH ISSUE", "AUTOGRAPHS", "AUTOGRAPHED CARD"]) assert.equal(auto(line), true, line);
    for (const line of [
      "Dart was an auto-pilot leader for the offense all season long.",
      "AUTO-PILOT",
      "He ran the offense on auto for most of the second half.",
      "AUTOMATIC",
      "JAXSON DART",
    ]) {
      assert.equal(auto(line), false, line);
    }
  });

  it("the estimate runs only for this year's and last year's products", async () => {
    const run = async (front: string[], back: string[]) => {
      const queries: string[] = [];
      const result = await lookupLiveSolds({ capture: { lines: front, backLines: back, kind: "card" as const }, rows: [] }, "user", deps(async (query) => {
        queries.push(query);
        return { ok: true, results: [], fetchedAt: "2026-11-12T20:00:00.000Z" };
      }));
      return { result, extra: queries.filter((query) => /^\d{4} /.test(query)) };
    };
    const miller = await run(["3B", "1ST BOWMAN", "PHILADELPHIA PHILLIES", "137/299", "AIDAN MILLER"], ["AIDAN MILLER", "BP-27", "© 2024 THE TOPPS COMPANY, INC."]);
    assert.deepEqual(miller.result.comp, { status: "none", searched: true });
    assert.deepEqual(miller.extra, [], "a 2024 card in 2026 spends no extra searches");
    const knight = await run(KNIGHT_FRONT, KNIGHT_BACK);
    assert.equal(knight.extra.length, 1);
    const lastYear = await run(["1ST BOWMAN", "03/10"], ["RUNNING BACK", "WAYNE KNIGHT", "UCLA", "BCP-68", "© 2025 THE TOPPS COMPANY", "TOPPS AND BOWMAN CHROME ARE REGISTERED TRADEMARKS"]);
    assert.equal(lastYear.extra.length, 1);
  });
});

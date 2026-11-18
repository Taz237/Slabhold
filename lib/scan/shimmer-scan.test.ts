import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withSoldGroups } from "@/components/scan/sheet-parts";
import { loadChecklistsFor } from "@/lib/cards/checklist-load";
import { checklistProductFrom } from "@/lib/cards/checklist-import";
import { loadProductData } from "@/lib/cards/product-data";
import type { TrawlSoldResult } from "@/lib/comps/types";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import { loadSharedQuickComp, makeKeyedCache, QuickCompFailure, type CacheFn } from "@/lib/quick-comp/cache";
import type { QuickCompIdentity } from "@/lib/quick-comp/identity";
import type { QuickCompPayload } from "@/lib/quick-comp/lookup";
import { nextLikeUnstableCache } from "@/lib/test/next-like-cache";
import hardCards from "./hard-cards-v1.json";
import { MAX_SCAN_QUERIES, compQueryString } from "./comp";
import { lookupScanComp, type ScanCompDeps } from "./comp-lookup";
import type { HardCard } from "./hard-cards";
import { makeLiveCacheRead, makeLiveSearch } from "./live-search";
import { lookupLiveSolds } from "./live-solds";
import { checklistNumbers, rankScanMatches, scanChecklistKey, type SoldTitle } from "./match";
import { readRawCardText } from "./raw-text";
import { scanReadFrom } from "./session";

/**
 * The Nov 18 live scan of the 2026-27 Topps #257 Darryn Peterson Shimmer (hc-118, the device's own
 * Vision lines): the card # thrown away among a sideways back's stat cells, a "#17" card that
 * doesn't exist, and a Shimmer pill that found nothing. Nothing is fetched.
 */

const CARD = (hardCards as { cards: HardCard[] }).cards.find((item) => item.id === "hc-118")!;
const FRONT = CARD.typical_ocr_front;
const BACK = CARD.typical_ocr_back!;
const back = (lines: string[]) => readRawCardText(lines, SCAN_DIRECTORY, { side: "back" });

async function scan(lines: string[], backLines: string[] | null, soldTitles: SoldTitle[] = [], own: Parameters<typeof rankScanMatches>[2]["checklists"] = null) {
  const read = scanReadFrom({ lines, backLines, kind: "card", image: null }, SCAN_DIRECTORY);
  const key = scanChecklistKey(read, SCAN_DIRECTORY);
  const checklists = own ?? (key ? await loadChecklistsFor(key) : []);
  return rankScanMatches(read, [], { directory: SCAN_DIRECTORY, products: await loadProductData(), soldTitles, checklists });
}

const title = (text: string, price = 7, soldAt = "2026-11-13"): SoldTitle => ({ title: text, price, soldAt });
const HS17 = "2026-27 Topps Darryn Peterson Hardwood Stars #17 Rookie RC Jazz";
const TITLES = [title(HS17), title(HS17), title(HS17), title("2026-27 Topps Darryn Peterson Levitation #LV-12 RC"), title("2026-27 Topps Darryn Peterson #257 Shimmer RC")];

describe("a sideways back read cell by cell: the card # among the stat cells", () => {
  it("the stat cells are dropped: a number read twice, one with its decimal twin, one beside a stat header, a year", () => {
    assert.deepEqual(checklistNumbers(back(BACK)), ["257"]);
    assert.deepEqual(checklistNumbers(back(BACK.filter((line) => line !== "670"))), ["257"]);
    assert.deepEqual(checklistNumbers(back(["24", "24", "257"])), ["257"], "24 read twice");
    assert.deepEqual(checklistNumbers(back([".438", "438", "FG%", ".382", "382", "257"])), ["257"], "438 and 382 have decimal twins");
    assert.deepEqual(checklistNumbers(back(["670", "Career", "88", "REB/G", "12", "AST/G", "9", "YEAR", "L COLLEGE RECORD", "257", "KANSAS"])), ["257"], "beside a stat header");
    assert.deepEqual(checklistNumbers(back(["2026", "1998", "0110", "257"])), ["257"], "years and a leading zero");
    assert.deepEqual(checklistNumbers(back(["DARRYN PETERSON", "UTAH JAZZ"])), []);
    assert.deepEqual(checklistNumbers(null), []);
  });

  it("the unconfirmed read stays strict: with six bare numbers the back alone still gives no card #", () => {
    assert.equal(back(BACK).cardNumber, "");
  });

  it("the device's scan is 2026-27 Topps #257: the one number the checklist puts him at", async () => {
    for (const lines of [BACK, BACK.filter((line) => line !== "670")]) {
      const top = (await scan(FRONT, lines)).matches[0];
      assert.deepEqual([top.playerName, top.yearLabel, top.setBrand, top.cardNumber, top.sport], ["Darryn Peterson", "2026-27", "Topps", "257", "Basketball"]);
      assert.deepEqual([top.sureness.player, top.sureness.year, top.sureness.number], ["sure", "sure", "sure"]);
      assert.equal(top.parallel, "", "nothing on the card names its version");
      assert.equal(top.serialRun, null);
    }
  });

  it("two of his rows among the bare numbers (92 and 257): the card # stays open", async () => {
    const top = (await scan(FRONT, [...BACK, "92"])).matches[0];
    assert.equal(top.playerName, "Darryn Peterson");
    assert.equal(top.cardNumber, "");
  });

  it("a stat number that is another player's row is never his card #", async () => {
    // 17 is Giannis (Base) and Cade Cunningham (Flagship Collection) on this checklist; 258 is Cameron Boozer.
    for (const number of ["17", "258"]) {
      const lines = BACK.map((line) => (line === "257" ? number : line));
      const top = (await scan(FRONT, lines)).matches[0];
      assert.equal(top.playerName, "Darryn Peterson");
      assert.equal(top.cardNumber, "", number);
    }
  });

  it("a stat cell that happens to be his number is still a stat cell: 257 read twice, or beside FG%", async () => {
    for (const lines of [[...BACK.filter((line) => line !== "257"), "257", "257"], [...BACK.filter((line) => line !== "257"), "257", "FG%"]]) {
      assert.equal((await scan(FRONT, lines)).matches[0].cardNumber, "");
    }
  });
});

describe("a card a sold title names must exist on the checklist", () => {
  it("with #257 read, the pick list is the card: never \"2026-27 Topps #17\", never another card of his", async () => {
    const { matches } = await scan(FRONT, BACK, TITLES);
    assert.deepEqual(matches.map((match) => `${match.setBrand} #${match.cardNumber}`), ["Topps #257"]);
  });

  // A front alone loads no checklist of its own (no year or set read), so these pass the store's file in.
  const store = () => loadChecklistsFor({ years: ["2026-27"], setBrand: "Topps", sport: "Basketball" });

  it("with the # open (front only): Hardwood Stars \"#17\" is HS-17 with its insert named, and #17 alone is never shown", async () => {
    const { matches } = await scan(FRONT, null, TITLES, await store());
    assert.ok(matches.length > 0);
    assert.ok(!matches.some((match) => match.cardNumber === "17"), matches.map((match) => match.cardNumber).join(", "));
    const stars = matches.find((match) => match.cardNumber === "HS-17");
    assert.equal(stars?.insertName, "Hardwood Stars");
    for (const match of matches) assert.equal(match.playerName, "Darryn Peterson");
  });

  it("17 with no insert named: three of his codes end in 17 (AK-17, TB-17, HS-17), so it is no card of his and is dropped", async () => {
    const bare = "2026-27 Topps Darryn Peterson #17 Rookie RC Jazz";
    const { matches } = await scan(FRONT, null, [title(bare), title(bare), title("2026-27 Topps Darryn Peterson #257 Shimmer RC")], await store());
    assert.ok(!matches.some((match) => /17$/.test(match.cardNumber)), matches.map((match) => match.cardNumber).join(", "));
  });

  it("17 becomes a code only when exactly one of his codes ends in it", async () => {
    const list = (codes: string[]) =>
      checklistProductFrom({ sport: "Basketball", yearLabel: "2026-27", product: "Topps", source: "test", read: "2026-11-18" }, [
        { name: "Base", cards: [{ number: "17", player: "Giannis Antetokounmpo", team: "Milwaukee Bucks" }, { number: "257", player: "Darryn Peterson", team: "Utah Jazz" }] },
        ...codes.map((number) => ({ name: number.startsWith("HS") ? "Hardwood Stars" : "Bounce", cards: [{ number, player: "Darryn Peterson", team: "Utah Jazz" }] })),
      ]);
    const bare = [title("2026-27 Topps Darryn Peterson #17 RC"), title("2026-27 Topps Darryn Peterson #17 RC Jazz")];
    const one = (await scan(FRONT, null, bare, [list(["HS-17"])])).matches.map((match) => match.cardNumber);
    assert.ok(one.includes("HS-17") && !one.includes("17"), one.join(", "));
    const two = (await scan(FRONT, null, bare, [list(["HS-17", "TB-17"])])).matches.map((match) => match.cardNumber);
    assert.ok(!two.some((number) => /17$/.test(number)), two.join(", "));
  });

  it("a list that doesn't have the player at all checks nothing: the title's card stays", async () => {
    const other = checklistProductFrom({ sport: "Basketball", yearLabel: "2026-27", product: "Topps", source: "test", read: "2026-11-18" }, [
      { name: "Base", cards: [{ number: "17", player: "Giannis Antetokounmpo", team: "Milwaukee Bucks" }] },
    ]);
    const { matches } = await scan(FRONT, null, [title("2026-27 Topps Darryn Peterson #301 RC"), title("2026-27 Topps Darryn Peterson #301 RC Jazz")], [other]);
    assert.ok(matches.some((match) => match.cardNumber === "301"));
  });
});

const sale = (text: string, price: number, id: string, soldAt = "2026-11-13T12:00:00.000Z"): TrawlSoldResult => ({
  title: text,
  sale_price: price,
  shipping_price: null,
  currency: "USD",
  condition: "Ungraded",
  condition_raw: null,
  date_sold: soldAt,
  buying_format: "Auction",
  item_id: id,
  item_link: "",
  image_url: null,
  details: { grading: { graded: false, grader: null, grade: null, condition: null } },
});

const SOLD = [
  sale("2026-27 Topps Darryn Peterson #257 Shimmer RC Jazz", 6, "s1"),
  sale("2026-27 Topps Basketball Darryn Peterson #257 Shimmer Rookie", 6, "s2"),
  sale("Darryn Peterson 2026-27 Topps #257 RC Shimmer", 10.49, "s3"),
  sale("2026-27 Topps Darryn Peterson #257 RC Utah Jazz", 2, "b1"),
  sale("Darryn Peterson 2026-27 Topps Rookie #257", 2.5, "b2"),
  sale("2026-27 Topps Darryn Peterson #257 Rainbow Foilboard RC", 4, "r1"),
  sale("2026-27 Topps Darryn Peterson #257 Sandglitter RC", 5, "g1"),
];

/** A live search with Next's cache keying. `fetches` counts Trawl calls. */
function liveWith(cache: CacheFn, answer: (query: string) => TrawlSoldResult[] = () => SOLD) {
  const fetches: string[] = [];
  const run = makeLiveSearch({
    source: () => "trawl",
    hasTrawlKey: () => true,
    fetchSold: async (query) => (fetches.push(query), { ok: true, body: { results: answer(query) } }),
    limits: { consumeDaily: async () => true, consumeHourly: async () => true },
    cache,
    now: () => Date.parse("2026-11-18T19:25:00.000Z"),
  });
  return { run, fetches };
}

const IDENTITY: QuickCompIdentity = { playerName: "Darryn Peterson", year: 2026, yearLabel: "2026-27", setBrand: "Topps", cardNumber: "257", parallel: "Shimmer", grade: "Raw" };

describe("the shared cache: a reader finds what a writer stored", () => {
  it("Next keys by the callback's text: passing unstable_cache itself, the cache-only read never finds the search (the bug)", async () => {
    const { unstable } = nextLikeUnstableCache();
    const raw = unstable as unknown as CacheFn;
    const { run } = liveWith(raw);
    assert.ok((await run("Darryn Peterson Topps 257", "u1")).ok);
    assert.equal(await makeLiveCacheRead(raw)("Darryn Peterson Topps 257"), null);
  });

  it("with the one shared wrapper: write with the live search, read with the cache-only read, same query, a hit", async () => {
    const cache = makeKeyedCache(nextLikeUnstableCache().unstable);
    const { run, fetches } = liveWith(cache);
    assert.ok((await run("Darryn Peterson Topps 257", "u1")).ok);
    const read = await makeLiveCacheRead(cache)(" darryn  peterson topps 257 ");
    assert.equal(read?.length, SOLD.length);
    // And the same search again spends nothing.
    assert.ok((await run("Darryn Peterson Topps 257", "u2")).ok);
    assert.equal(fetches.length, 1);
    // A search nobody ran is a miss, and the miss is never stored.
    assert.equal(await makeLiveCacheRead(cache)("Darryn Peterson 257"), null);
    assert.ok((await run("Darryn Peterson 257", "u1")).ok);
    assert.equal((await makeLiveCacheRead(cache)("Darryn Peterson 257"))?.length, SOLD.length);
  });

  it("a quick comp a scan stores is the one a cache-only read gets (storeQuickComp and quickCompCache)", async () => {
    const stored = { comps: [{ title: "x", soldPrice: 6, soldDate: "2026-11-13" }], fetchedAt: "2026-11-18T19:25:00.000Z" } as unknown as QuickCompPayload;
    const refuse = async (): Promise<QuickCompPayload> => {
      throw new QuickCompFailure("unavailable");
    };
    const raw = nextLikeUnstableCache().unstable as unknown as CacheFn;
    await loadSharedQuickComp(IDENTITY, async () => stored, raw);
    await assert.rejects(loadSharedQuickComp(IDENTITY, refuse, raw), "the bug: the reader's own callback is another key");

    const cache = makeKeyedCache(nextLikeUnstableCache().unstable);
    await assert.rejects(loadSharedQuickComp(IDENTITY, refuse, cache), "a miss refuses");
    await loadSharedQuickComp(IDENTITY, async () => stored, cache);
    assert.deepEqual(await loadSharedQuickComp(IDENTITY, refuse, cache), stored);
    // Another version of the card is another entry.
    await assert.rejects(loadSharedQuickComp({ ...IDENTITY, parallel: "Base" }, refuse, cache));
  });
});

function pillDeps(cache: CacheFn): ScanCompDeps {
  return {
    quickCompCache: async (identity) => {
      try {
        return await loadSharedQuickComp<QuickCompPayload>(identity, async () => { throw new QuickCompFailure("unavailable"); }, cache);
      } catch {
        return null;
      }
    },
    collectionSales: async () => [],
    soldCache: async () => [],
    liveCache: makeLiveCacheRead(cache),
    directory: SCAN_DIRECTORY,
    products: loadProductData,
  };
}

describe("the Shimmer pill: every parallel the scan lists prices from the same sales", () => {
  it("each group in the scan's list, tapped, shows the same count, and never \"No recent sales\"", async () => {
    const cache = makeKeyedCache(nextLikeUnstableCache().unstable);
    const { run, fetches } = liveWith(cache);
    const stored: QuickCompIdentity[] = [];
    const result = await lookupLiveSolds({ capture: { lines: FRONT, backLines: BACK, kind: "card", look: null }, rows: [] }, "u1", {
      directory: SCAN_DIRECTORY,
      products: loadProductData,
      checklists: (key) => loadChecklistsFor(key),
      cachedTitles: async () => [],
      quickCompCache: pillDeps(cache).quickCompCache,
      liveSearch: run,
      storeQuickComp: async (identity) => void stored.push(identity),
    });
    const top = result.matches[0];
    assert.deepEqual([top.setBrand, top.cardNumber], ["Topps", "257"]);
    assert.deepEqual(result.queries, ["Darryn Peterson Topps 257"]);
    const comp = result.comp;
    assert.ok(comp.status === "ok" || comp.status === "split", comp.status);
    if (comp.status !== "ok" && comp.status !== "split") return;
    const groups = comp.groups ?? [];
    assert.deepEqual(groups.map((group) => `${group.label} x${group.nSales}`).sort(), ["Base x2", "Rainbow Foilboard x1", "Sandglitter x1", "Shimmer x3"]);
    // The pills offered are the listed parallels, Shimmer among them.
    const pills = withSoldGroups([], { status: "done", comp, query: result.query, queries: result.queries }, null, true).map((option) => option.name);
    assert.ok(pills.includes("Shimmer"));
    const before = fetches.length;
    for (const group of groups) {
      const tapped = await lookupScanComp({ ...IDENTITY, parallel: group.label }, "u1", pillDeps(cache), { serialRun: null, queries: result.queries });
      assert.equal(tapped.status, "ok", `${group.label}: ${tapped.status}`);
      if (tapped.status === "ok") assert.equal(tapped.nSales, group.nSales, group.label);
    }
    assert.equal(fetches.length, before, "a tap never searches again");
  });

  it("the same tap through a cache keyed the way Next keys it, without the shared wrapper, found nothing (the live bug)", async () => {
    const raw = nextLikeUnstableCache().unstable as unknown as CacheFn;
    const { run } = liveWith(raw);
    assert.ok((await run("Darryn Peterson Topps 257", "u1")).ok);
    const tapped = await lookupScanComp(IDENTITY, "u1", pillDeps(raw), { serialRun: null, queries: ["Darryn Peterson Topps 257"] });
    assert.equal(tapped.status, "none");
  });

  it("a scan that ran two searches: the tap reads both, each sale once", async () => {
    const cache = makeKeyedCache(nextLikeUnstableCache().unstable);
    const { run } = liveWith(cache, (query) => (/topps/i.test(query) ? SOLD.slice(0, 2) : SOLD.slice(1, 3)));
    await run("Darryn Peterson Topps 257", "u1");
    await run("Darryn Peterson 257", "u1");
    const last = await lookupScanComp(IDENTITY, "u1", pillDeps(cache), { serialRun: null, query: "Darryn Peterson 257" });
    assert.equal(last.status === "ok" ? last.nSales : 0, 2, "the last search alone");
    const both = await lookupScanComp(IDENTITY, "u1", pillDeps(cache), { serialRun: null, queries: ["Darryn Peterson Topps 257", "Darryn Peterson 257"] });
    assert.equal(both.status === "ok" ? both.nSales : 0, 3, "s2 answered both searches and counts once");
    // One search read back, the other not cached: still the sales we have, never an error.
    const half = await lookupScanComp(IDENTITY, "u1", pillDeps(cache), { serialRun: null, queries: ["Darryn Peterson Topps 257", "nobody ran this"] });
    assert.equal(half.status === "ok" ? half.nSales : 0, 2);
  });

  it("the sheet sends every search, at most four, and the lookup link carries them", () => {
    const one = new URLSearchParams(compQueryString(IDENTITY, null, "Darryn Peterson 257"));
    assert.deepEqual(one.getAll("q"), ["Darryn Peterson 257"]);
    const many = new URLSearchParams(compQueryString(IDENTITY, null, ["a", "b", "", "c", "d", "e"]));
    assert.deepEqual(many.getAll("q"), ["a", "b", "c", "d"]);
    assert.equal(MAX_SCAN_QUERIES, 4);
    assert.deepEqual(new URLSearchParams(compQueryString(IDENTITY, null, null)).getAll("q"), []);
  });
});

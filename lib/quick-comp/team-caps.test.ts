import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { TrawlSoldResult } from "@/lib/comps/types";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import { makeLiveSearch } from "@/lib/scan/live-search";
import { lookupLiveSolds } from "@/lib/scan/live-solds";
import { COMP_COPY } from "@/lib/scan/comp";
import { HUB_COPY } from "@/lib/scan/entry";
import { TEAM_BADGE_USERNAMES } from "@/lib/social/team-badge";
import type { CacheFn } from "./cache";
import type { QuickCompIdentity } from "./identity";
import {
  QUICK_COMP_DAILY_LIMIT,
  TEAM_DAILY_SAFETY_LIMIT,
  spendQuickCompLookup,
  type QuickCompLimitDeps,
} from "./limits";
import { makeTeamCheck } from "./limits-server";
import { getQuickComp } from "./lookup";
import {
  QUICK_COMP_DAILY_MESSAGE,
  QUICK_COMP_HOURLY_MESSAGE,
  QUICK_COMP_SAFETY_MESSAGE,
  quickCompLimitMessage,
} from "./respond";

/**
 * Team badge holders skip Quick Comp's daily and hourly caps; everyone else
 * keeps them. Mocked usernames and a mocked Trawl: no live API, no real key.
 */

const HOURLY_LIMIT = 5;

/** Users by id, as profiles.username would return them. */
const USERNAMES: Record<string, string | null> = {
  "u-donnie": "donnietaz",
  "u-kev": "KevStuff",
  "u-official": "slabhold",
  "u-regular": "cardfan22",
  "u-nameless": null,
};

/** In-memory caps with the real limits: 10 a day, 5 an hour, 200 a day for the team guard. */
function limits(lookup: (userId: string) => Promise<string | null> = async (id) => USERNAMES[id] ?? null) {
  const used = { daily: new Map<string, number>(), hourly: new Map<string, number>(), safety: new Map<string, number>() };
  const take = (map: Map<string, number>, userId: string, cap: number) => {
    const next = (map.get(userId) ?? 0) + 1;
    if (next > cap) return false;
    map.set(userId, next);
    return true;
  };
  const deps: QuickCompLimitDeps = {
    consumeDaily: async (userId) => take(used.daily, userId, QUICK_COMP_DAILY_LIMIT),
    consumeHourly: async (userId) => take(used.hourly, userId, HOURLY_LIMIT),
    isUnlimited: makeTeamCheck(lookup),
    consumeTeamSafety: async (userId) => take(used.safety, userId, TEAM_DAILY_SAFETY_LIMIT),
    now: () => Date.parse("2026-11-12T17:00:00.000Z"),
  };
  return { deps, used };
}

function memoryCache(): CacheFn {
  const store = new Map<string, unknown>();
  return (load, keyParts) => async () => {
    const key = keyParts.join("|");
    if (store.has(key)) return store.get(key) as Awaited<ReturnType<typeof load>>;
    const value = await load();
    store.set(key, value);
    return value;
  };
}

function sold(title: string, price: number): TrawlSoldResult {
  return {
    title,
    sale_price: price,
    shipping_price: null,
    currency: "USD",
    condition: "Ungraded",
    condition_raw: null,
    date_sold: "2026-11-01T18:00:00.000Z",
    buying_format: "Auction",
    item_id: `${title}-${price}`,
    item_link: "",
    image_url: null,
    details: { grading: { graded: false, grader: null, grade: null, condition: null } },
  };
}

function search(capDeps: QuickCompLimitDeps) {
  const fetched: string[] = [];
  const run = makeLiveSearch({
    source: () => "trawl",
    hasTrawlKey: () => true,
    fetchSold: async (query) => {
      fetched.push(query);
      return { ok: true, body: { results: [sold(`2024 Bowman Aidan Miller #BP-27 ${query}`, 20)] } };
    },
    limits: capDeps,
    cache: memoryCache(),
    now: () => Date.parse("2026-11-12T17:00:00.000Z"),
  });
  return { run, fetched };
}

/** Different searches, so each one misses the cache and would call Trawl. */
const queries = (n: number) => Array.from({ length: n }, (_, i) => `Aidan Miller BP-27 search ${i + 1}`);

describe("team badge holders skip the daily and hourly caps", () => {
  for (const userId of ["u-donnie", "u-kev", "u-official"]) {
    it(`${USERNAMES[userId]} goes past 10 a day and 5 an hour, and Trawl runs every time`, async () => {
      const { deps, used } = limits();
      const { run, fetched } = search(deps);
      for (const query of queries(15)) {
        const result = await run(query, userId);
        assert.equal(result.ok, true, query);
      }
      assert.equal(fetched.length, 15);
      assert.equal(used.daily.size + used.hourly.size, 0, "neither the 10 nor the 5 is spent");
      assert.equal(used.safety.get(userId), 15, "only the stuck-loop guard counts");
    });
  }

  it("Quick Comp itself gets the same bypass", async () => {
    const { deps, used } = limits();
    let trawl = 0;
    for (let i = 0; i < 12; i += 1) {
      const identity: QuickCompIdentity = {
        playerName: "Aidan Miller",
        year: 2024,
        yearLabel: "2024",
        setBrand: "Bowman",
        cardNumber: `BP-${i + 1}`,
        parallel: "Base",
        grade: "Raw",
      };
      const result = await getQuickComp(identity, "u-donnie", {
        source: () => "trawl",
        hasTrawlKey: () => true,
        fetchSold: async () => {
          trawl += 1;
          return { ok: true, body: { site: "EBAY_US", currency: "USD", query: [], count: 0, credits_charged: 0, results: [] }, rateLimitRemaining: null };
        },
        limits: deps,
        cache: memoryCache(),
        now: () => Date.parse("2026-11-12T17:00:00.000Z"),
      });
      assert.equal(result.ok, true);
    }
    assert.equal(trawl, 12);
    assert.equal(used.daily.size, 0);
  });
});

describe("everyone else keeps the caps", () => {
  it("a regular user hits the 5 an hour, then the 10 a day, with the existing messages", async () => {
    const { deps } = limits();
    const { run, fetched } = search(deps);
    const results = [];
    for (const query of queries(6)) results.push(await run(query, "u-regular"));
    assert.deepEqual(results.map((result) => result.ok), [true, true, true, true, true, false]);
    const sixth = results[5];
    assert.ok(!sixth.ok && sixth.reason === "hourly");
    assert.equal(fetched.length, 5);
    assert.equal(quickCompLimitMessage("hourly"), QUICK_COMP_HOURLY_MESSAGE);

    // A new hour, the same day: the daily 10 still holds.
    const { deps: dayDeps, used } = limits();
    used.daily.set("u-regular", QUICK_COMP_DAILY_LIMIT);
    const day = search(dayDeps);
    const capped = await day.run("Aidan Miller another search", "u-regular");
    assert.ok(!capped.ok && capped.reason === "daily");
    assert.equal(day.fetched.length, 0);
    assert.equal(quickCompLimitMessage("daily"), QUICK_COMP_DAILY_MESSAGE);
  });

  it("a failed username lookup, or no username, keeps the caps", async () => {
    for (const lookup of [
      async () => {
        throw new Error("profiles down");
      },
      async () => null,
    ]) {
      const { deps } = limits(lookup);
      const { run, fetched } = search(deps);
      const results = [];
      for (const query of queries(6)) results.push(await run(query, "u-donnie"));
      assert.equal(results.filter((result) => result.ok).length, HOURLY_LIMIT);
      assert.equal(fetched.length, HOURLY_LIMIT);
    }
    const { deps } = limits();
    const nameless = search(deps);
    for (const query of queries(6)) await nameless.run(query, "u-nameless");
    assert.equal(nameless.fetched.length, HOURLY_LIMIT);
  });

  it("without the stuck-loop guard wired in, nobody skips the caps", async () => {
    const { deps } = limits();
    const result = await spendQuickCompLookup("u-donnie", { ...deps, consumeTeamSafety: undefined, consumeHourly: async () => false });
    assert.ok(!result.ok && result.reason === "hourly");
  });
});

describe("cache first, for team and regular users alike", () => {
  for (const userId of ["u-donnie", "u-regular"]) {
    it(`${USERNAMES[userId]}: a cache hit spends nothing and doesn't call Trawl`, async () => {
      const { deps, used } = limits();
      const { run, fetched } = search(deps);
      await run("Jaxson Dart /199", userId);
      const spentAfterFirst = [...used.daily.values(), ...used.hourly.values(), ...used.safety.values()].reduce((a, b) => a + b, 0);
      await run("jaxson dart /199", "u-someone-else");
      await run("Jaxson Dart /199", userId);
      const spentAfterAll = [...used.daily.values(), ...used.hourly.values(), ...used.safety.values()].reduce((a, b) => a + b, 0);
      assert.equal(fetched.length, 1);
      assert.equal(spentAfterAll, spentAfterFirst);
    });
  }
});

describe("the team stuck-loop guard", () => {
  it("at 200 new lookups today: the identity shows, an honest message, no Trawl, no price", async () => {
    const { deps, used } = limits();
    used.safety.set("u-donnie", TEAM_DAILY_SAFETY_LIMIT);
    const { run, fetched } = search(deps);
    const result = await lookupLiveSolds(
      {
        capture: {
          lines: ["3B", "1ST BOWMAN", "PHILADELPHIA PHILLIES", "137/299", "AIDAN MILLER"],
          backLines: ["AIDAN MILLER", "BP-27", "© 2024 THE TOPPS COMPANY, INC."],
          kind: "card",
        },
        rows: [],
      },
      "u-donnie",
      {
        directory: INDEXED_DIRECTORY,
        products: async () => [],
        cachedTitles: async () => [],
        quickCompCache: async () => null,
        liveSearch: run,
        storeQuickComp: async () => {},
      },
    );
    assert.equal(fetched.length, 0);
    assert.equal(result.matches[0]?.playerName, "Aidan Miller");
    assert.equal(result.matches[0]?.cardNumber, "BP-27");
    assert.equal(result.comp.status, "limited");
    assert.ok(result.comp.status === "limited" && result.comp.reason === "safety");
    assert.equal(quickCompLimitMessage("safety"), QUICK_COMP_SAFETY_MESSAGE);
    assert.equal(TEAM_DAILY_SAFETY_LIMIT, 200);
    assert.equal(QUICK_COMP_DAILY_LIMIT, 10, "the regular cap isn't raised or lowered");
  });
});

describe("one team list", () => {
  it("every TEAM_BADGE_USERNAMES name skips the caps, matched without case or @", async () => {
    for (const username of TEAM_BADGE_USERNAMES) {
      assert.equal(await makeTeamCheck(async () => username)("id"), true, username);
      assert.equal(await makeTeamCheck(async () => `@${username.toUpperCase()}`)("id"), true, username);
    }
    assert.equal(await makeTeamCheck(async () => "cardfan22")("id"), false);
  });

  it("uses hasTeamBadge, with no second list and no official flag", () => {
    const source = readFileSync(join(process.cwd(), "lib/quick-comp/limits-server.ts"), "utf8");
    assert.match(source, /import \{ hasTeamBadge \} from "@\/lib\/social\/team-badge"/);
    assert.match(source, /return hasTeamBadge\(await lookup\(userId\)\);/);
    assert.doesNotMatch(source, /official/);
    for (const username of TEAM_BADGE_USERNAMES) assert.doesNotMatch(source, new RegExp(`"${username}"`, "i"));
    const limitsSource = readFileSync(join(process.cwd(), "lib/quick-comp/limits.ts"), "utf8");
    for (const username of TEAM_BADGE_USERNAMES) assert.doesNotMatch(limitsSource, new RegExp(`"${username}"`, "i"));
  });
});

describe("copy", () => {
  it("never says free, and scanning stays unlimited", () => {
    for (const text of [QUICK_COMP_DAILY_MESSAGE, QUICK_COMP_HOURLY_MESSAGE, QUICK_COMP_SAFETY_MESSAGE, ...Object.values(COMP_COPY), ...Object.values(HUB_COPY)]) {
      assert.doesNotMatch(text, /\bfree\b/i, text);
    }
    assert.equal(HUB_COPY.unlimited, "Scan as many cards as you want.");
  });
});

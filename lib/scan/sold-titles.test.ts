import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { SoldTitle } from "./match";
import { soldTitlePattern, soldTitlePlayer, soldTitlesFromBody } from "./sold-titles";
import { respondSoldTitles, SOLD_TITLES_RATE_MESSAGE, type SoldTitlesRouteDeps } from "./sold-titles-respond";

/** Made-up titles. */

describe("sold title search input", () => {
  it("takes a player name of two words or more, and nothing else", () => {
    assert.equal(soldTitlePlayer("Aidan Miller"), "Aidan Miller");
    assert.equal(soldTitlePlayer("  J.J.  McCarthy "), "J.J. McCarthy");
    assert.equal(soldTitlePlayer("Miller"), "");
    assert.equal(soldTitlePlayer("Aidan Miller %"), "");
    assert.equal(soldTitlePlayer("Aidan_Miller x"), "");
    assert.equal(soldTitlePlayer(null), "");
  });

  it("builds a letters-only pattern with the words in order", () => {
    assert.equal(soldTitlePattern("Aidan Miller"), "%aidan%miller%");
    assert.equal(soldTitlePattern("Luka Dončić"), "%luka%doncic%");
    assert.equal(soldTitlePattern("Shai Gilgeous-Alexander"), "%shai%gilgeous%alexander%");
  });

  it("keeps only string titles from the route's body", () => {
    const titles = soldTitlesFromBody({
      titles: [{ title: "2025 Panini Mosaic Jaxson Dart #362", price: 45, soldAt: "2026-08-05" }, { title: 7 }, null, { title: " " }],
    });
    assert.deepEqual(titles, [{ title: "2025 Panini Mosaic Jaxson Dart #362", price: 45, soldAt: "2026-08-05" }]);
    assert.deepEqual(soldTitlesFromBody({ error: "x" }), []);
  });
});

describe("respondSoldTitles", () => {
  const url = "https://slabhold.test/api/scan/sold-titles?player=Aidan+Miller";

  function route(overrides: Partial<SoldTitlesRouteDeps> = {}) {
    const asked: string[] = [];
    const value: SoldTitlesRouteDeps = {
      enabled: () => true,
      userId: async () => "viewer",
      allow: async () => true,
      search: async (player): Promise<SoldTitle[]> => {
        asked.push(player);
        return [{ title: "2024 Bowman Aidan Miller #BP-27", price: 20, soldAt: "2026-09-01" }];
      },
      ...overrides,
    };
    return { value, asked };
  }

  it("is a 404 when the scanner is off, and needs a signed-in collector", async () => {
    assert.equal((await respondSoldTitles(new Request(url), route({ enabled: () => false }).value)).status, 404);
    assert.equal((await respondSoldTitles(new Request(url), route({ userId: async () => null }).value)).status, 401);
  });

  it("rejects other fields and a bad name before any search", async () => {
    const { value, asked } = route();
    assert.equal((await respondSoldTitles(new Request(`${url}&limit=999`), value)).status, 400);
    assert.equal((await respondSoldTitles(new Request(`${url.split("?")[0]}?player=%25`), value)).status, 400);
    assert.equal(asked.length, 0);
  });

  it("caps quick repeat searches", async () => {
    const { value, asked } = route({ allow: async () => false });
    const response = await respondSoldTitles(new Request(url), value);
    assert.equal(response.status, 429);
    assert.equal((await response.json()).error, SOLD_TITLES_RATE_MESSAGE);
    assert.equal(asked.length, 0);
  });

  it("returns the cached titles, private and uncached", async () => {
    const { value, asked } = route();
    const response = await respondSoldTitles(new Request(url), value);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(asked, ["Aidan Miller"]);
    assert.equal((await response.json()).titles.length, 1);
  });

  it("answers with no titles when the cache read fails, so the card's own read still works", async () => {
    const response = await respondSoldTitles(new Request(url), route({ search: async () => { throw new Error("down"); } }).value);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { titles: [] });
  });
});

describe("the sold title search only reads the cache", () => {
  const source = (path: string) =>
    readFileSync(join(process.cwd(), path), "utf8")
      .split("\n")
      .filter((line) => !/^\s*(\*|\/\/|\/\*\*)/.test(line))
      .join("\n");

  it("reads sold_comps_cache, writes nothing, and never calls Trawl or eBay", () => {
    const server = source("lib/scan/sold-titles-server.ts");
    assert.match(server, /\.from\("sold_comps_cache"\)/);
    assert.doesNotMatch(server, /\.(insert|upsert|update|delete)\(/);
    for (const path of ["lib/scan/sold-titles-server.ts", "lib/scan/sold-titles.ts", "app/api/scan/sold-titles/route.ts"]) {
      assert.doesNotMatch(source(path), /trawl|ebay\.com|fetch\(/i, path);
    }
  });
});

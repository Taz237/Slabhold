import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TrawlSoldResult } from "@/lib/comps/types";
import { playerSearchQuery, respondPlayerFeed, respondPlayerSuggest, type PlayerFeedDeps, type PlayerSuggestDeps } from "./player-respond";

const url = (q: string, path = "player") => `https://slabhold.test/api/quick-comp/${path}?q=${encodeURIComponent(q)}`;

function feedDeps(overrides: Partial<PlayerFeedDeps> = {}) {
  const searches: string[] = [];
  const deps: PlayerFeedDeps = {
    enabled: () => true,
    userId: async () => "fixture-user",
    canonical: (text) => (/acuff/i.test(text) ? "Darius Acuff Jr." : null),
    liveSearch: async (query) => {
      searches.push(query);
      return { ok: true, results: [{ title: "Acuff Prizm" } as TrawlSoldResult], fetchedAt: "2026-11-17T00:00:00Z" };
    },
    toSales: (results) => results.map((row, n) => ({ id: String(n), title: row.title, price: 10, soldAt: "2026-11-16", photo: null, grade: "Raw", company: "raw", year: null, set: null, number: null, auto: false, run: null, parallel: null })),
    ...overrides,
  };
  return { deps, searches };
}

describe("GET /api/quick-comp/player", () => {
  it("one sold search for the player's name, without the suffix", async () => {
    const { deps, searches } = feedDeps();
    const response = await respondPlayerFeed(new Request(url("darius acuff jr")), deps);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.player, "Darius Acuff Jr.");
    assert.equal(body.sales.length, 1);
    assert.deepEqual(searches, ["Darius Acuff"]);
  });

  it("404 with the flag off and 401 signed out, with no search", async () => {
    const off = feedDeps({ enabled: () => false });
    assert.equal((await respondPlayerFeed(new Request(url("acuff")), off.deps)).status, 404);
    const out = feedDeps({ userId: async () => null });
    assert.equal((await respondPlayerFeed(new Request(url("acuff")), out.deps)).status, 401);
    assert.equal(off.searches.length + out.searches.length, 0);
  });

  it("rejects text that isn't a name", async () => {
    const { deps, searches } = feedDeps();
    for (const q of ["", "a", "2023 prizm", "<script>"]) assert.equal((await respondPlayerFeed(new Request(url(q)), deps)).status, 400, q);
    assert.equal(searches.length, 0);
  });

  it("caps and outages say so", async () => {
    const limited = feedDeps({ liveSearch: async () => ({ ok: false, reason: "daily", resetAt: "2026-11-18T05:00:00Z" }) });
    const response = await respondPlayerFeed(new Request(url("acuff")), limited.deps);
    assert.equal(response.status, 429);
    const limitedBody = await response.json();
    assert.equal(limitedBody.reason, "daily");
    assert.equal(limitedBody.error, "You've looked up 5 players today");
    const down = feedDeps({ liveSearch: async () => ({ ok: false, reason: "unavailable" }) });
    assert.equal((await respondPlayerFeed(new Request(url("acuff")), down.deps)).status, 503);
  });

  it("search text drops dots and suffixes", () => {
    assert.equal(playerSearchQuery("Darius Acuff Jr."), "Darius Acuff");
    assert.equal(playerSearchQuery("C.J. Stroud"), "C J Stroud");
    assert.equal(playerSearchQuery("Ken Griffey Jr"), "Ken Griffey");
  });
});

describe("GET /api/quick-comp/suggest", () => {
  function suggestDeps(overrides: Partial<PlayerSuggestDeps> = {}) {
    const reads: string[] = [];
    const deps: PlayerSuggestDeps = {
      enabled: () => true,
      userId: async () => "fixture-user",
      names: () => ["Darius Acuff Jr.", "Darius Garland"],
      titles: async (player) => (reads.push(player), ["t"]),
      phrases: (player) => [{ label: "Acuff auto", player, filter: { auto: true } }],
      ...overrides,
    };
    return { deps, reads };
  }

  it("names, with the top name's phrases under it", async () => {
    const { deps, reads } = suggestDeps();
    const body = await (await respondPlayerSuggest(new Request(url("darius", "suggest")), deps)).json();
    assert.deepEqual(
      body.suggestions.map((row: { label: string }) => row.label),
      ["Darius Acuff Jr.", "Acuff auto", "Darius Garland"],
    );
    assert.deepEqual(reads, ["Darius Acuff Jr."]);
  });

  it("two letters: names only, no title read", async () => {
    const { deps, reads } = suggestDeps();
    const body = await (await respondPlayerSuggest(new Request(url("da", "suggest")), deps)).json();
    assert.equal(body.suggestions.length, 2);
    assert.equal(reads.length, 0);
  });

  it("a failed title read still shows names", async () => {
    const { deps } = suggestDeps({ titles: async () => Promise.reject(new Error("down")) });
    const body = await (await respondPlayerSuggest(new Request(url("darius", "suggest")), deps)).json();
    assert.equal(body.suggestions.length, 2);
  });
});

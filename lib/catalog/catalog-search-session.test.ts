import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { searchCatalog, type CatalogCard } from "@/lib/card-catalog";
import {
  CATALOG_SEARCH_TIMEOUT_MESSAGE,
  CATALOG_SEARCH_TIMEOUT_MS,
  catalogSearchNeedsRetry,
  loadCatalogSearchSession,
} from "@/lib/catalog/catalog-search-session";

const lateSilver: CatalogCard = {
  id: "late-silver",
  playerName: "Patrick Mahomes",
  yearLabel: "2017",
  setBrand: "Panini Prizm",
  cardNumber: "269",
  sport: "Football",
  parallel: "Silver",
};

describe("catalog search timeout", () => {
  it("a hung search_cards call falls back to seeds and ends loading", async () => {
    assert.equal(CATALOG_SEARCH_TIMEOUT_MS, 6_000);
    let sawAbort = false;
    const session = loadCatalogSearchSession({
      query: "Jaxson Dart",
      debounceMs: 0,
      timeoutMs: 30,
      search: (_query, signal) =>
        new Promise((resolve) => {
          const stop = () => {
            sawAbort = true;
            resolve([lateSilver]);
          };
          if (signal.aborted) {
            stop();
            return;
          }
          signal.addEventListener("abort", stop, { once: true });
        }),
    });

    const snapshot = await session.done;
    assert.equal(snapshot.timedOut, true);
    assert.equal(snapshot.loading, false);
    assert.equal(snapshot.aborted, false);
    assert.equal(snapshot.remote, null);
    assert.equal(sawAbort, true);
    assert.equal(snapshot.results[0]?.playerName, "Jaxson Dart");
    assert.equal(snapshot.results[0]?.cardNumber, "332");
    assert.equal(snapshot.results[0]?.isRookie, true);
    assert.equal(
      snapshot.results.some((card) => card.id === "late-silver"),
      false,
    );
  });

  it("keeps a real empty search_cards result empty", async () => {
    assert.ok(searchCatalog("silver").length > 0);
    const session = loadCatalogSearchSession({
      query: "silver",
      debounceMs: 0,
      timeoutMs: 5_000,
      search: async () => [],
    });
    const snapshot = await session.done;
    assert.equal(snapshot.timedOut, false);
    assert.equal(snapshot.loading, false);
    assert.equal(snapshot.aborted, false);
    assert.deepEqual(snapshot.remote, []);
    assert.deepEqual(snapshot.results, []);
  });

  it("aborts a debounced search before it calls search_cards", async () => {
    let calls = 0;
    const session = loadCatalogSearchSession({
      query: "silver",
      debounceMs: 40,
      timeoutMs: 5_000,
      search: async () => {
        calls += 1;
        return [];
      },
    });
    session.abort();
    const snapshot = await session.done;
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(calls, 0);
    assert.equal(snapshot.aborted, true);
    assert.equal(snapshot.loading, false);
    assert.deepEqual(snapshot.results, []);
  });

  it("ignores a late response after a newer query aborts the in-flight search", async () => {
    let release: (rows: CatalogCard[]) => void = () => {};
    let started = false;
    const first = loadCatalogSearchSession({
      query: "silver",
      debounceMs: 0,
      timeoutMs: 5_000,
      search: () =>
        new Promise((resolve) => {
          started = true;
          release = resolve;
        }),
    });

    const deadline = Date.now() + 500;
    while (!started && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(started, true);
    first.abort();
    const dropped = await first.done;
    release([lateSilver]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(dropped.aborted, true);
    assert.equal(dropped.loading, false);
    assert.deepEqual(dropped.results, []);

    const second = loadCatalogSearchSession({
      query: "Jaxson Dart",
      debounceMs: 0,
      timeoutMs: 5_000,
      search: async () => [],
    });
    const current = await second.done;
    assert.equal(current.aborted, false);
    assert.equal(current.loading, false);
    assert.deepEqual(current.results, []);
    assert.deepEqual(current.remote, []);
  });

  it("is the search_cards path for Add Card and Mail Day", () => {
    const search = readFileSync(join(process.cwd(), "components/card-search.tsx"), "utf8");
    const form = readFileSync(join(process.cwd(), "components/card-form.tsx"), "utf8");
    const mail = readFileSync(join(process.cwd(), "components/mail-day-form.tsx"), "utf8");
    assert.match(search, /loadCatalogSearchSession\(/);
    assert.match(search, /session\.abort\(\)/);
    assert.match(search, /snapshot\.aborted \|\| id !== requestId\.current/);
    assert.match(search, /setLoading\(false\)/);
    assert.match(search, /searchCatalogRemote/);
    const remote = readFileSync(join(process.cwd(), "lib/catalog/search-remote.ts"), "utf8");
    assert.match(remote, /supabase\.rpc\("search_cards"/);
    assert.doesNotMatch(remote, /\.from\("cards"\)/);
    assert.match(search, /catalogSearchNeedsRetry\(snapshot\)/);
    assert.match(search, /CATALOG_SEARCH_TIMEOUT_MESSAGE/);
    assert.match(search, /setAttempt\(\(current\) => current \+ 1\)/);
    assert.equal(CATALOG_SEARCH_TIMEOUT_MESSAGE, "Search is taking too long. Try again");
    assert.equal(
      catalogSearchNeedsRetry({ aborted: false, timedOut: true, remote: null, results: [] }),
      true,
    );
    assert.equal(
      catalogSearchNeedsRetry({ aborted: false, timedOut: false, remote: null, results: [] }),
      true,
    );
    assert.equal(
      catalogSearchNeedsRetry({
        aborted: false,
        timedOut: true,
        remote: null,
        results: [lateSilver],
      }),
      false,
    );
    assert.equal(
      catalogSearchNeedsRetry({ aborted: false, timedOut: false, remote: [], results: [] }),
      false,
    );
    assert.equal(
      catalogSearchNeedsRetry({ aborted: true, timedOut: true, remote: null, results: [] }),
      false,
    );
    // Add card dropped its search for now. Mail Day keeps it.
    assert.doesNotMatch(form, /<CardSearch|@\/components\/card-search/);
    assert.match(mail, /<CardSearch/);
  });
});

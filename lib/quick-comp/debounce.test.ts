import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { CatalogCard } from "@/lib/card-catalog";
import { createLookupGate, identityFromCatalog, type QuickCompOutcome } from "./client";
import type { QuickCompIdentity } from "./identity";
import { createSuggestionTyping, type SuggestionState } from "./typing";

const wemby: CatalogCard = {
  id: "fixture-wemby",
  playerName: "Victor Wembanyama",
  yearLabel: "2023-24",
  setBrand: "Panini Prizm",
  cardNumber: "136",
  sport: "Basketball",
  parallel: "Base",
};

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("quick comp typing and lookups", () => {
  it("typing wemb fast makes one catalog search and zero lookups", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const searches: string[] = [];
      let lookups = 0;
      const gate = createLookupGate(async () => {
        lookups++;
        return { status: "error" };
      });
      const states: SuggestionState[] = [];
      const typing = createSuggestionTyping({
        search: async (query) => {
          searches.push(query);
          return [wemby];
        },
        onChange: (state) => states.push(state),
      });
      for (const query of ["w", "we", "wem", "wemb"]) {
        typing.type(query);
        mock.timers.tick(60);
      }
      mock.timers.tick(250);
      await flush();
      await flush();
      assert.deepEqual(searches, ["wemb"]);
      assert.equal(lookups, 0);
      assert.equal(gate.pending(identityFromCatalog(wemby, "PSA 10")!), false);
      const last = states[states.length - 1];
      assert.equal(last.status, "ready");
      typing.dispose();
    } finally {
      mock.timers.reset();
    }
  });

  it("a pick makes exactly one lookup, and a double tap still makes one", async () => {
    let lookups = 0;
    let release: (value: QuickCompOutcome) => void = () => {};
    const gate = createLookupGate(
      () =>
        new Promise<QuickCompOutcome>((resolve) => {
          lookups++;
          release = resolve;
        }),
    );
    const identity = identityFromCatalog(wemby, "PSA 10") as QuickCompIdentity;
    const first = gate.lookup(identity);
    const second = gate.lookup({ ...identity });
    assert.equal(lookups, 1);
    assert.equal(first, second);
    release({ status: "error" });
    await first;
    assert.equal(gate.pending(identity), false);
    // A new grade is its own lookup.
    void gate.lookup({ ...identity, grade: "PSA 9" });
    assert.equal(lookups, 2);
  });

  it("does not search for a single character", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      let searches = 0;
      const states: SuggestionState[] = [];
      const typing = createSuggestionTyping({
        search: async () => (searches++, []),
        onChange: (state) => states.push(state),
      });
      typing.type("w");
      mock.timers.tick(1000);
      await flush();
      assert.equal(searches, 0);
      assert.deepEqual(states, [{ status: "idle" }]);
    } finally {
      mock.timers.reset();
    }
  });
});

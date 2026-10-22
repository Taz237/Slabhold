import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSearchCardsArgs } from "@/lib/catalog/search-remote";
import {
  catalogSearchQuery,
  parseCardQuery,
  parseManualPrefill,
  tokensToMatch,
} from "@/lib/card-search-query";
import { matchesEverySearchWord } from "@/lib/search/words";

function searchWords(query: string): string[] {
  return tokensToMatch(parseCardQuery(query));
}

describe("catalog glued grades", () => {
  it("treats psa10, lebron psa10, and lebron psa 10 as the same search", () => {
    const spaced = searchWords("lebron psa 10");
    assert.deepEqual(searchWords("psa10 lebron"), spaced);
    assert.deepEqual(searchWords("lebron psa10"), spaced);
    assert.deepEqual(searchWords("LEBRON PSA10"), spaced);
    assert.deepEqual(spaced, ["lebron"]);
    assert.deepEqual(searchWords("lebron psa10 2018"), ["lebron", "2018"]);
  });

  it("keeps a #N card number that follows a grade phrase", () => {
    assert.equal(parseCardQuery("psa 10 #10").cardNumber, "10");
    assert.deepEqual(searchWords("psa 10 #10"), ["10"]);
    assert.equal(catalogSearchQuery("psa 10 #10"), "#10 psa 10");
  });

  it("keeps letter and hyphen suffixes on a hash number", () => {
    assert.equal(parseCardQuery("lebron #10A").cardNumber, "10A");
    assert.deepEqual(searchWords("lebron #10A"), ["lebron", "10a"]);
    const prefill = parseManualPrefill("lebron #10A");
    assert.equal(prefill.playerName, "Lebron");
    assert.equal(prefill.cardNumber, "10A");
    assert.equal(parseCardQuery("lebron #10-b").cardNumber, "10-B");
  });

  it("does not split a longer glued token", () => {
    assert.equal(catalogSearchQuery("psa10x"), "psa10x");
    assert.equal(catalogSearchQuery("psa100"), "psa100");
    assert.deepEqual(searchWords("psa10x"), ["psa10x"]);
    assert.deepEqual(searchWords("psa100"), ["psa100"]);
  });

  it("drops a glued decimal grade and keeps the player", () => {
    assert.deepEqual(searchWords("bgs9.5 ohtani"), ["ohtani"]);
    assert.deepEqual(searchWords("psa-10 lebron"), ["lebron"]);
    assert.deepEqual(searchWords("sgc10 lebron"), ["lebron"]);
    assert.deepEqual(searchWords("cgc9 ohtani"), ["ohtani"]);
    assert.deepEqual(searchWords("beckett9.5 ohtani"), ["ohtani"]);
  });

  it("treats glued grade words plus rookie, rc, card, or raw as a grade match", () => {
    const fields = ["LeBron James", "2018", "Prizm", "23"];
    for (const query of ["psa10 rookie", "psa 10 rookie", "psa10 rc", "psa10 card", "psa10 raw"]) {
      assert.equal(matchesEverySearchWord(query, fields, { grade: "PSA 10" }), true, query);
    }
  });

  it("sends the rewritten query to search_cards", () => {
    assert.deepEqual(buildSearchCardsArgs("psa 10 #10"), { q: "#10 psa 10", max_results: 20 });
    assert.deepEqual(buildSearchCardsArgs("psa10 lebron"), { q: "psa 10 lebron", max_results: 20 });
    assert.deepEqual(buildSearchCardsArgs("lebron #10A"), { q: "lebron #10A", max_results: 20 });
    const clipped = buildSearchCardsArgs(`${"a".repeat(99)}🔥zzzz`);
    assert.equal(clipped.q, `${"a".repeat(99)}🔥`);
    assert.doesNotThrow(() => encodeURIComponent(clipped.q));
  });
});

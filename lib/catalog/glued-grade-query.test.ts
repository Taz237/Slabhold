import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { catalogSearchQuery, parseCardQuery, tokensToMatch } from "@/lib/card-search-query";

function searchWords(query: string): string[] {
  return tokensToMatch(parseCardQuery(query));
}

describe("catalog glued grades", () => {
  it("treats psa10, lebron psa10, and lebron psa 10 as the same search", () => {
    const spaced = searchWords("lebron psa 10");
    assert.deepEqual(searchWords("psa10 lebron"), spaced);
    assert.deepEqual(searchWords("lebron psa10"), spaced);
    assert.deepEqual(spaced, ["lebron"]);
  });

  it("keeps a #N card number that follows a grade phrase", () => {
    assert.equal(parseCardQuery("psa 10 #10").cardNumber, "10");
    assert.deepEqual(searchWords("psa 10 #10"), ["10"]);
    assert.equal(catalogSearchQuery("psa 10 #10"), "#10 psa 10");
  });

  it("drops a glued decimal grade and keeps the player", () => {
    assert.deepEqual(searchWords("bgs9.5 ohtani"), ["ohtani"]);
    assert.deepEqual(searchWords("psa-10 lebron"), ["lebron"]);
    assert.deepEqual(searchWords("sgc10 lebron"), ["lebron"]);
    assert.deepEqual(searchWords("cgc9 ohtani"), ["ohtani"]);
    assert.deepEqual(searchWords("beckett9.5 ohtani"), ["ohtani"]);
  });

  it("sends the rewritten query to search_cards", () => {
    const remote = readFileSync(join(process.cwd(), "lib/catalog/search-remote.ts"), "utf8");
    assert.match(remote, /catalogSearchQuery\(query\)/);
    assert.match(remote, /supabase\.rpc\("search_cards"/);
  });
});

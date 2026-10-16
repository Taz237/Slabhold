import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { searchCatalog } from "@/lib/card-catalog";
import {
  expandAliasTokens,
  normalizeSearchText,
  parseCardQuery,
  parseManualPrefill,
} from "@/lib/card-search-query";

describe("normalizeSearchText", () => {
  it("lowercases, strips accents and punctuation", () => {
    assert.equal(normalizeSearchText("Luka Dončić"), "luka doncic");
    assert.equal(normalizeSearchText("Ant-Man"), "ant-man");
    assert.equal(normalizeSearchText("  PRIzM #136 "), "prizm 136");
    assert.equal(normalizeSearchText("2023-24"), "2023-24");
  });
});

describe("alias expansion (whole-word)", () => {
  it("expands nicknames to full player names", () => {
    assert.deepEqual(expandAliasTokens(["wemby"]), ["victor", "wembanyama"]);
    assert.deepEqual(expandAliasTokens(["bron"]), ["lebron", "james"]);
    assert.deepEqual(expandAliasTokens(["king", "james"]), [
      "lebron",
      "james",
    ]);
    assert.deepEqual(expandAliasTokens(["sga"]), [
      "shai",
      "gilgeous-alexander",
    ]);
    assert.deepEqual(expandAliasTokens(["ant"]), ["anthony", "edwards"]);
    assert.deepEqual(expandAliasTokens(["cc"]), ["caitlin", "clark"]);
  });

  it("does not expand cc inside other tokens", () => {
    const parsed = parseCardQuery("messi");
    assert.ok(!parsed.playerWords.includes("caitlin"));
    assert.deepEqual(parsed.playerWords, ["messi"]);
  });
});

describe("parseCardQuery", () => {
  it("pulls card number, year, and set words", () => {
    const parsed = parseCardQuery("prizm 136");
    assert.equal(parsed.cardNumber, "136");
    assert.ok(parsed.setWords.includes("prizm"));
  });

  it("parses season years and BCP-1 numbers", () => {
    assert.equal(parseCardQuery("2023-24 wemby").yearLabel, "2023-24");
    assert.equal(parseCardQuery("BCP-1").cardNumber, "BCP-1");
    assert.equal(parseCardQuery("#136").cardNumber, "136");
  });
});

describe("parseManualPrefill", () => {
  it("prefills player words, year, and number", () => {
    const prefill = parseManualPrefill("Wemby prizm #136 2023-24");
    assert.match(prefill.playerName.toLowerCase(), /victor|wembanyama/);
    assert.equal(prefill.yearLabel, "2023-24");
    assert.equal(prefill.cardNumber, "136");
  });
});

describe("searchCatalog ranking", () => {
  it("typo wembanyma and alias Wemby return Victor Wembanyama first", () => {
    const typo = searchCatalog("wembanyma");
    assert.ok(typo.length > 0);
    assert.equal(typo[0]!.playerName, "Victor Wembanyama");

    const alias = searchCatalog("Wemby");
    assert.ok(alias.length > 0);
    assert.equal(alias[0]!.playerName, "Victor Wembanyama");
  });

  it("lebron jame, King James, and Bron return LeBron James", () => {
    for (const q of ["lebron jame", "King James", "Bron"] as const) {
      const hits = searchCatalog(q);
      assert.ok(hits.length > 0, q);
      assert.equal(hits[0]!.playerName, "LeBron James", q);
    }
  });

  it("luka doncic without accent matches Luka Dončić", () => {
    const hits = searchCatalog("luka doncic");
    assert.ok(hits.length > 0);
    assert.equal(hits[0]!.playerName, "Luka Dončić");
  });

  it("prizm 136 returns Prizm #136 with Base first", () => {
    const hits = searchCatalog("prizm 136");
    assert.ok(hits.length > 0);
    assert.equal(hits[0]!.setBrand, "Panini Prizm");
    assert.equal(hits[0]!.cardNumber, "136");
    assert.equal(hits[0]!.parallel, "Base");
    assert.equal(hits[0]!.playerName, "Victor Wembanyama");
  });

  it("SGA and Ant return the right players", () => {
    const sga = searchCatalog("SGA");
    assert.ok(sga.length > 0);
    assert.equal(sga[0]!.playerName, "Shai Gilgeous-Alexander");

    const ant = searchCatalog("Ant");
    assert.ok(ant.length > 0);
    assert.equal(ant[0]!.playerName, "Anthony Edwards");
  });

  it("cc does not match Messi", () => {
    const hits = searchCatalog("cc");
    assert.ok(hits.length > 0);
    assert.equal(hits[0]!.playerName, "Caitlin Clark");
    assert.ok(hits.every((h) => h.playerName !== "Lionel Messi"));
  });

  it("zzqxv returns nothing", () => {
    assert.deepEqual(searchCatalog("zzqxv"), []);
  });
});

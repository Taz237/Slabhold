import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import {
  CARD_CATALOG,
  catalogSeedRows,
  resolveCatalogSearch,
  searchCatalog,
  toSearchableCard,
  type CatalogCard,
} from "@/lib/card-catalog";
import {
  buildSearchText,
  catalogCandidateAnchor,
  catalogCandidateRefusesScan,
  expandAliasTokens,
  normalizeSearchText,
  parseCardQuery,
  parseManualPrefill,
  prefilterCatalogCandidates,
  searchCardsLocal,
  type SearchableCard,
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

  it("puts a typed name into the player field", () => {
    const prefill = parseManualPrefill("Jaxson Dart");
    assert.equal(prefill.playerName, "Jaxson Dart");
  });

  it("reads Score, Chronicles, Phoenix, Contenders, Leaf, and Upper Deck as sets", () => {
    for (const set of ["Score", "Chronicles", "Phoenix", "Contenders", "Leaf", "Upper Deck"]) {
      const parsed = parseCardQuery(`2024 ${set}`);
      assert.equal(parsed.playerWords.join(" "), "", set);
      assert.ok(parsed.setWords.length > 0, set);
    }
    assert.deepEqual(parseCardQuery("2024 Upper Deck").setWords, ["upper", "deck"]);
  });

  it("leaves the player name empty when the query is only a set, year, or number", () => {
    const setOnly = parseManualPrefill("prizm");
    assert.equal(setOnly.playerName, "");
    assert.equal(setOnly.yearLabel, "");
    assert.equal(setOnly.cardNumber, "");

    const mixed = parseManualPrefill("2023 prizm 136");
    assert.equal(mixed.playerName, "");
    assert.equal(mixed.yearLabel, "2023");
    assert.equal(mixed.cardNumber, "136");
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

  it("prizm 136 ranks all #136 cards (Base then parallels) above other Prizm", () => {
    const hits = searchCatalog("prizm 136");
    assert.ok(hits.length > 0);
    assert.equal(hits[0]!.setBrand, "Panini Prizm");
    assert.equal(hits[0]!.cardNumber, "136");
    assert.equal(hits[0]!.parallel, "Base");
    assert.equal(hits[0]!.playerName, "Victor Wembanyama");

    const firstNon136 = hits.findIndex((h) => h.cardNumber !== "136");
    const last136 = hits.reduce(
      (last, h, i) => (h.cardNumber === "136" ? i : last),
      -1,
    );
    assert.ok(last136 >= 0);
    if (firstNon136 >= 0) {
      assert.ok(
        last136 < firstNon136,
        "every #136 must rank above non-#136 Prizm cards",
      );
    }
    const among136 = hits.filter((h) => h.cardNumber === "136");
    assert.ok(among136.length >= 1);
    assert.equal(among136[0]!.parallel, "Base");
  });

  it("SGA and Ant return the right players", () => {
    const sga = searchCatalog("SGA");
    assert.ok(sga.length > 0);
    assert.equal(sga[0]!.playerName, "Shai Gilgeous-Alexander");

    const ant = searchCatalog("Ant");
    assert.ok(ant.length > 0);
    assert.equal(ant[0]!.playerName, "Anthony Edwards");

    const antMan = searchCatalog("ant-man");
    assert.ok(antMan.length > 0);
    assert.equal(antMan[0]!.playerName, "Anthony Edwards");
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

  it("matches the CJ Stroud seed when the initials are dotted or spaced", () => {
    for (const query of ["c.j. stroud", "c j stroud"]) {
      const hits = searchCatalog(query);
      assert.ok(hits.length > 0, query);
      assert.ok(
        hits.every((hit) => hit.playerName === "CJ Stroud"),
        query,
      );
    }
  });

  it("puts the player match ahead of the same year and set", () => {
    const hits = searchCatalog("Wembanyama 2023 Prizm");
    assert.ok(hits.length > 0);
    assert.equal(hits[0]!.playerName, "Victor Wembanyama");
    assert.equal(hits[0]!.yearLabel, "2023-24");
    assert.equal(hits[0]!.setBrand, "Panini Prizm");
    assert.equal(hits[0]!.cardNumber, "136");
    assert.equal(hits[0]!.parallel, "Base");
    assert.ok(
      hits.every(
        (hit) =>
          hit.playerName === "Victor Wembanyama" &&
          hit.setBrand === "Panini Prizm" &&
          hit.yearLabel.startsWith("2023"),
      ),
    );
    assert.ok(hits.every((hit) => hit.playerName !== "CJ Stroud"));
  });

  it("matches partial, case, and accent-insensitive player words", () => {
    for (const query of ["wemb", "WEMB", "wemba", "Wembanyama"]) {
      const hits = searchCatalog(query);
      assert.ok(hits.length > 0, query);
      assert.ok(
        hits.every((hit) => hit.playerName === "Victor Wembanyama"),
        query,
      );
    }

    const dart = searchCatalog("JAXSON dart");
    assert.equal(dart[0]!.playerName, "Jaxson Dart");

    const accent = searchCatalog("Dončić");
    assert.equal(accent[0]!.playerName, "Luka Dončić");
  });

  it("finds Jaxson Dart 2025 Panini Prizm #332 and ignores other Prizm players", () => {
    for (const query of ["Jaxson Dart", "Dart 2025 Prizm", "dart prizm 332"]) {
      const hits = searchCatalog(query);
      assert.ok(hits.length > 0, query);
      assert.ok(
        hits.every((hit) => hit.playerName === "Jaxson Dart"),
        query,
      );
      assert.equal(hits[0]!.yearLabel, "2025", query);
      assert.equal(hits[0]!.setBrand, "Panini Prizm", query);
      assert.equal(hits[0]!.cardNumber, "332", query);
      assert.equal(hits[0]!.parallel, "Base", query);
      assert.equal(hits[0]!.sport, "Football", query);
    }
  });

  it("requires every word to match and ranks year ahead of set ahead of number", () => {
    assert.deepEqual(searchCatalog("Wembanyama Stroud"), []);
    assert.deepEqual(searchCatalog("Wembanyama Hoops Prizm"), []);

    const ohtani = searchCatalog("Ohtani 2018");
    assert.ok(ohtani.length > 0);
    assert.ok(ohtani.every((hit) => hit.playerName === "Shohei Ohtani"));
    assert.ok(ohtani.every((hit) => hit.yearLabel.startsWith("2018")));

    const season = searchCatalog("2023-24");
    const firstCalendarYear = season.findIndex((hit) => hit.yearLabel === "2023");
    const lastSeason = season.reduce(
      (last, hit, index) => (hit.yearLabel === "2023-24" ? index : last),
      -1,
    );
    assert.ok(lastSeason >= 0);
    if (firstCalendarYear >= 0) {
      assert.ok(lastSeason < firstCalendarYear);
    }

    const byPlayer = searchCardsLocal("Victor Wembanyama 2023 Prizm", [
      asSearchable({
        id: "set",
        player: "Victor",
        yearLabel: "2023-24",
        setName: "Wembanyama Prizm",
        cardNumber: "1",
      }),
      asSearchable({
        id: "real",
        player: "Victor Wembanyama",
        yearLabel: "2023-24",
        setName: "Panini Prizm",
        cardNumber: "136",
      }),
    ]);
    assert.equal(byPlayer[0]?.id, "real");

    const byYear = searchCardsLocal("A Player 2023", [
      asSearchable({
        id: "set-year-token",
        player: "A Player",
        yearLabel: "1999",
        setName: "2023 Prizm",
        cardNumber: "2",
      }),
      asSearchable({
        id: "year",
        player: "A Player",
        yearLabel: "2023",
        setName: "Hoops",
        cardNumber: "1",
      }),
    ]);
    assert.equal(byYear[0]?.id, "year");

    const bySet = searchCardsLocal("A Player 99", [
      asSearchable({
        id: "num-99",
        player: "A Player",
        yearLabel: "1999",
        setName: "Hoops",
        cardNumber: "99",
      }),
      asSearchable({
        id: "set-99",
        player: "A Player",
        yearLabel: "1999",
        setName: "99",
        cardNumber: "1",
      }),
    ]);
    assert.deepEqual(
      bySet.map((hit) => hit.id),
      ["set-99", "num-99"],
    );
  });

  it("ignores filler and grade words and matches parallel last", () => {
    const rookie = searchCatalog("wemby rookie");
    assert.ok(rookie.every((hit) => hit.playerName === "Victor Wembanyama"));
    assert.equal(rookie.filter((hit) => hit.parallel === "Base").length, 3);
    assert.ok(rookie.slice(0, 3).every((hit) => hit.parallel === "Base"));
    assert.deepEqual(
      rookie.map((hit) => hit.id),
      searchCatalog("wemby").map((hit) => hit.id),
    );

    const rc = searchCatalog("wemby rc");
    assert.deepEqual(
      rc.map((hit) => hit.id),
      rookie.map((hit) => hit.id),
    );

    const mahomes = searchCatalog("mahomes rookie card");
    assert.ok(mahomes.length > 0);
    assert.ok(mahomes.every((hit) => hit.playerName === "Patrick Mahomes"));

    const graded = searchCatalog("wembanyama psa 10");
    assert.ok(graded.length > 0);
    assert.ok(graded.every((hit) => hit.playerName === "Victor Wembanyama"));
    assert.deepEqual(
      searchCatalog("wembanyama bgs 9.5").map((hit) => hit.id),
      graded.map((hit) => hit.id),
    );

    const lukaBase = searchCatalog("luka prizm base");
    assert.equal(lukaBase.length, 1);
    assert.equal(lukaBase[0]?.playerName, "Luka Dončić");
    assert.equal(lukaBase[0]?.setBrand, "Panini Prizm");
    assert.equal(lukaBase[0]?.cardNumber, "280");
    assert.equal(lukaBase[0]?.parallel, "Base");

    const silver = searchCatalog("wemby silver");
    assert.equal(silver.length, 1);
    assert.equal(silver[0]?.playerName, "Victor Wembanyama");
    assert.equal(silver[0]?.setBrand, "Panini Prizm");
    assert.equal(silver[0]?.cardNumber, "136");
    assert.equal(silver[0]?.parallel, "Silver");

    const holo = searchCatalog("luka holo");
    assert.ok(holo.length > 0);
    assert.ok(
      holo.every(
        (hit) => hit.playerName === "Luka Dončić" && hit.parallel === "Holo",
      ),
    );

    const refractor = searchCatalog("ohtani refractor");
    assert.ok(refractor.length > 0);
    assert.ok(
      refractor.every(
        (hit) => hit.playerName === "Shohei Ohtani" && hit.parallel === "Refractor",
      ),
    );

    assert.deepEqual(searchCatalog("rookie"), []);

    const parallelLast = searchCardsLocal("prizm", [
      asSearchable({
        id: "parallel-name",
        player: "A Player",
        yearLabel: "2020",
        setName: "Hoops",
        cardNumber: "1",
        parallel: "Prizm",
      }),
      asSearchable({
        id: "set-name",
        player: "A Player",
        yearLabel: "2020",
        setName: "Panini Prizm",
        cardNumber: "2",
      }),
    ]);
    assert.deepEqual(
      parallelLast.map((hit) => hit.id),
      ["set-name", "parallel-name"],
    );
  });

  it("keeps jaxson dart, wemby rookie, and ohtani refractor after the candidate prefilter", () => {
    assert.equal(searchCatalog("jaxson dart").length, 1);
    assert.equal(searchCatalog("wemby rookie").length, 4);
    assert.equal(searchCatalog("ohtani refractor").length, 1);

    const all = CARD_CATALOG.map(toSearchableCard);
    for (const query of ["jaxson dart", "wemby rookie", "ohtani refractor"] as const) {
      const full = searchCardsLocal(query, all).map((hit) => hit.id);
      const narrowed = searchCardsLocal(
        query,
        prefilterCatalogCandidates(all, parseCardQuery(query)),
      ).map((hit) => hit.id);
      assert.deepEqual(narrowed, full, query);
    }
  });

  it("finds Donruss #301 for bucky irving rated rookie and ranks that rookie first", () => {
    const parsed = parseCardQuery("bucky irving rated rookie");
    assert.equal(parsed.rookieQuery, true);
    assert.deepEqual(parsed.playerWords, ["bucky", "irving"]);
    assert.deepEqual(parseCardQuery("bucky irving rated rookies").playerWords, ["bucky", "irving"]);
    assert.deepEqual(parseCardQuery("bucky irving rc").playerWords, ["bucky", "irving"]);
    assert.equal(parseCardQuery("rookies").rookieQuery, true);

    const hits = searchCardsLocal("bucky irving rated rookie", [
      asSearchable({
        id: "prizm",
        player: "Bucky Irving",
        yearLabel: "2024",
        setName: "Panini Prizm",
        cardNumber: "400",
        parallel: "Base",
      }),
      asSearchable({
        id: "rated-parallel",
        player: "Bucky Irving",
        yearLabel: "2024",
        setName: "Panini Donruss",
        cardNumber: "999",
        parallel: "Rated Rookie",
      }),
      asSearchable({
        id: "donruss-301",
        player: "Bucky Irving",
        yearLabel: "2024",
        setName: "Donruss",
        cardNumber: "301",
        parallel: "Base",
        isRookie: true,
      }),
    ]);
    assert.equal(hits[0]?.setName, "Donruss");
    assert.equal(hits[0]?.cardNumber, "301");
    assert.equal(hits[0]?.parallel, "Base");
    assert.equal(hits[0]?.isRookie, true);
    assert.deepEqual(
      hits.map((hit) => hit.id),
      ["donruss-301", "prizm", "rated-parallel"],
    );
  });
});

describe("catalog candidate prefilter", () => {
  it("anchors on the player when a parallel word is longer", () => {
    assert.equal(catalogCandidateAnchor(["ohtani", "refractor"]), "ohtani");
    assert.equal(catalogCandidateAnchor(["jaxson", "dart"]), "jaxson");
    assert.equal(catalogCandidateAnchor(["victor", "wembanyama"]), "wembanyama");
    assert.equal(catalogCandidateAnchor(["refractor"]), null);
    assert.equal(catalogCandidateRefusesScan(parseCardQuery("refractor")), true);
    assert.equal(catalogCandidateRefusesScan(parseCardQuery("prizm")), false);
    assert.equal(catalogCandidateRefusesScan(parseCardQuery("2024")), false);
    assert.equal(catalogCandidateRefusesScan(parseCardQuery("332")), false);
  });

  it("returns at most 300 candidates and still keeps a distinctive player", () => {
    const cards = Array.from({ length: 400 }, (_, index) =>
      asSearchable({
        id: `jaxson-${index}`,
        player: `Jaxson Player ${index}`,
        yearLabel: "2024",
        setName: "Panini Prizm",
        cardNumber: String(index + 1),
      }),
    );
    cards.push(
      asSearchable({
        id: "zzqxv",
        player: "Zzqxv Unique",
        yearLabel: "1999",
        setName: "Hoops",
        cardNumber: "7",
      }),
    );
    const capped = prefilterCatalogCandidates(cards, parseCardQuery("jaxson"));
    assert.equal(capped.length, 300);
    assert.equal(capped.every((card) => card.player.startsWith("Jaxson")), true);

    const distinctive = prefilterCatalogCandidates(cards, parseCardQuery("zzqxv"));
    assert.deepEqual(
      distinctive.map((card) => card.id),
      ["zzqxv"],
    );
    assert.deepEqual(prefilterCatalogCandidates(cards, parseCardQuery("silver")), []);
  });

  it("keeps Josh Allen ahead of more than 300 Allen Iverson rows", () => {
    const cards = Array.from({ length: 301 }, (_, index) =>
      asSearchable({
        id: `iverson-${index}`,
        player: "Allen Iverson",
        yearLabel: "1996",
        setName: "Topps",
        cardNumber: String(index + 1),
      }),
    );
    cards.push(
      asSearchable({
        id: "josh",
        player: "Josh Allen",
        yearLabel: "2018",
        setName: "Panini Prizm",
        cardNumber: "205",
      }),
    );
    const query = "josh allen";
    const candidates = prefilterCatalogCandidates(cards, parseCardQuery(query));
    assert.equal(candidates.length, 300);
    assert.equal(candidates[0]?.id, "josh");
    const hits = searchCardsLocal(query, candidates);
    assert.equal(hits[0]?.player, "Josh Allen");
  });

  it("finds Bo Nix Optic Preview Pink when preview is the longer word", () => {
    const cards = Array.from({ length: 301 }, (_, index) =>
      asSearchable({
        id: `preview-${index}`,
        player: `Preview Player ${index}`,
        yearLabel: "2024",
        setName: "Panini Donruss",
        cardNumber: String(index + 1),
      }),
    );
    cards.push(
      asSearchable({
        id: "nix",
        player: "Bo Nix",
        yearLabel: "2024",
        setName: "Panini Donruss",
        cardNumber: "301",
        parallel: "Optic Preview Pink",
      }),
    );
    const query = "bo nix optic preview pink";
    const hits = searchCardsLocal(
      query,
      prefilterCatalogCandidates(cards, parseCardQuery(query)),
    );
    assert.equal(hits[0]?.id, "nix");
    assert.equal(hits[0]?.player, "Bo Nix");
    assert.equal(hits[0]?.parallel, "Optic Preview Pink");
  });

  it("finds Burrow Chrome Variation when variation is the longer word", () => {
    const cards = Array.from({ length: 301 }, (_, index) =>
      asSearchable({
        id: `variation-${index}`,
        player: `Variation Player ${index}`,
        yearLabel: "2020",
        setName: "Topps Chrome",
        cardNumber: String(index + 1),
      }),
    );
    cards.push(
      asSearchable({
        id: "burrow",
        player: "Joe Burrow",
        yearLabel: "2020",
        setName: "Topps Chrome",
        cardNumber: "1",
        parallel: "Variation",
      }),
    );
    const query = "burrow chrome variation";
    const hits = searchCardsLocal(
      query,
      prefilterCatalogCandidates(cards, parseCardQuery(query)),
    );
    assert.equal(hits[0]?.id, "burrow");
    assert.equal(hits[0]?.player, "Joe Burrow");
    assert.equal(hits[0]?.setName, "Topps Chrome");
    assert.equal(hits[0]?.parallel, "Variation");
  });

  it("keeps Joe Burrow when 300 rookie rows also match joe", () => {
    const cards = Array.from({ length: 301 }, (_, index) =>
      asSearchable({
        id: `joe-rookie-${index}`,
        player: `Joe Player ${index}`,
        yearLabel: "2020",
        setName: "Panini Prizm",
        cardNumber: String(index + 1),
        isRookie: true,
      }),
    );
    cards.push(
      asSearchable({
        id: "burrow-base",
        player: "Joe Burrow",
        yearLabel: "2020",
        setName: "Panini Prizm",
        cardNumber: "307",
        parallel: "Base",
        isRookie: false,
      }),
      asSearchable({
        id: "burrow-silver",
        player: "Joe Burrow",
        yearLabel: "2020",
        setName: "Panini Prizm",
        cardNumber: "307",
        parallel: "Silver",
        isRookie: false,
      }),
    );
    const query = "joe burrow rookie";
    const candidates = prefilterCatalogCandidates(cards, parseCardQuery(query));
    assert.equal(candidates.length, 300);
    assert.ok(candidates.some((card) => card.id === "burrow-base"));
    assert.ok(candidates.some((card) => card.id === "burrow-silver"));
    const hits = searchCardsLocal(query, candidates);
    assert.ok(hits.length > 0);
    assert.ok(hits.every((hit) => hit.player === "Joe Burrow"));
    assert.deepEqual(
      hits.map((hit) => hit.id).sort(),
      ["burrow-base", "burrow-silver"],
    );
  });

  it("matches Bedard Upper Deck Series 2 when 2 is a card-number token", () => {
    const all = CARD_CATALOG.map(toSearchableCard);
    const query = "bedard upper deck series 2";
    const full = searchCardsLocal(query, all);
    const narrowed = searchCardsLocal(
      query,
      prefilterCatalogCandidates(all, parseCardQuery(query)),
    );
    assert.ok(full.length > 0);
    assert.ok(full.every((hit) => hit.player === "Connor Bedard"));
    assert.ok(full.every((hit) => hit.setName === "Upper Deck Series 2"));
    assert.deepEqual(
      narrowed.map((hit) => hit.id),
      full.map((hit) => hit.id),
    );
  });
});

function asSearchable(card: {
  id: string;
  player: string;
  yearLabel: string;
  setName: string;
  cardNumber: string;
  parallel?: string;
  isRookie?: boolean;
}): SearchableCard {
  const parallel = card.parallel ?? "Base";
  return {
    id: card.id,
    player: card.player,
    yearLabel: card.yearLabel,
    setName: card.setName,
    cardNumber: card.cardNumber,
    parallel,
    sport: "Basketball",
    isRookie: card.isRookie === true,
    searchText: buildSearchText(card),
  };
}

describe("search_cards rookie migration", () => {
  it("drops and recreates search_cards with is_rookie and the same safeguards", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261022140000_search_cards_rookie_words.sql"),
      "utf8",
    );
    assert.match(sql, /set local lock_timeout = '5s'/);
    assert.match(sql, /drop function if exists public\.search_cards\(text, int\)/);
    assert.match(sql, /security definer/);
    assert.match(sql, /set search_path = public, extensions/);
    assert.match(sql, /set statement_timeout = '1s'/);
    assert.match(sql, /c\.status = 'verified'/);
    assert.match(sql, /is_rookie boolean/);
    assert.match(sql, /grant execute on function public\.search_cards\(text, int\) to anon, authenticated/);
    assert.match(sql, /notify pgrst, 'reload schema'/);
    assert.match(sql, /want_rookie and phrase is null/);
    assert.match(sql, /tokens\[ti \+ 1\] in \('rookie', 'rookies'\)/);
    assert.match(sql, /perform extensions\.word_similarity\('a', 'a'\)/);
    assert.ok(
      sql.indexOf("perform extensions.word_similarity") <
        sql.indexOf("create or replace function"),
    );
    assert.doesNotMatch(sql, /drop table/i);
    assert.doesNotMatch(sql, /delete from/i);
    assert.doesNotMatch(sql, /truncate/i);
  });
});

describe("resolveCatalogSearch before and after the migration", () => {
  it("re-ranks a loose remote list so the player match comes first", () => {
    const stroud = CARD_CATALOG.find(
      (card) => card.playerName === "CJ Stroud" && card.parallel === "Base",
    );
    const select = CARD_CATALOG.find(
      (card) =>
        card.playerName === "Victor Wembanyama" && card.setBrand === "Panini Select",
    );
    const prizm = CARD_CATALOG.find(
      (card) =>
        card.playerName === "Victor Wembanyama" &&
        card.setBrand === "Panini Prizm" &&
        card.parallel === "Base",
    );
    assert.ok(stroud && select && prizm);

    const ranked = resolveCatalogSearch("Wembanyama 2023 Prizm", [
      stroud,
      select,
      prizm,
    ]);
    assert.equal(ranked[0]?.id, prizm.id);
    assert.ok(ranked.every((card) => card.setBrand === "Panini Prizm"));
    assert.ok(ranked.every((card) => card.playerName === "Victor Wembanyama"));
  });

  it("treats an empty remote list as no match, including color words and Jaxson Dart", () => {
    assert.ok(searchCatalog("silver").length > 0);
    assert.deepEqual(resolveCatalogSearch("silver", []), []);
    assert.deepEqual(resolveCatalogSearch("refractor", []), []);
    assert.deepEqual(resolveCatalogSearch("base", []), []);
    assert.deepEqual(resolveCatalogSearch("Jaxson Dart", []), []);

    const tatum = CARD_CATALOG.filter((card) => card.playerName === "Jayson Tatum");
    assert.ok(tatum.length > 0);
    const unrelated = resolveCatalogSearch("Jaxson Dart", tatum);
    assert.deepEqual(unrelated, []);

    const dart = CARD_CATALOG.find((card) => card.playerName === "Jaxson Dart");
    assert.ok(dart);
    const afterMigration = resolveCatalogSearch("Jaxson Dart", [dart]);
    assert.deepEqual(
      afterMigration.map((card) => card.id),
      [dart.id],
    );
  });

  it("keeps a genuine miss empty", () => {
    assert.deepEqual(resolveCatalogSearch("zzqxv", []), []);
    assert.deepEqual(resolveCatalogSearch("zzqxv", null), []);
  });

  it("does not add built-in cards when remote search already returned rows", () => {
    const remote = CARD_CATALOG.filter((card) => card.playerName !== "Jaxson Dart");
    const hits = resolveCatalogSearch("2025 prizm", remote);
    assert.ok(hits.every((card) => card.playerName !== "Jaxson Dart"));
    assert.ok(hits.some((card) => card.playerName === "Travis Hunter"));
    assert.ok(hits.every((card) => card.cardNumber === "301"));
    assert.ok(hits.every((card) => card.yearLabel.startsWith("2025")));
    assert.ok(hits.every((card) => card.setBrand.toLowerCase().includes("prizm")));

    assert.deepEqual(resolveCatalogSearch("2025 prizm", []), []);
    const offline = resolveCatalogSearch("2025 prizm", null);
    const dart = offline.find((card) => card.playerName === "Jaxson Dart");
    assert.equal(dart?.cardNumber, "332");
    assert.equal(dart?.isRookie, true);
  });

  it("returns exactly one remote Select #87 for wembanyama select", () => {
    const remote: CatalogCard = {
      id: "remote-wemby-select-87",
      playerName: "Victor Wembanyama",
      yearLabel: "2023-24",
      setBrand: "Panini Select",
      cardNumber: "87",
      sport: "Basketball",
      parallel: "Base",
    };
    const hits = resolveCatalogSearch("wembanyama select", [remote]);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.id, remote.id);
    assert.equal(hits[0]?.setBrand, "Panini Select");
    assert.equal(hits[0]?.cardNumber, "87");
    assert.equal(hits[0]?.parallel, "Base");
  });

  it("does not return built-in #1 beside remote Travis Hunter Prizm #301", () => {
    const remote: CatalogCard[] = [
      {
        id: "remote-hunter-301-base",
        playerName: "Travis Hunter",
        yearLabel: "2025",
        setBrand: "Panini Prizm",
        cardNumber: "301",
        sport: "Football",
        parallel: "Base",
        isRookie: true,
      },
      {
        id: "remote-hunter-301-silver",
        playerName: "Travis Hunter",
        yearLabel: "2025",
        setBrand: "Panini Prizm",
        cardNumber: "301",
        sport: "Football",
        parallel: "Silver",
        isRookie: true,
      },
    ];
    const hits = resolveCatalogSearch("travis hunter prizm", remote);
    assert.deepEqual(
      hits.map((card) => card.id),
      remote.map((card) => card.id),
    );
    assert.ok(hits.every((card) => card.cardNumber === "301"));
    assert.equal(hits.some((card) => card.cardNumber === "1"), false);
  });

  it("falls back to built-in cards only when remote is null", () => {
    assert.deepEqual(resolveCatalogSearch("travis hunter prizm", []), []);
    assert.deepEqual(resolveCatalogSearch("jayden daniels prizm", []), []);

    const hunter = resolveCatalogSearch("travis hunter prizm", null);
    assert.ok(hunter.length > 0);
    assert.ok(hunter.every((card) => card.playerName === "Travis Hunter"));
    assert.ok(hunter.every((card) => card.cardNumber === "301"));
    assert.ok(hunter.every((card) => card.isRookie === true));
    assert.equal(hunter.some((card) => card.cardNumber === "1"), false);

    const daniels = resolveCatalogSearch("jayden daniels prizm", null);
    assert.ok(daniels.length > 0);
    assert.ok(daniels.every((card) => card.cardNumber === "347"));
    assert.ok(daniels.every((card) => card.isRookie === true));
    assert.equal(daniels.some((card) => card.cardNumber === "389"), false);

    const dart = resolveCatalogSearch("Jaxson Dart", null);
    assert.equal(dart[0]?.playerName, "Jaxson Dart");
    assert.equal(dart[0]?.cardNumber, "332");
    assert.equal(dart[0]?.parallel, "Base");
    assert.equal(dart[0]?.isRookie, true);
  });

  it("stores the corrected seed numbers and rookie flags", () => {
    const of = (player: string, set: string) =>
      CARD_CATALOG.filter((card) => card.playerName === player && card.setBrand === set);

    const select = of("Victor Wembanyama", "Panini Select");
    assert.deepEqual(
      select.map((card) => [card.cardNumber, card.parallel, card.isRookie === true]),
      [["87", "Base", false]],
    );

    const hoops = of("Victor Wembanyama", "Hoops");
    assert.deepEqual(
      hoops.map((card) => [card.cardNumber, card.parallel, card.isRookie === true]),
      [["277", "Base", true]],
    );

    const daniels = of("Jayden Daniels", "Panini Prizm");
    assert.deepEqual(new Set(daniels.map((card) => card.parallel)), new Set(["Base", "Silver"]));
    assert.ok(daniels.every((card) => card.cardNumber === "347" && card.isRookie === true));

    const hunter = of("Travis Hunter", "Panini Prizm");
    assert.deepEqual(new Set(hunter.map((card) => card.parallel)), new Set(["Base", "Silver"]));
    assert.ok(hunter.every((card) => card.cardNumber === "301" && card.isRookie === true));

    const elly = of("Elly De La Cruz", "Topps Chrome");
    assert.ok(elly.length >= 2);
    assert.ok(elly.every((card) => card.cardNumber === "44" && card.isRookie === true));
    assert.deepEqual(new Set(elly.map((card) => card.parallel)), new Set(["Base", "Refractor"]));

    const caleb = of("Caleb Williams", "Panini Prizm");
    assert.deepEqual(new Set(caleb.map((card) => card.parallel)), new Set(["Base", "Silver"]));
    assert.ok(caleb.every((card) => card.cardNumber === "301" && card.isRookie === true));

    const dart = of("Jaxson Dart", "Panini Prizm");
    assert.deepEqual(
      dart.map((card) => [card.cardNumber, card.parallel, card.isRookie === true]),
      [["332", "Base", true]],
    );

    const rows = catalogSeedRows();
    const dartRow = rows.find((row) => row.player === "Jaxson Dart" && row.card_number === "332");
    assert.equal(dartRow?.is_rookie, true);
    const curry = rows.find((row) => row.player === "Stephen Curry");
    assert.equal(curry?.is_rookie, false);
    const hunterRows = rows.filter((row) => row.player === "Travis Hunter");
    assert.ok(hunterRows.length >= 2);
    assert.ok(hunterRows.every((row) => row.card_number === "301" && row.is_rookie === true));
    assert.ok(rows.every((row) => typeof row.is_rookie === "boolean"));

    const script = readFileSync(join(process.cwd(), "scripts/gen-catalog-migration.ts"), "utf8");
    assert.match(script, /is_rookie boolean not null default false/);
    assert.match(
      script,
      /insert into public\.card_catalog \(player, year_label, set_name, card_number, parallel, sport, is_rookie\)/,
    );
    assert.match(script, /\$\{r\.is_rookie \? "true" : "false"\}/);
  });
});

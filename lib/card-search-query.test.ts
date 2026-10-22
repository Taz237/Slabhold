import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CARD_CATALOG,
  resolveCatalogSearch,
  searchCatalog,
} from "@/lib/card-catalog";
import {
  buildSearchText,
  expandAliasTokens,
  normalizeSearchText,
  parseCardQuery,
  parseManualPrefill,
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
    assert.ok(hits.every((hit) => hit.playerName !== "C.J. Stroud"));
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
});

function asSearchable(card: {
  id: string;
  player: string;
  yearLabel: string;
  setName: string;
  cardNumber: string;
  parallel?: string;
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
    searchText: buildSearchText(card),
  };
}

describe("resolveCatalogSearch before and after the migration", () => {
  it("re-ranks a loose remote list so the player match comes first", () => {
    const stroud = CARD_CATALOG.find(
      (card) => card.playerName === "C.J. Stroud" && card.parallel === "Base",
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

  it("uses the local catalog when the remote list has no real match", () => {
    const beforeMigration = resolveCatalogSearch("Jaxson Dart", []);
    assert.equal(beforeMigration[0]?.playerName, "Jaxson Dart");
    assert.equal(beforeMigration[0]?.cardNumber, "332");

    const tatum = CARD_CATALOG.filter((card) => card.playerName === "Jayson Tatum");
    const ignored = resolveCatalogSearch("Jaxson Dart", tatum);
    assert.equal(ignored[0]?.playerName, "Jaxson Dart");

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

  it("adds the local Jaxson Dart row to 2025 prizm before the insert runs", () => {
    const remote = CARD_CATALOG.filter((card) => card.playerName !== "Jaxson Dart");
    const hits = resolveCatalogSearch("2025 prizm", remote);
    const dart = hits.filter((card) => card.playerName === "Jaxson Dart");
    assert.equal(dart.length, 1);
    assert.equal(dart[0]?.yearLabel, "2025");
    assert.equal(dart[0]?.setBrand, "Panini Prizm");
    assert.equal(dart[0]?.cardNumber, "332");
    assert.equal(dart[0]?.parallel, "Base");
    assert.ok(hits.every((card) => card.yearLabel.startsWith("2025")));
    assert.ok(hits.every((card) => card.setBrand.toLowerCase().includes("prizm")));
    assert.ok(hits.some((card) => card.playerName === "Travis Hunter"));
  });
});

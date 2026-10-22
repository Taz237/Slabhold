import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { resolveCatalogSearch, type CatalogCard } from "@/lib/card-catalog";
import {
  CATALOG_SEARCH_DEBOUNCE_MS,
  loadCatalogSearchSession,
} from "@/lib/catalog/catalog-search-session";
import { parseCardQuery } from "@/lib/card-search-query";
import {
  SEARCH_CATALOG_LIMIT,
  catalogAddHref,
  catalogCardFromParams,
  catalogResultLine,
  catalogSecondaryLink,
} from "@/lib/search/catalog-results";
import { showSearchMissLink } from "@/lib/search/sections";
import {
  matchesEverySearchWord,
  matchesPlainWords,
  meaningfulSearchWords,
  ownCardSearchFields,
  plainSearchWords,
} from "@/lib/search/words";

function cardMatch(
  query: string,
  card: {
    playerName: string;
    year: number;
    yearLabel?: string;
    setBrand: string;
    cardNumber?: string;
    parallel?: string;
    team?: string;
    grade?: string | null;
  },
) {
  return matchesEverySearchWord(query, ownCardSearchFields(card), { grade: card.grade });
}

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const bucky: CatalogCard = {
  id: "donruss-301",
  playerName: "Bucky Irving",
  yearLabel: "2024",
  setBrand: "Donruss",
  cardNumber: "301",
  parallel: "Base",
  sport: "Football",
  isRookie: true,
};

const buckyPrizm: CatalogCard = {
  ...bucky,
  id: "prizm-400",
  setBrand: "Panini Prizm",
  cardNumber: "400",
  isRookie: false,
};

const other: CatalogCard = {
  id: "other",
  playerName: "Baker Mayfield",
  yearLabel: "2018",
  setBrand: "Panini Prizm",
  cardNumber: "201",
  parallel: "Base",
  sport: "Football",
};

const queries = ["Bucky Irving rookie", "irving bucky", "2024 bucky", "  BUCKY   irving  rookie card "] as const;

describe("search word split", () => {
  it("matches every word in any order and treats rookie words as filler", () => {
    assert.deepEqual(meaningfulSearchWords("Bucky Irving rookie"), ["bucky", "irving"]);
    assert.deepEqual(meaningfulSearchWords("Bucky Irving rc"), ["bucky", "irving"]);
    assert.deepEqual(meaningfulSearchWords("Bucky Irving rookie card"), ["bucky", "irving"]);
    assert.equal(parseCardQuery("Bucky Irving rookie").rookieQuery, true);
    assert.equal(parseCardQuery("bucky rc").rookieQuery, true);

    for (const query of ["Bucky Irving rookie", "irving bucky", "rookie irving bucky", "  bucky   irving  "]) {
      assert.equal(matchesEverySearchWord(query, ["Bucky Irving"]), true, query);
      assert.equal(matchesEverySearchWord(query, ["Just pulled Bucky Irving today"]), true, query);
    }
    assert.equal(matchesEverySearchWord("bucky mahomes", ["Bucky Irving"]), false);
    assert.equal(matchesEverySearchWord("2024 bucky", ["Bucky Irving"]), false);
    assert.equal(matchesEverySearchWord("rookie", ["Bucky Irving rookie"]), true);
    assert.equal(
      matchesEverySearchWord("psa 10", ["2010 rookie"], { grade: "PSA 10" }),
      true,
    );
    assert.equal(matchesEverySearchWord("@Bucky Irving", ["bucky", "Bucky Irving"]), true);
  });

  it("keeps grade words on the grade only and does not alias people or posts", () => {
    const base = {
      yearLabel: "2024",
      setBrand: "Topps",
      parallel: "Base",
      team: "Dodgers",
    };
    assert.equal(
      cardMatch("lebron psa 10", {
        ...base,
        playerName: "LeBron James",
        year: 2010,
        yearLabel: "2010",
        cardNumber: "23",
        grade: "PSA 9",
      }),
      false,
    );
    assert.equal(
      cardMatch("lebron psa 10", {
        ...base,
        playerName: "LeBron James",
        year: 2024,
        cardNumber: "10",
        grade: "PSA 9",
      }),
      false,
    );
    assert.equal(
      cardMatch("wemby psa 9", {
        ...base,
        playerName: "Victor Wembanyama",
        year: 2019,
        yearLabel: "2019",
        cardNumber: "277",
        grade: "PSA 10",
      }),
      false,
    );
    assert.equal(
      cardMatch("psa 10", {
        ...base,
        playerName: "LeBron James",
        year: 2010,
        yearLabel: "2010",
        cardNumber: "23",
        grade: "PSA 8",
      }),
      false,
    );
    assert.equal(
      cardMatch("ohtani bgs 9.5", {
        ...base,
        playerName: "Shohei Ohtani",
        year: 2024,
        cardNumber: "150",
        grade: "BGS 9",
      }),
      false,
    );
    assert.equal(
      cardMatch("ohtani bgs 9.5", {
        ...base,
        playerName: "Shohei Ohtani",
        year: 2024,
        cardNumber: "150",
        grade: "BGS 9.5",
      }),
      true,
    );
    assert.equal(
      cardMatch("ohtani graded", {
        ...base,
        playerName: "Shohei Ohtani",
        year: 2024,
        cardNumber: "1",
        grade: "PSA 10",
      }),
      true,
    );
    assert.equal(
      cardMatch("10 psa", {
        ...base,
        playerName: "LeBron James",
        year: 2010,
        yearLabel: "2010",
        cardNumber: "23",
        grade: "PSA 9",
      }),
      false,
    );
    assert.equal(
      cardMatch("10 psa", {
        ...base,
        playerName: "LeBron James",
        year: 2024,
        cardNumber: "10",
        grade: "PSA 9",
      }),
      false,
    );
    assert.equal(
      cardMatch("lebron 10 psa", {
        ...base,
        playerName: "LeBron James",
        year: 2010,
        yearLabel: "2010",
        cardNumber: "23",
        grade: "PSA 9",
      }),
      false,
    );
    assert.equal(
      cardMatch("9.5 bgs", {
        ...base,
        playerName: "Shohei Ohtani",
        year: 2024,
        cardNumber: "150",
        grade: "BGS 9",
      }),
      false,
    );
    assert.equal(
      cardMatch("10 psa", {
        ...base,
        playerName: "LeBron James",
        year: 2010,
        yearLabel: "2010",
        cardNumber: "23",
        grade: "PSA 10",
      }),
      true,
    );
    const fleer = {
      ...base,
      playerName: "Michael Jordan",
      year: 1986,
      yearLabel: "1986",
      setBrand: "Fleer",
      cardNumber: "57",
      grade: "PSA 8",
    };
    for (const query of ["jordan 57 psa 8", "jordan #57 psa 8", "1986 fleer jordan 57 psa 8"]) {
      assert.equal(cardMatch(query, fleer), true, query);
    }
    const lebron23 = {
      ...base,
      playerName: "LeBron James",
      year: 2003,
      yearLabel: "2003",
      cardNumber: "23",
      grade: "PSA 10",
    };
    assert.equal(cardMatch("lebron 23 psa 10", lebron23), true);
    assert.equal(cardMatch("lebron #23 psa 10", lebron23), true);
    assert.equal(
      cardMatch("lebron 23 bgs 9.5", {
        ...lebron23,
        grade: "BGS 9.5",
      }),
      true,
    );
    assert.equal(
      cardMatch("lebron 1 psa 10", {
        ...base,
        playerName: "LeBron James",
        year: 2003,
        yearLabel: "2003",
        cardNumber: "1",
        grade: "PSA 10",
      }),
      true,
    );
    const numbered = {
      ...base,
      playerName: "LeBron James",
      year: 2024,
      yearLabel: "2024",
    };
    assert.equal(
      cardMatch("psa 10 #10", { ...numbered, cardNumber: "10", grade: "PSA 10" }),
      true,
    );
    assert.equal(
      cardMatch("gem mint #10", { ...numbered, cardNumber: "10", grade: "PSA 10" }),
      true,
    );
    assert.equal(
      cardMatch("psa 9 #8", { ...numbered, cardNumber: "8", grade: "PSA 9" }),
      true,
    );
    assert.equal(
      cardMatch("lebron #8 psa", { ...numbered, cardNumber: "8", grade: "PSA 9" }),
      true,
    );
    assert.equal(
      cardMatch("psa 10 #10", { ...numbered, cardNumber: "10", grade: "PSA 9" }),
      false,
    );
    // #N is a card number. Dropping the leading-# token in gradeNeed makes this miss.
    assert.equal(
      cardMatch("#10 psa", { ...numbered, cardNumber: "10", grade: "PSA 9" }),
      true,
    );
    assert.equal(
      cardMatch("lebron graded", {
        ...base,
        playerName: "LeBron James",
        year: 2024,
        cardNumber: "23",
        grade: "Raw",
      }),
      false,
    );
    assert.equal(
      cardMatch("lebron graded", {
        ...base,
        playerName: "LeBron James",
        year: 2024,
        cardNumber: "23",
        grade: "PSA 10",
      }),
      true,
    );
    assert.equal(
      cardMatch("psa10", {
        ...base,
        playerName: "LeBron James",
        year: 2024,
        cardNumber: "23",
        grade: "PSA 10",
      }),
      true,
    );
    assert.equal(
      cardMatch("psa-10", {
        ...base,
        playerName: "LeBron James",
        year: 2010,
        yearLabel: "2010",
        cardNumber: "10",
        grade: "PSA 9",
      }),
      false,
    );
    assert.equal(
      cardMatch("bgs9.5", {
        ...base,
        playerName: "Shohei Ohtani",
        year: 2024,
        cardNumber: "150",
        grade: "BGS 9.5",
      }),
      true,
    );
    assert.deepEqual(meaningfulSearchWords("psa 10"), []);
    assert.deepEqual(meaningfulSearchWords("rookie"), []);
    assert.deepEqual(plainSearchWords("psa 10"), ["psa", "10"]);
    assert.deepEqual(plainSearchWords("rookie"), ["rookie"]);

    assert.deepEqual(plainSearchWords("bron"), ["bron"]);
    assert.deepEqual(plainSearchWords("@bron_fan"), ["bron", "fan"]);
    assert.deepEqual(plainSearchWords("bron_fan"), ["bron", "fan"]);
    assert.deepEqual(plainSearchWords("kd"), ["kd"]);
    assert.deepEqual(plainSearchWords("ant"), ["ant"]);
    assert.notDeepEqual(plainSearchWords("bron"), meaningfulSearchWords("bron"));

    for (const query of ["bron", "@bron_fan", "bron_fan"]) {
      assert.equal(matchesPlainWords(query, ["bron_fan", "Bron Fan"]), true, query);
    }
    assert.equal(matchesPlainWords("kd", ["kd_cards", "KD Cards"]), true);
    assert.equal(matchesPlainWords("ant", ["antonio", "Antonio"]), true);
    assert.equal(matchesPlainWords("psa 10", ["PSA 10 rookie"]), true);
    assert.equal(matchesPlainWords("rookie", ["PSA 10 rookie"]), true);
    assert.equal(matchesPlainWords("田中", ["田中 太郎"]), true);
    assert.equal(matchesPlainWords("日本", ["来自日本"]), true);
    assert.equal(matchesPlainWords("🔥", ["pulled 🔥 today"]), true);
    assert.equal(matchesEverySearchWord("ant", ["antonio"]), false);
    assert.equal(matchesEverySearchWord("kd", ["kd_cards"]), false);
    assert.equal(matchesEverySearchWord("bron", ["bron_fan"]), false);
  });

  it("matches player, set, year, number, team, and parallel on the viewer's own cards", () => {
    const fields = ownCardSearchFields({
      playerName: "Bucky Irving",
      year: 2024,
      yearLabel: "2024",
      setBrand: "Donruss",
      cardNumber: "301",
      parallel: "Base",
      team: "Buccaneers",
      grade: "PSA 10",
    });
    assert.equal(fields.some((field) => /note|paid|cert/i.test(field)), false);
    for (const query of ["Bucky Irving rookie", "irving bucky", "2024 bucky", "donruss 301", "bucky buccaneers"]) {
      assert.equal(matchesEverySearchWord(query, fields), true, query);
    }
    assert.equal(matchesEverySearchWord("silver", fields), false);
  });
});

describe("catalog search results", () => {
  it("finds Bucky Irving for rookie and reordered queries", () => {
    assert.equal(SEARCH_CATALOG_LIMIT, 8);
    for (const query of queries) {
      const hits = resolveCatalogSearch(query, [other, buckyPrizm, bucky], SEARCH_CATALOG_LIMIT);
      assert.equal(hits[0]?.playerName, "Bucky Irving", query);
      assert.ok(hits.some((hit) => hit.id === "donruss-301"), query);
      assert.equal(hits.some((hit) => hit.id === "other"), false, query);
    }
    const rookieFirst = resolveCatalogSearch("Bucky Irving rookie", [buckyPrizm, bucky], 8);
    assert.equal(rookieFirst[0]?.id, "donruss-301");
    assert.equal(rookieFirst[0]?.isRookie, true);

    const many = Array.from({ length: 12 }, (_, index) => ({
      ...bucky,
      id: `bucky-${index}`,
      cardNumber: String(index + 1),
    }));
    assert.equal(resolveCatalogSearch("bucky irving", many, SEARCH_CATALOG_LIMIT).length, 8);
    assert.equal(
      catalogResultLine(bucky),
      "2024 Donruss #301 Base",
    );
  });

  it("opens Add card with that catalog row and links a public or owned page", () => {
    const href = catalogAddHref(bucky);
    const url = new URL(href, "https://slabhold.app");
    const parsed = catalogCardFromParams({
      pick: url.searchParams.get("pick") ?? "",
      player: url.searchParams.get("player") ?? "",
      year: url.searchParams.get("year") ?? "",
      set: url.searchParams.get("set") ?? "",
      num: url.searchParams.get("num") ?? "",
      parallel: url.searchParams.get("parallel") ?? "",
      sport: url.searchParams.get("sport") ?? "",
      rookie: url.searchParams.get("rookie") ?? "",
    });
    assert.equal(parsed?.playerName, "Bucky Irving");
    assert.equal(parsed?.yearLabel, "2024");
    assert.equal(parsed?.setBrand, "Donruss");
    assert.equal(parsed?.cardNumber, "301");
    assert.equal(parsed?.parallel, "Base");
    assert.equal(parsed?.sport, "Football");
    assert.equal(parsed?.isRookie, true);
    assert.equal(catalogCardFromParams({ pick: "", player: "Bucky Irving" }), null);
    const emojiName = `${"a".repeat(79)}🔥`;
    assert.equal(catalogCardFromParams({ pick: "1", player: emojiName })?.playerName, emojiName);
    assert.equal(catalogCardFromParams({ pick: "1", player: `${"b".repeat(79)}\uDC00` })?.playerName, "b".repeat(79));

    const identity = {
      playerName: "Bucky Irving",
      year: 2024,
      yearLabel: "2024",
      setBrand: "Donruss",
      cardNumber: "301",
      parallel: "Base",
    };
    assert.deepEqual(
      catalogSecondaryLink(bucky, {
        ownCards: [{ id: "mine", ...identity }],
        publicCards: [{ id: "pub", ownerId: "user-1", ...identity }],
        profiles: [{ id: "user-1", username: "waxroom" }],
      }),
      { href: "/cards/mine", label: "Your card" },
    );
    assert.deepEqual(
      catalogSecondaryLink(bucky, {
        ownCards: [],
        publicCards: [{ id: "pub", ownerId: "user-1", ...identity }],
        profiles: [{ id: "user-1", username: "waxroom" }],
      }),
      { href: "/u/waxroom/cards/pub", label: "Public card" },
    );
    assert.equal(
      catalogSecondaryLink(bucky, {
        ownCards: [],
        publicCards: [],
        profiles: [],
      }),
      null,
    );
    assert.equal(
      catalogSecondaryLink(bucky, {
        ownCards: [],
        publicCards: [{ id: "pub", ownerId: "user-1", ...identity }],
        profiles: [{ id: "user-1", username: "waxroom" }],
        blockedIds: ["user-1"],
      }),
      null,
    );
    assert.deepEqual(
      catalogSecondaryLink(bucky, {
        ownCards: [],
        publicCards: [
          { id: "blocked", ownerId: "user-1", ...identity },
          { id: "open", ownerId: "user-2", ...identity },
        ],
        profiles: [
          { id: "user-1", username: "waxroom" },
          { id: "user-2", username: "other" },
        ],
        blockedIds: ["user-1"],
      }),
      { href: "/u/other/cards/open", label: "Public card" },
    );
  });

  it("does not read other people's private cards", () => {
    const view = read("components/search-view.tsx");
    const remote = read("lib/catalog/search-remote.ts");
    const form = read("components/card-form.tsx");
    assert.doesNotMatch(view, /\.from\("cards"\)/);
    assert.doesNotMatch(view, /purchasePrice|certNumber|\.notes/);
    assert.match(view, /searchCatalogRemote/);
    assert.match(view, /ownCardSearchFields\(card\)/);
    assert.match(remote, /supabase\.rpc\("search_cards"/);
    assert.doesNotMatch(remote, /\.from\("cards"\)/);
    assert.match(form, /catalogPickFields\(initialCatalog, ""\)/);
    assert.match(form, /catalogPickFields\(card, sportTouched \? form\.sport : ""\)/);
    assert.match(view, /session\.abort\(\)/);
    assert.doesNotMatch(view, /session\.done[\s\S]*?\.catch\(/);
    assert.match(view, /matchesPlainWords\(typed,/);
    assert.equal((view.match(/matchesPlainWords\(typed,/g) ?? []).length, 2);
    assert.equal((view.match(/matchesEverySearchWord\(/g) ?? []).length, 1);
    assert.match(view, /matchesEverySearchWord\(typed, ownCardSearchFields\(card\), \{ grade: card\.grade \}\)/);
    assert.match(view, /const rawQ = \(searchParams\.get\("q"\) \?\? ""\)\.trim\(\)/);
    assert.match(view, /addCardQuery\(rawQ\)/);
    assert.match(view, /const trimmed = addCardQuery\(term\.trim\(\)\)/);
    assert.match(view, /rawQ !== urlQ/);
    assert.match(view, /wantsCatalogSearch\(typed\)/);
    assert.match(view, /startsWith\("@"\)/);
    assert.match(view, /maxLength=\{100\}/);
    assert.match(view, /catalogSecondaryLink\(card, \{[\s\S]*?blockedIds,/);
    assert.doesNotMatch(read("lib/catalog/catalog-pick.ts"), /mail-day/);
    assert.match(read("lib/catalog/catalog-pick.ts"), /catalog-sport/);
    const missAt = view.indexOf("showMiss ?");
    const missBranch = view.slice(missAt, view.indexOf(") : (", missAt));
    assert.doesNotMatch(missBranch, /CatalogTrouble|Try again/);
    assert.match(missBranch, /SEARCH_ADD_CARD_LABEL/);
    assert.match(view, /debounceMs: CATALOG_SEARCH_DEBOUNCE_MS/);
    assert.match(view, /limit: SEARCH_CATALOG_LIMIT/);
    assert.equal(CATALOG_SEARCH_DEBOUNCE_MS, 250);
    const miss = view.indexOf("showMiss ?");
    const label = view.indexOf("{SEARCH_ADD_CARD_LABEL}");
    assert.ok(miss >= 0 && miss < label);
    assert.equal((view.match(/\{SEARCH_ADD_CARD_LABEL\}/g) ?? []).length, 1);
  });

  it("shows the miss link only when every section is empty", () => {
    const empty = {
      query: "zzzz-no-card",
      catalogLoading: false,
      people: 0,
      posts: 0,
      catalog: 0,
      myCards: 0,
    };
    assert.equal(showSearchMissLink(empty), true);
    assert.equal(showSearchMissLink({ ...empty, catalog: 2 }), false);
    assert.equal(showSearchMissLink({ ...empty, myCards: 1 }), false);
    assert.equal(showSearchMissLink({ ...empty, people: 1 }), false);
    assert.equal(showSearchMissLink({ ...empty, posts: 1 }), false);
    assert.equal(showSearchMissLink({ ...empty, catalogLoading: true }), false);
    assert.equal(showSearchMissLink({ ...empty, query: "   " }), false);
    assert.equal(showSearchMissLink({ ...empty, query: "@bron" }), false);
  });

  it("cancels a stale catalog search so a late response cannot replace the new query", async () => {
    let release: (rows: CatalogCard[]) => void = () => {};
    let started = false;
    const first = loadCatalogSearchSession({
      query: "silver",
      debounceMs: 0,
      timeoutMs: 5_000,
      limit: SEARCH_CATALOG_LIMIT,
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
    release([other]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(dropped.aborted, true);
    assert.deepEqual(dropped.results, []);

    const second = loadCatalogSearchSession({
      query: "Bucky Irving rookie",
      debounceMs: 0,
      timeoutMs: 5_000,
      limit: SEARCH_CATALOG_LIMIT,
      search: async () => [buckyPrizm, bucky],
    });
    const current = await second.done;
    assert.equal(current.aborted, false);
    assert.equal(current.results[0]?.playerName, "Bucky Irving");
    assert.equal(current.results[0]?.id, "donruss-301");
    assert.ok(current.results.length <= SEARCH_CATALOG_LIMIT);
  });
});

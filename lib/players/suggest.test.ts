import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, it } from "node:test";
import { join } from "node:path";
import { searchCatalog } from "../card-catalog";
import { interestTypeahead, interestWriteRows } from "../social/collect-interests";
import { normInterest } from "../social/follow-rank";
import { INDEXED_DIRECTORY, PLAYER_DIRECTORY } from "./directory";
import {
  blockedCustomName,
  customPlayerFallback,
  nameSuggestionLabel,
  playerNameMatches,
  titleCasePlayerName,
  withDirectoryPlayers,
} from "./suggest";

const root = process.cwd();

function names(query: string, sports?: readonly string[]) {
  const players = searchCatalog(query, 20).map((card) => ({
    name: card.playerName,
    sport: card.sport,
  }));
  return withDirectoryPlayers({
    query,
    sports,
    catalogHits: interestTypeahead({ query, sports, players, teams: [] }),
    directoryPlayers: INDEXED_DIRECTORY,
    directoryReady: true,
  });
}

describe("player directory", () => {
  it("covers active roster sports and the retired stars collectors chase", () => {
    const sports = new Set(PLAYER_DIRECTORY.map((player) => player.sport));
    assert.deepEqual([...sports].sort(), ["Baseball", "Basketball", "Football", "Hockey"]);
    assert.ok(PLAYER_DIRECTORY.length > 4000);
    assert.ok(PLAYER_DIRECTORY.length < 8000);
    const file = join(root, "lib/players/directory.json");
    const raw = readFileSync(file);
    const bytes = statSync(file).size;
    assert.equal(bytes, raw.length);
    assert.ok(bytes > 100_000 && bytes < 1_200_000);
    assert.ok(gzipSync(raw).length < 120_000);
    assert.equal(/https?:|headshot|logo/i.test(raw.toString("utf8")), false);
    for (const name of [
      "Tyrese Maxey",
      "Joel Embiid",
      "Caitlin Clark",
      "Patrick Mahomes",
      "Shohei Ohtani",
      "Connor McDavid",
      "Michael Jordan",
      "Kobe Bryant",
      "Tom Brady",
      "Ken Griffey Jr.",
      "Wayne Gretzky",
      "Babe Ruth",
      "Mickey Mantle",
    ]) {
      assert.equal(
        PLAYER_DIRECTORY.some((player) => player.name === name),
        true,
        name,
      );
    }
  });

  it("is loaded from its own chunk, not a static import on the name search", () => {
    const editor = readFileSync(join(root, "components/collect-editor.tsx"), "utf8");
    const hook = readFileSync(join(root, "lib/players/use-directory.ts"), "utf8");
    assert.match(editor, /interestTypeahead\(/);
    assert.match(editor, /withDirectoryPlayers\(/);
    assert.doesNotMatch(editor, /players\/directory/);
    assert.match(hook, /import\("@\/lib\/players\/directory"\)/);
    assert.match(hook, /INDEXED_DIRECTORY/);
    assert.match(hook, /status: "error"/);
    assert.doesNotMatch(hook, /from ["']\.\/directory["']/);
    assert.doesNotMatch(hook, /from ["']@\/lib\/players\/directory["']/);
    assert.match(editor, /useMemo\(/);
    assert.match(editor, /Loading players/);
    assert.match(editor, /Could not load the player list/);
    assert.match(editor, /Retry/);
    const maxey = INDEXED_DIRECTORY.find((player) => player.name === "Tyrese Maxey");
    assert.equal(maxey?.norm, "tyrese maxey");
    assert.equal(maxey?.compact, "tyresemaxey");
    assert.deepEqual(maxey?.words, ["tyrese", "maxey"]);
  });
});

describe("directory name search", () => {
  it("finds Tyrese Maxey and Joel Embiid by prefix and any word", () => {
    assert.equal(playerNameMatches("Tyrese Maxey", "maxey"), true);
    assert.equal(playerNameMatches("Joel Embiid", "joel em"), true);
    assert.equal(playerNameMatches("Joel Embiid", "em joel"), true);
    const maxey = names("maxey");
    assert.equal(maxey[0]?.value, "Tyrese Maxey");
    assert.equal(maxey[0]?.kind, "player");
    assert.equal(maxey[0]?.custom, undefined);
    const embiid = names("joel em");
    assert.equal(embiid[0]?.value, "Joel Embiid");
    assert.equal(embiid[0]?.sport, "Basketball");
  });

  it("matches accents and keeps the directory spelling once", () => {
    assert.equal(playerNameMatches("Luka Dončić", "luka doncic"), true);
    assert.equal(playerNameMatches("Luka Dončić", "LUKA DONCIC"), true);
    const hits = names("luka doncic");
    const lukas = hits.filter((hit) => normInterest(hit.value) === "luka doncic");
    assert.deepEqual(
      lukas.map((hit) => hit.value),
      ["Luka Doncic"],
    );
    const merged = withDirectoryPlayers({
      query: "luka doncic",
      catalogHits: [{ kind: "player", value: "Luka Dončić", sport: "Basketball" }],
      directoryPlayers: [
        { name: "Luka Doncic", sport: "Basketball", team: "Los Angeles Lakers" },
        { name: "Luka Dončić", sport: "Basketball" },
      ],
      directoryReady: true,
    });
    assert.deepEqual(
      merged.map((hit) => hit.value),
      ["Luka Doncic"],
    );
  });

  it("ranks catalog players ahead of directory-only names", () => {
    const hits = withDirectoryPlayers({
      query: "james",
      catalogHits: [{ kind: "player", value: "LeBron James", sport: "Basketball" }],
      directoryPlayers: [
        { name: "James Harden", sport: "Basketball" },
        { name: "LeBron James", sport: "Basketball", team: "Los Angeles Lakers" },
      ],
      directoryReady: true,
    });
    assert.equal(hits[0]?.value, "LeBron James");
    assert.equal(hits.filter((hit) => hit.value === "LeBron James").length, 1);
    assert.equal(hits.some((hit) => hit.value === "James Harden"), true);
  });

  it("respects the selected sports", () => {
    const football = names("maxey", ["Football"]);
    assert.equal(football.some((hit) => hit.value === "Tyrese Maxey"), false);
    assert.equal(football.some((hit) => hit.custom), false);
    assert.equal(names("zzqx", ["Football"])[0]?.custom, true);
    assert.equal(names("joel em", ["Hockey"]).some((hit) => hit.custom), false);
    const basketball = names("maxey", ["Basketball"]);
    assert.equal(basketball[0]?.value, "Tyrese Maxey");
    assert.equal(names("joel em", ["Hockey"]).some((hit) => hit.value === "Joel Embiid"), false);
    const chiefs = withDirectoryPlayers({
      query: "chief",
      catalogHits: interestTypeahead({ query: "chief", players: [], sports: ["Football"] }),
      directoryPlayers: PLAYER_DIRECTORY,
      directoryReady: true,
      sports: ["Football"],
    });
    assert.equal(chiefs[0]?.kind, "team");
    assert.equal(chiefs[0]?.value, "Chiefs");
  });

  it("offers a title-cased custom player when nothing matches", () => {
    assert.equal(titleCasePlayerName("tyrese maxey"), "Tyrese Maxey");
    assert.equal(titleCasePlayerName("TYRESE MAXEY"), "Tyrese Maxey");
    assert.equal(titleCasePlayerName("Tyrese Maxey"), "Tyrese Maxey");
    assert.equal(titleCasePlayerName("mcbride"), "McBride");
    assert.equal(titleCasePlayerName("MCBRIDE"), "McBride");
    assert.equal(titleCasePlayerName("McBride"), "McBride");
    assert.equal(titleCasePlayerName("  ken   griffey jr. "), "Ken Griffey Jr.");
    assert.equal(titleCasePlayerName("d'angelo"), "D'Angelo");
    assert.equal(blockedCustomName("Pokemon Cards"), true);
    assert.equal(customPlayerFallback("Pokemon Cards"), null);
    assert.equal(customPlayerFallback("pikachu"), null);
    assert.equal(customPlayerFallback("charizard ex"), null);
    assert.equal(customPlayerFallback("A1"), null);
    assert.equal(customPlayerFallback("<b>zz</b> qq"), null);
    assert.equal(customPlayerFallback("🔥 king"), null);
    assert.equal(customPlayerFallback("O'Neal")?.value, "O'Neal");
    assert.equal(customPlayerFallback("Smith-Njigba")?.value, "Smith-Njigba");
    assert.equal(customPlayerFallback("J.J. Redick")?.value, "J.J. Redick");
    assert.equal(customPlayerFallback("José Ramírez")?.value, "José Ramírez");
    const custom = names("zzqx plz");
    assert.equal(custom.length, 1);
    assert.equal(custom[0]?.custom, true);
    assert.equal(custom[0]?.kind, "player");
    assert.equal(custom[0]?.value, "Zzqx Plz");
    assert.equal(nameSuggestionLabel(custom[0]!), 'Add "Zzqx Plz"');
    assert.deepEqual(interestWriteRows("complete", [{ kind: custom[0]!.kind, value: custom[0]!.value }]), [
      { kind: "player", value: "Zzqx Plz" },
      { kind: "prompt", value: "done" },
    ]);
    assert.equal(customPlayerFallback("a"), null);
    assert.equal(customPlayerFallback("  a "), null);
    assert.equal(customPlayerFallback(""), null);
    assert.equal(customPlayerFallback("!!"), null);
    assert.equal(customPlayerFallback("ab")?.value, "Ab");
    assert.equal(customPlayerFallback("b".repeat(60))?.value.length, 60);
    assert.equal(customPlayerFallback("b".repeat(61)), null);
    assert.equal(customPlayerFallback("pokemon"), null);
    assert.deepEqual(
      withDirectoryPlayers({
        query: "zzqx plz",
        catalogHits: [],
        directoryPlayers: [],
        directoryReady: false,
      }),
      [],
    );
    const picked = customPlayerFallback("zzqx plz", ["Basketball"]);
    assert.equal(picked?.sport, "Basketball");
    assert.equal(names("maxey").some((hit) => hit.custom), false);
  });

  it("blocks pokemon terms even when spaces split them", () => {
    assert.equal(blockedCustomName("poke mon"), true);
    assert.equal(blockedCustomName("pika chu"), true);
    assert.equal(blockedCustomName("chari zard"), true);
    assert.equal(blockedCustomName("yugi oh"), true);
    assert.equal(blockedCustomName("tc gs"), true);
    assert.equal(customPlayerFallback("poke mon cards"), null);
    assert.equal(blockedCustomName("Ken Griffey Jr."), false);
    assert.equal(blockedCustomName("Robert C. Griffin"), false);
    assert.equal(customPlayerFallback("Robert C. Griffin")?.value, "Robert C. Griffin");
    assert.equal(blockedCustomName("Poke mon"), true);
    assert.equal(customPlayerFallback("Poke mon"), null);
    assert.equal(blockedCustomName("pokemontcg"), true);
    assert.equal(customPlayerFallback("pokemontcg"), null);
    for (const name of ["p o k e m o n", "P.O.K.E.M.O.N", "y u g i o h", "p okemon", "pokemo n", "t c g"]) {
      assert.equal(blockedCustomName(name), true, name);
      assert.equal(customPlayerFallback(name), null, name);
    }
    for (const name of ["Robert C. Griffin", "Bert C. Garcia", "Matt C. Green"]) {
      assert.equal(blockedCustomName(name), false, name);
      assert.equal(customPlayerFallback(name)?.custom, true, name);
    }
    for (const player of PLAYER_DIRECTORY) {
      assert.equal(blockedCustomName(player.name), false, player.name);
    }
  });

  it("offers Add for an exact name hidden by the sport chip", () => {
    const hidden = withDirectoryPlayers({
      query: "joel em",
      sports: ["Hockey"],
      catalogHits: [],
      directoryPlayers: [
        { name: "Joel Embiid", sport: "Basketball", norm: "joel embiid", words: ["joel", "embiid"] },
      ],
      directoryReady: true,
    });
    assert.deepEqual(hidden, []);
    const bo = names("bo jackson", ["Baseball"]);
    assert.equal(bo.length, 1);
    assert.equal(bo[0]?.custom, true);
    assert.equal(bo[0]?.value, "Bo Jackson");
    assert.equal(bo[0]?.sport, "Baseball");
    assert.deepEqual(names("tyrese max", ["Football"]), []);
    assert.deepEqual(names("joel em", ["Hockey"]), []);
    const onSport = names("bo jackson", ["Football"]);
    assert.equal(onSport[0]?.value, "Bo Jackson");
    assert.equal(onSport[0]?.custom, undefined);
  });

  it("matches undotted initials to dotted directory names", () => {
    const brown = INDEXED_DIRECTORY.find((player) => player.name === "A.J. Brown");
    assert.deepEqual(brown?.words, ["a", "j", "brown"]);
    assert.deepEqual(brown?.joined, ["aj", "brown"]);
    const stroud = INDEXED_DIRECTORY.find((player) => player.name === "CJ Stroud");
    assert.equal(stroud?.compact, "cjstroud");
    assert.deepEqual(stroud?.words, ["cj", "stroud"]);
    assert.equal(stroud?.joined, undefined);
    assert.equal(playerNameMatches("C.J. Stroud", "cj stroud"), true);
    assert.equal(playerNameMatches("C.J. Stroud", "c.j. stroud"), true);
    assert.equal(playerNameMatches("CJ Stroud", "c j stroud"), true);
    for (const [query, value, sport] of [
      ["cj stroud", "CJ Stroud", "Football"],
      ["aj brown", "A.J. Brown", "Football"],
      ["tj watt", "T.J. Watt", "Football"],
      ["jt realmuto", "J.T. Realmuto", "Baseball"],
    ] as const) {
      const hits = names(query);
      const hit = hits.find((item) => item.value === value);
      assert.ok(hit, query);
      assert.equal(hit?.sport, sport);
      assert.equal(hit?.custom, undefined);
      assert.equal(hits.some((item) => item.custom), false);
    }
    const dotted = names("c.j. stroud");
    assert.equal(dotted.some((hit) => hit.value === "CJ Stroud" && hit.custom !== true), true);
  });

  it("offers Add when joined initials are the exact name hidden by a sport chip", () => {
    const undotted = names("cj stroud", ["Basketball"]);
    assert.equal(undotted.length, 1);
    assert.equal(undotted[0]?.custom, true);
    assert.equal(undotted[0]?.value, "CJ Stroud");
    assert.equal(undotted[0]?.sport, "Basketball");
    const dotted = names("c.j. stroud", ["Basketball"]);
    assert.equal(dotted.length, 1);
    assert.equal(dotted[0]?.custom, true);
    assert.equal(dotted[0]?.value, "CJ Stroud");
    assert.equal(dotted[0]?.sport, "Basketball");
    const spaced = names("c j stroud", ["Basketball"]);
    assert.equal(spaced.length, 1);
    assert.equal(spaced[0]?.custom, true);
    assert.equal(spaced[0]?.value, "CJ Stroud");
    assert.equal(spaced[0]?.sport, "Basketball");
    assert.equal(titleCasePlayerName("c j stroud"), "CJ Stroud");
    assert.equal(titleCasePlayerName("c.j. stroud"), "CJ Stroud");
    assert.equal(titleCasePlayerName("C J STROUD"), "CJ Stroud");
    assert.equal(titleCasePlayerName("a b c d"), "A B C D");
    assert.equal(titleCasePlayerName("a.b.c.d"), "A.B.C.D");
  });

  it("shows one row when catalog and directory spell the same initials differently", () => {
    const hits = withDirectoryPlayers({
      query: "cj stroud",
      catalogHits: [
        { kind: "player", value: "CJ Stroud", sport: "Football" },
        { kind: "player", value: "C.J. Stroud", sport: "Football" },
      ],
      directoryPlayers: INDEXED_DIRECTORY,
      directoryReady: true,
    });
    const strouds = hits.filter((hit) => hit.value.toLowerCase().replace(/[^a-z]/g, "").includes("cjstroud"));
    assert.equal(strouds.length, 1);
    assert.equal(strouds[0]?.value, "CJ Stroud");
    assert.equal(strouds[0]?.sport, "Football");
    assert.equal(strouds[0]?.custom, undefined);
    const localOnly = names("cj stroud");
    const localStroud = localOnly.filter((hit) => hit.value.replace(/[^A-Za-z]/g, "").toLowerCase() === "cjstroud");
    assert.equal(localStroud.length, 1);
    assert.equal(localStroud[0]?.value, "CJ Stroud");
    assert.equal(localStroud[0]?.custom, undefined);
    const catalogWins = withDirectoryPlayers({
      query: "cj stroud",
      catalogHits: [{ kind: "player", value: "C.J. Stroud", sport: "Football" }],
      directoryPlayers: INDEXED_DIRECTORY,
      directoryReady: true,
    });
    assert.equal(catalogWins.find((hit) => hit.value.includes("Stroud"))?.value, "CJ Stroud");
    for (const query of ["cj stroud", "c.j. stroud", "c j stroud"]) {
      const mostlyDotted = withDirectoryPlayers({
        query,
        catalogHits: Array.from({ length: 3 }, () => ({
          kind: "player" as const,
          value: "C.J. Stroud",
          sport: "Football",
        })),
        directoryPlayers: INDEXED_DIRECTORY,
        directoryReady: true,
      });
      const saved = mostlyDotted.filter(
        (hit) => hit.value.replace(/[^A-Za-z]/g, "").toLowerCase() === "cjstroud",
      );
      assert.equal(saved.length, 1, query);
      assert.equal(saved[0]?.value, "CJ Stroud", query);
      assert.equal(saved[0]?.custom, undefined, query);
    }
    const blankSport = withDirectoryPlayers({
      query: "stroud",
      catalogHits: [
        { kind: "player", value: "CJ Stroud", sport: "" },
        { kind: "player", value: "C.J. Stroud", sport: "Football" },
      ],
      directoryPlayers: [],
      directoryReady: true,
    });
    assert.deepEqual(
      blankSport.map((hit) => `${hit.value}/${hit.sport}`),
      ["CJ Stroud/", "C.J. Stroud/Football"],
    );
    const catalogOnly = interestTypeahead({
      query: "stroud",
      players: [
        { name: "C.J. Stroud", sport: "Football" },
        { name: "CJ Stroud", sport: "Football" },
      ],
      teams: [],
    });
    assert.deepEqual(
      catalogOnly.map((hit) => hit.value),
      ["CJ Stroud"],
    );
    const majority = interestTypeahead({
      query: "stroud",
      players: [
        ...Array.from({ length: 3 }, () => ({ name: "C.J. Stroud", sport: "Football" })),
        ...Array.from({ length: 9 }, () => ({ name: "CJ Stroud", sport: "Football" })),
      ],
      teams: [],
    });
    assert.deepEqual(
      majority.map((hit) => hit.value),
      ["CJ Stroud"],
    );
    const distinct = withDirectoryPlayers({
      query: "smith",
      catalogHits: [
        { kind: "player", value: "Will Smith", sport: "Baseball" },
        { kind: "player", value: "Will Smith", sport: "Hockey" },
        { kind: "player", value: "Matt Green", sport: "Football" },
        { kind: "player", value: "Matt C. Green", sport: "Football" },
      ],
      directoryPlayers: [],
      directoryReady: true,
    });
    assert.deepEqual(
      distinct.map((hit) => `${hit.value}/${hit.sport}`),
      ["Will Smith/Baseball", "Will Smith/Hockey", "Matt Green/Football", "Matt C. Green/Football"],
    );
  });

  it("uppercases two-letter initials when the rest of the name is cased for them", () => {
    assert.equal(titleCasePlayerName("jj watt"), "JJ Watt");
    assert.equal(titleCasePlayerName("cj stroud"), "CJ Stroud");
    assert.equal(titleCasePlayerName("aj brown"), "AJ Brown");
    assert.equal(titleCasePlayerName("tj hockenson"), "TJ Hockenson");
    assert.equal(titleCasePlayerName("dj moore"), "DJ Moore");
    assert.equal(titleCasePlayerName("oj simpson"), "OJ Simpson");
    assert.equal(titleCasePlayerName("pj washington"), "PJ Washington");
    assert.equal(titleCasePlayerName("rj barrett"), "RJ Barrett");
    assert.equal(titleCasePlayerName("jt realmuto"), "JT Realmuto");
    assert.equal(titleCasePlayerName("kj martin"), "KJ Martin");
    assert.equal(titleCasePlayerName("bj armstrong"), "BJ Armstrong");
    assert.equal(titleCasePlayerName("cc sabathia"), "CC Sabathia");
    assert.equal(titleCasePlayerName("dk metcalf"), "DK Metcalf");
    assert.equal(titleCasePlayerName("jd martinez"), "JD Martinez");
    assert.equal(titleCasePlayerName("ken griffey jr"), "Ken Griffey Jr");
    assert.equal(titleCasePlayerName("CJ STROUD"), "CJ Stroud");
    assert.equal(titleCasePlayerName("Cj Stroud"), "Cj Stroud");
  });

  it("composes accented letters before checking the custom name", () => {
    assert.equal(customPlayerFallback("jose\u0301")?.value, "José");
    assert.equal(customPlayerFallback("Jose\u0301 Ram\u00edrez")?.value, "José Ramírez");
  });

  it("gives the player-list retry control a 44px tap target", () => {
    const editor = readFileSync(join(root, "components/collect-editor.tsx"), "utf8");
    assert.match(editor, /min-h-11 min-w-11 px-2/);
    assert.match(editor, /Retry/);
  });
});

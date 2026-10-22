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

  it("matches accents and keeps the catalog spelling once", () => {
    assert.equal(playerNameMatches("Luka Dončić", "luka doncic"), true);
    assert.equal(playerNameMatches("Luka Dončić", "LUKA DONCIC"), true);
    const hits = names("luka doncic");
    const lukas = hits.filter((hit) => normInterest(hit.value) === "luka doncic");
    assert.deepEqual(
      lukas.map((hit) => hit.value),
      ["Luka Dončić"],
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
      ["Luka Dončić"],
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
    assert.equal(names("joel em", ["Hockey"]).some((hit) => hit.custom), true);
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
});

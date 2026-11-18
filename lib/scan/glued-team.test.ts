import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checklistFilesFor, loadChecklistsFor } from "@/lib/cards/checklist-load";
import { loadProductData } from "@/lib/cards/product-data";
import { indexPlayer } from "@/lib/players/directory";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import type { IndexedDirectoryPlayer } from "@/lib/players/types";
import { onlyPlayerRead } from "./closest";
import { lookupLiveSolds } from "./live-solds";
import { rankScanMatches, scanChecklistKey } from "./match";
import { nameBesideTeam, readRawCardText } from "./raw-text";
import { scanReadFrom } from "./session";
import { teamsForCode } from "./team-codes";

/**
 * The Nov 18 device miss: 2026-27 Topps #257 Darryn Peterson RC read as "Player not read". The
 * front prints the team code beside the nameplate ("DARRYN PETERSON UTA"), and the back's draft
 * line prints "#1". Lines are modeled on the collector's photos. Nothing is fetched.
 */

const FRONT_GLUED = ["DARRYN PETERSON UTA", "RC"];
const FRONT_LINES = ["UTA", "DARRYN PETERSON", "UTAH JAZZ", "RC"];
const LEGAL = "©, TM & © 2026 The Topps Company, Inc. All rights reserved.";
const BACK = ["257", "DARRYN PETERSON", "UTAH JAZZ", "GUARD", "DRAFTED: JAZZ #1, 2026", "KANSAS", LEGAL];
const BACK_SIDEWAYS = ["257", LEGAL];

const front = (lines: string[], directory = SCAN_DIRECTORY) => readRawCardText(lines, directory, { side: "front" });
const back = (lines: string[], directory = SCAN_DIRECTORY) => readRawCardText(lines, directory, { side: "back" });

async function scan(lines: string[], backLines: string[] | null, directory: readonly IndexedDirectoryPlayer[] = SCAN_DIRECTORY) {
  const read = scanReadFrom({ lines, backLines, kind: "card", image: null }, directory);
  const key = scanChecklistKey(read, directory);
  const checklists = key ? await loadChecklistsFor(key) : [];
  return rankScanMatches(read, [], { directory, products: await loadProductData(), soldTitles: [], checklists });
}

/** The scan through the live step, with a search that finds nothing: the matches, and the searches it sent. */
async function live(lines: string[], backLines: string[] | null) {
  const searches: string[] = [];
  const result = await lookupLiveSolds({ capture: { lines, backLines, kind: "card", look: null }, rows: [] }, "glued-team", {
    directory: SCAN_DIRECTORY,
    products: loadProductData,
    checklists: (key) => loadChecklistsFor(key),
    cachedTitles: async () => [],
    quickCompCache: async () => null,
    liveSearch: async (query) => (searches.push(query), { ok: true, results: [], fetchedAt: "2026-11-18T20:00:00.000Z" }),
    storeQuickComp: async () => {},
  });
  return { top: result.matches[0], searches };
}

describe("a team code or team name beside the nameplate is never part of the name", () => {
  it("DARRYN PETERSON UTA, UTA DARRYN PETERSON and CAMERON BOOZER MEM read the roster player as the nameplate, and the team as the side's team", () => {
    for (const [line, name, team] of [
      ["DARRYN PETERSON UTA", "Darryn Peterson", "Utah Jazz"],
      ["UTA DARRYN PETERSON", "Darryn Peterson", "Utah Jazz"],
      ["CAMERON BOOZER MEM", "Cameron Boozer", "Memphis Grizzlies"],
    ] as const) {
      const read = front([line, "RC"]);
      const hit = read.players.find((item) => item.name === name);
      assert.ok(hit?.nameplate && hit.score === 1, line);
      assert.equal(read.printedName, name, line);
      assert.deepEqual(read.team, { name: team, sport: "Basketball" }, line);
    }
  });

  it("a nickname or the team's full name comes off the same way", () => {
    assert.equal(nameBesideTeam("DARRYN PETERSON JAZZ", SCAN_DIRECTORY)?.name, "DARRYN PETERSON");
    assert.deepEqual(nameBesideTeam("DARRYN PETERSON UTAH JAZZ", SCAN_DIRECTORY), { name: "DARRYN PETERSON", team: { name: "Utah Jazz", sport: "Basketball" } });
  });

  it("a code is a code only in capitals, and one code can be teams in several sports", () => {
    assert.deepEqual(teamsForCode("UTA").map((team) => team.sport), ["Basketball", "Hockey"]);
    assert.deepEqual(teamsForCode("KC").map((team) => team.name), ["Kansas City Chiefs", "Kansas City Royals"]);
    assert.deepEqual(teamsForCode("Uta"), []);
    assert.deepEqual(teamsForCode("RC"), []);
  });

  it("nothing comes off on a hunch: an unknown name with a code and no team line stays as printed", () => {
    assert.equal(nameBesideTeam("ZEKE MARLOWE UTA", SCAN_DIRECTORY), null);
    assert.equal(front(["ZEKE MARLOWE UTA", "RC"]).printedName, "Zeke Marlowe Uta");
    // The card's own team line backs it.
    assert.deepEqual(nameBesideTeam("ZEKE MARLOWE UTA", SCAN_DIRECTORY, ["Utah Jazz"]), { name: "ZEKE MARLOWE", team: { name: "Utah Jazz", sport: "Basketball" } });
    assert.equal(front(["ZEKE MARLOWE UTA", "UTAH JAZZ"]).printedName, "Zeke Marlowe");
    // A team line for another team does not.
    assert.equal(nameBesideTeam("ZEKE MARLOWE UTA", SCAN_DIRECTORY, ["Memphis Grizzlies"]), null);
    // A plain two-word name, a bio line and a sold title are left alone.
    assert.equal(nameBesideTeam("DARRYN PETERSON", SCAN_DIRECTORY), null);
    assert.equal(nameBesideTeam("2026-27 Topps Darryn Peterson #257 RC UTA", SCAN_DIRECTORY), null);
  });

  it("a real name that ends in a code-looking word is not cut when our list has that whole name", () => {
    const directory = [
      indexPlayer({ name: "Juan Carlos Chi", sport: "Baseball", team: "Chicago Cubs" }),
      indexPlayer({ name: "Juan Carlos", sport: "Baseball", team: "Chicago Cubs" }),
      indexPlayer({ name: "Darryn Peterson", sport: "Basketball", team: "Utah Jazz" }),
    ];
    assert.equal(nameBesideTeam("JUAN CARLOS CHI", directory), null);
    const read = front(["JUAN CARLOS CHI"], directory);
    assert.equal(read.printedName, "Juan Carlos Chi");
    assert.ok(read.players.some((hit) => hit.name === "Juan Carlos Chi" && hit.nameplate));
    // A roster player of another sport than the code's teams keeps the line whole too: UTA is no baseball team.
    assert.equal(nameBesideTeam("JUAN CARLOS UTA", directory), null);
  });
});

describe("a draft, pick or rank line never gives the card #", () => {
  it("DRAFTED: JAZZ #1, 2026 is not card #1: the lone 257 is the card #", () => {
    assert.equal(back(BACK).cardNumber, "257");
    assert.equal(back(["DARRYN PETERSON", "DRAFTED: JAZZ #1, 2026", LEGAL]).cardNumber, "");
  });

  it("the # before or after the word, a pick in brackets, a round and a pick", () => {
    for (const line of ["DRAFTED: BUFFALO (2) 2022", "#1 OVERALL", "ROUND 1, PICK #4", "PICK #12, 2024 NBA DRAFT", "DRAFT: #3 BY THE SPURS", "2026 NBA DRAFT, 1ST ROUND (#1)"]) {
      assert.equal(back([line, LEGAL]).cardNumber, "", line);
      assert.equal(back(["88", line, LEGAL]).cardNumber, "88", line);
    }
  });

  it("a printed card # still reads, and Draft Picks is a set, not a draft line", () => {
    assert.equal(back(["No. 257", "DRAFTED: JAZZ #1, 2026", LEGAL]).cardNumber, "257");
    assert.equal(back(["2024-25 PANINI - PRIZM DRAFT PICKS #45"]).cardNumber, "45");
  });
});

describe("2026-27 Topps #257 Darryn Peterson, every read of it", () => {
  const cases: [string, string[], string[] | null][] = [
    ["glued, the whole back", FRONT_GLUED, BACK],
    ["glued, a sideways back", FRONT_GLUED, BACK_SIDEWAYS],
    ["UTA on its own line, the whole back", FRONT_LINES, BACK],
    ["UTA on its own line, a sideways back", FRONT_LINES, BACK_SIDEWAYS],
  ];

  for (const [name, lines, backLines] of cases) {
    it(`${name}: Darryn Peterson, 2026-27 Topps #257, a rookie, searched by his name and card #`, async () => {
      const { top, searches } = await live(lines, backLines);
      assert.deepEqual([top.playerName, top.yearLabel, top.setBrand, top.cardNumber, top.sport, top.isRookie], ["Darryn Peterson", "2026-27", "Topps", "257", "Basketball", true]);
      assert.equal(top.parallel, "");
      assert.equal(top.serialRun, null);
      assert.equal(top.playerNew, undefined);
      assert.deepEqual(searches, ["Darryn Peterson Topps 257", "Darryn Peterson 257"]);
    });
  }

  for (const [name, lines] of [["glued", FRONT_GLUED], ["UTA on its own line", FRONT_LINES]] as const) {
    it(`${name}, front only: the player is right, and the year, set and # stay open for his cards to be picked from`, async () => {
      const { top, searches } = await live([...lines], null);
      assert.deepEqual([top.playerName, top.yearLabel, top.setBrand, top.cardNumber, top.sport], ["Darryn Peterson", "", "", "", "Basketball"]);
      assert.equal(onlyPlayerRead([top]), true);
      assert.deepEqual(searches, ["Darryn Peterson"]);
    });
  }

  it("never the 2025-26 card: that #257 is Larry Bird", async () => {
    const { matches } = await scan(FRONT_GLUED, BACK_SIDEWAYS);
    assert.ok(matches.every((match) => match.yearLabel === "2026-27"));
    assert.ok(!matches.some((match) => /bird/i.test(match.playerName)));
  });

  it("a name with a team glued on is never shown as the player, and never searched", async () => {
    for (const [, lines, backLines] of [...cases, ["", FRONT_GLUED, null], ["", FRONT_LINES, null]] as [string, string[], string[] | null][]) {
      const { top, searches } = await live(lines, backLines);
      assert.ok(!/uta\b/i.test(top?.playerName ?? ""), top?.playerName);
      for (const query of searches) assert.ok(!/\buta\b/i.test(query), query);
    }
  });
});

describe("new rookies and new products", () => {
  const ROOKIE_BACK = ["257", "ZEKE MARLOWE", "UTAH JAZZ", "GUARD", "DRAFTED: JAZZ #9, 2026", LEGAL];

  it("a made-up rookie printed on the front and the back is kept, as new to our list, with the card's own # and season", async () => {
    for (const lines of [["ZEKE MARLOWE", "RC"], ["ZEKE MARLOWE UTA", "RC"]]) {
      const { top, searches } = await live(lines, ROOKIE_BACK);
      assert.deepEqual([top.playerName, top.yearLabel, top.cardNumber, top.sport, top.playerNew], ["Zeke Marlowe", "2026-27", "257", "Basketball", true], lines[0]);
      // No checklist has him: the set stays open, and the search is his name and card #, never another player's card.
      assert.equal(top.setBrand, "");
      assert.deepEqual(searches, ["Zeke Marlowe 257"]);
    }
  });

  it("a known player with no sport read takes the roster's sport, so the Topps checklists load", () => {
    const read = scanReadFrom({ lines: ["DARRYN PETERSON", "RC"], backLines: BACK_SIDEWAYS, kind: "card", image: null }, SCAN_DIRECTORY);
    assert.deepEqual(scanChecklistKey(read, SCAN_DIRECTORY), { years: ["2026", "2025"], setBrand: "Topps", sport: "Basketball", family: "topps" });
  });

  it("no roster player and no sport: each sport's flagship Topps is asked who is at the #, and only a name the card printed is taken", async () => {
    // Our list without him: the nameplate with its code is all there is, and nothing gives the sport.
    const directory = SCAN_DIRECTORY.filter((player) => player.name !== "Darryn Peterson");
    const read = scanReadFrom({ lines: FRONT_GLUED, backLines: BACK_SIDEWAYS, kind: "card", image: null }, directory);
    const key = scanChecklistKey(read, directory);
    assert.deepEqual(key, { years: ["2026", "2025"], setBrand: "Topps", sport: "", family: "topps" });
    const files = checklistFilesFor(key!);
    assert.ok(files.includes("2026-27-basketball-topps") && files.length <= 16);
    assert.ok(files.every((file) => /-topps$/.test(file)), "flagship only");
    const top = (await scan(FRONT_GLUED, BACK_SIDEWAYS, directory)).matches[0];
    assert.deepEqual([top.playerName, top.yearLabel, top.setBrand, top.cardNumber, top.sport, top.playerSource], ["Darryn Peterson", "2026-27", "Topps", "257", "Basketball", "checklist"]);
  });

  it("a name no checklist has at that #: the player stays open, never whoever the checklists do have there", async () => {
    const directory = SCAN_DIRECTORY.filter((player) => player.name !== "Darryn Peterson");
    const { matches } = await scan(["ZEKE MARLOWE UTA", "RC"], BACK_SIDEWAYS, directory);
    assert.ok(matches.length > 0);
    // Nothing backs the three printed words as a name, so the player is left open: not "Zeke Marlowe Uta", not Peterson.
    for (const match of matches) assert.equal(match.playerName, "");
    assert.equal(matches[0].cardNumber, "257");
  });
});

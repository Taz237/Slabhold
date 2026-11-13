import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findPlayers } from "@/lib/scan/raw-text";
import { INDEXED_DIRECTORY, PLAYER_DIRECTORY } from "./directory";

/**
 * Top prospects added by hand for the Bowman market, each team checked on
 * MLB Pipeline (mlb.com/milb/prospects). ESPN rosters skip minor leaguers.
 */
const PROSPECTS: readonly { name: string; team: string }[] = [
  { name: "Aidan Miller", team: "Philadelphia Phillies" },
  { name: "Leo De Vries", team: "Athletics" },
  { name: "Jesus Made", team: "Milwaukee Brewers" },
  { name: "Ethan Holliday", team: "Colorado Rockies" },
  { name: "Sebastian Walcott", team: "Texas Rangers" },
  { name: "Charlie Condon", team: "Colorado Rockies" },
  { name: "Eli Willits", team: "Washington Nationals" },
  { name: "Tyler Bremner", team: "Los Angeles Angels" },
];

/** Case- and accent-insensitive. */
function key(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

describe("player directory: top prospects", () => {
  it("lists each prospect once, as Baseball, with the checked team", () => {
    for (const prospect of PROSPECTS) {
      const rows = PLAYER_DIRECTORY.filter((player) => key(player.name) === key(prospect.name));
      assert.equal(rows.length, 1, `${prospect.name} appears once`);
      assert.deepEqual(rows[0], { name: prospect.name, sport: "Baseball", team: prospect.team });
    }
  });

  it("has no duplicate baseball names, ignoring case and accents", () => {
    const seen = new Map<string, string>();
    for (const player of PLAYER_DIRECTORY) {
      if (player.sport !== "Baseball") continue;
      const k = key(player.name);
      assert.ok(!seen.has(k), `${player.name} duplicates ${seen.get(k)}`);
      seen.set(k, player.name);
    }
  });

  it("finds each prospect from a clean nameplate line", () => {
    for (const prospect of PROSPECTS) {
      const hits = findPlayers([prospect.name.toUpperCase()], INDEXED_DIRECTORY);
      assert.equal(hits[0]?.name, prospect.name, `${prospect.name} is the top hit`);
      assert.equal(hits[0]?.team, prospect.team);
      assert.equal(hits[0]?.nameplate, true);
    }
  });
});

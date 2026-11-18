import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readsAsNameLine } from "@/lib/scan/raw-text";
import { INDEXED_DIRECTORY as INDEXED_CORE_DIRECTORY, PLAYER_DIRECTORY } from "./directory";
import { MORE_PLAYER_DIRECTORY, SCAN_DIRECTORY } from "./scan-directory";

const more = SCAN_DIRECTORY.filter((player) => player.more);

describe("player directory: the wider list (retired, college, prospects)", () => {
  it("leaves the roster file as it was, first in the scanner list, and alone in the name search list", () => {
    assert.equal(PLAYER_DIRECTORY.length, 5463);
    assert.equal(INDEXED_CORE_DIRECTORY.length, 5463);
    assert.deepEqual(SCAN_DIRECTORY.slice(0, INDEXED_CORE_DIRECTORY.length), INDEXED_CORE_DIRECTORY);
    assert.ok(INDEXED_CORE_DIRECTORY.every((player) => !player.more));
    assert.equal(more.length, MORE_PLAYER_DIRECTORY.length);
  });

  it("covers all four sports, and is much bigger than the roster file", () => {
    const bySport = new Map<string, number>();
    for (const player of MORE_PLAYER_DIRECTORY) bySport.set(player.sport, (bySport.get(player.sport) ?? 0) + 1);
    assert.deepEqual([...bySport.keys()].sort(), ["Baseball", "Basketball", "Football", "Hockey"]);
    for (const [sport, count] of bySport) assert.ok(count >= 2000, `${sport}: ${count}`);
    assert.ok(MORE_PLAYER_DIRECTORY.length >= 30000);
  });

  it("knows retired, college and prospect names the roster file doesn't", () => {
    const names = new Set(MORE_PLAYER_DIRECTORY.map((player) => `${player.sport}:${player.name}`));
    for (const name of ["Baseball:Darryl Strawberry", "Baseball:Bryce Rainer", "Basketball:Shawn Kemp", "Football:Arch Manning", "Hockey:Pavel Datsyuk"]) {
      assert.ok(names.has(name), name);
    }
  });

  it("stores a name and a sport, nothing else: no team, link, logo or photo", () => {
    for (const player of MORE_PLAYER_DIRECTORY) assert.deepEqual(Object.keys(player), ["name", "sport"]);
    const blob = JSON.stringify(MORE_PLAYER_DIRECTORY);
    assert.doesNotMatch(blob, /https?:|headshot|logo|pok[eé]mon|\btcg\b|yu-?gi-?oh/i);
  });

  it("never repeats a roster-file name, and never has one name in two sports", () => {
    const core = new Set(INDEXED_CORE_DIRECTORY.map((player) => player.compact));
    const seen = new Map<string, string>();
    for (const player of more) {
      assert.ok(player.compact.length > 0, player.name);
      assert.ok(!core.has(player.compact), `${player.name} is in the roster file`);
      assert.ok(!seen.has(player.compact), `${player.name} (${player.sport}) repeats ${seen.get(player.compact)}`);
      seen.set(player.compact, `${player.name} (${player.sport})`);
    }
  });

  it("holds only names the scanner reads as a name line: no set, color, rookie, team or back-of-card word", () => {
    for (const player of more) assert.ok(readsAsNameLine(player.name, INDEXED_CORE_DIRECTORY), player.name);
  });
});

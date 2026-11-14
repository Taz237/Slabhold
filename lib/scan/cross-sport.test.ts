import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import { liveSearchLadder, rankScanMatches, scanPlayerName, type ScanRead, type SoldTitle } from "./match";
import { readRawCardText } from "./raw-text";

/**
 * Device miss hc-074: a James Cook (Bills, RB) Topps football autograph /15 came back as James Wood,
 * 2025 Topps #CCS-JW Green, a baseball card. "JAMES COOK" is two letters from our list's James Wood;
 * the sold search then ran on that guess, and a James Wood listing "backed" it.
 *
 * The rules: a clean printed name is never swapped for a near one; the card's sport (team, position,
 * league marks) rules out players and listings from another sport; a set and year the card doesn't
 * confirm stay open.
 */

const FRONT = ["TOPPS CERTIFIED AUTOGRAPH ISSUE", "05/15", "JAMES COOK", "BUFFALO BILLS"];
const BACK = [
  "11",
  "JAMES COOK",
  "BILLS - RB",
  "HT: 5'11\" WT: 190",
  "COLLEGE: GEORGIA",
  "DRAFTED: BUFFALO (2) 2022",
  "BORN: 09-25-99, MIAMI, FL",
  "G ATT YDS TD AVG REC",
  "2024 16 207 1009 16 4.9 32",
  "Career Totals 49 533 2638 20 4.9 97",
  "James capped off his third straight season with 1,000+ yards in",
  "style by capturing the league's rushing crown in 2025. He became",
  "the first Bills running back to accomplish the feat since O.J.",
  "Simpson four decades earlier. \"He's the best back in football,\"",
  "quarterback Josh Allen says. \"He should be in the running for",
  "every award. He's an absolute stud.\"",
  "Topps guarantees the authenticity of the autograph(s) appearing on this card.",
  "topps",
  "NFL",
  "NFLPA",
  "® & © 2026 THE TOPPS COMPANY, INC. ALL RIGHTS RESERVED.",
  "TOPPS IS A REGISTERED TRADEMARK OF THE TOPPS COMPANY, INC.",
  "WWW.TOPPS.COM. CMP138988",
];
/** Modeled on the sale the app showed for the wrong card. */
const WOOD_TITLES: SoldTitle[] = [
  { title: "2025 Topps James Wood RC Auto Green /15 #CCS-JW Nationals" },
  { title: "2025 Topps Chrome James Wood Rookie Auto Green Refractor 5/15 CCS-JW" },
];

function raw(front: string[], back?: string[], directory = SCAN_DIRECTORY): ScanRead {
  return {
    kind: "raw",
    front: readRawCardText(front, directory, { side: "front" }),
    back: back ? readRawCardText(back, directory, { side: "back" }) : null,
  };
}

const rank = (read: ScanRead, soldTitles: SoldTitle[] = [], directory = SCAN_DIRECTORY) =>
  rankScanMatches(read, [], { directory, products: null, soldTitles }).matches;

describe("hc-074: James Cook is never James Wood", () => {
  for (const [label, read] of [
    ["front only", raw(FRONT)],
    ["front and back", raw(FRONT, BACK)],
    ["front only, the team line unread", raw(FRONT.slice(0, 3))],
    ["front only, only the name and the serial", raw(["5/15", "JAMES COOK"])],
  ] as const) {
    it(`${label}: the search asks for the printed name`, () => {
      assert.equal(scanPlayerName(read, SCAN_DIRECTORY), "James Cook");
      for (const query of liveSearchLadder(read, null, SCAN_DIRECTORY)) assert.doesNotMatch(query, /wood/i, query);
    });

    it(`${label}: James Wood listings change nothing`, () => {
      for (const titles of [[], WOOD_TITLES]) {
        const matches = rank(read, titles);
        assert.ok(matches.length > 0);
        for (const match of matches) {
          assert.equal(match.playerName, "James Cook");
          assert.notEqual(match.sport, "Baseball");
          assert.doesNotMatch(match.cardNumber, /CCS/i);
          assert.equal(match.parallel, "");
          assert.equal(match.serialRun, 15);
        }
      }
    });
  }

  it("both sides: #11, /15, auto; the set and the year stay open", () => {
    const [top] = rank(raw(FRONT, BACK), WOOD_TITLES);
    assert.equal(top.playerName, "James Cook");
    assert.equal(top.sport, "Football");
    assert.equal(top.cardNumber, "11");
    assert.equal(top.isAuto, true);
    assert.equal(top.setBrand, "");
    assert.equal(top.yearLabel, "");
  });

  it("the roster-only list (no wider names): open, never James Wood", () => {
    const roster = INDEXED_DIRECTORY.filter((player) => !player.more);
    for (const read of [raw(FRONT, undefined, roster), raw(FRONT, BACK, roster)]) {
      for (const match of rank(read, WOOD_TITLES, roster)) assert.doesNotMatch(match.playerName, /wood/i);
    }
  });
});

describe("the card's sport", () => {
  it("a nickname and a position on one line is a position line: BILLS - RB", () => {
    const back = readRawCardText(["11", "JAMES COOK", "BILLS - RB"], SCAN_DIRECTORY, { side: "back" });
    assert.equal(back.sportHint, "Football");
    assert.deepEqual(back.letterCodes, []);
  });

  it("league marks name the sport", () => {
    const sport = (lines: string[]) => readRawCardText(lines, SCAN_DIRECTORY, { side: "back" }).sportHint;
    assert.equal(sport(["NFL", "NFLPA"]), "Football");
    assert.equal(sport(["MLB", "MLBPA"]), "Baseball");
    assert.equal(sport(["NBA"]), "Basketball");
    assert.equal(sport(["NHL", "NHLPA"]), "Hockey");
    // A bio sentence is not a mark.
    assert.equal(sport(["His father played nine seasons in the NFL before coaching."]), "");
  });

  it("a near name from another sport is dropped even when a listing names that player", () => {
    // No wider-list name to fall back on: the team line alone rules the baseball player out.
    const read = raw(["JAMES WOOO", "BUFFALO BILLS", "TOPPS CHROME"]);
    for (const match of rank(read, [{ title: "2025 Topps Chrome James Wood RC #123" }])) assert.doesNotMatch(match.playerName, /wood$/i);
  });

  it("a listing from another sport never fills the card", () => {
    const read = raw(["JOSH ALLEN", "BUFFALO BILLS", "12/25"]);
    const matches = rank(read, [{ title: "2025 Topps Chrome Josh Allen MLB Baseball Auto /25 #RA-JA" }]);
    for (const match of matches) assert.equal(match.cardNumber, "");
  });
});

describe("Topps Resurgence is a set of its own", () => {
  it("a listing that names it is never plain Topps", () => {
    assert.deepEqual(readRawCardText(["2025 Topps Resurgence James Cook Auto /15 #11 Bills"], SCAN_DIRECTORY).setNames.slice(0, 1), ["Topps Resurgence"]);
  });

  it("James Cook listings name the set, the year and the card #", () => {
    const titles = [{ title: "2025 Topps Resurgence James Cook Auto /15 #11 Bills" }, { title: "James Cook 2025 Topps Resurgence Football Autograph 05/15 #11" }];
    for (const read of [raw(FRONT), raw(FRONT, BACK)]) {
      const [top] = rank(read, titles);
      assert.equal(top.playerName, "James Cook");
      assert.equal(top.setBrand, "Topps Resurgence");
      assert.equal(top.yearLabel, "2025");
      assert.equal(top.cardNumber, "11");
      assert.equal(top.serialRun, 15);
    }
  });
});

describe("what the card doesn't confirm stays open", () => {
  it("CERTIFIED AUTOGRAPH ISSUE is not the set", () => {
    assert.deepEqual(readRawCardText(FRONT, SCAN_DIRECTORY, { side: "front" }).setNames, []);
  });

  it("a bio's words are not a set: 'the best back', 'Josh Allen'", () => {
    assert.deepEqual(readRawCardText(BACK, SCAN_DIRECTORY, { side: "back" }).setNames, []);
  });

  it("stats that stop two seasons before the ©: the year is open, not the © year", () => {
    const back = readRawCardText(BACK, SCAN_DIRECTORY, { side: "back" });
    assert.equal(back.copyrightYear, "2026");
    assert.equal(back.statSeason, "2024");
  });

  it("a bare maker's name in a listing never backs a near name", () => {
    const read = raw(["TOPPS", "JAMES WOOO", "5/15"]);
    for (const match of rank(read, [{ title: "2025 Topps James Wood Auto /15" }])) assert.equal(match.playerName, "");
  });
});

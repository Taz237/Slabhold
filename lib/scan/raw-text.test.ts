import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import { readRawCardText } from "./raw-text";

/** Hand-written OCR lines from card fronts and backs. No real collector's card. */
function read(lines: string[]) {
  return readRawCardText(lines, INDEXED_DIRECTORY);
}

describe("readRawCardText: player", () => {
  it("finds the player on a card front", () => {
    const result = read(["LUKA DONCIC", "DALLAS MAVERICKS", "PRIZM", "RC"]);
    assert.equal(result.players[0]?.name, "Luka Doncic");
    assert.equal(result.players[0]?.sport, "Basketball");
    assert.equal(result.players[0]?.score, 1);
    assert.equal(result.players[0]?.line, "LUKA DONCIC");
    assert.equal(result.isRookie, true);
    assert.equal(result.side, "front");
  });

  it("forgives a zero read for an O", () => {
    assert.equal(read(["VICT0R WEMBANYAMA"]).players[0]?.name, "Victor Wembanyama");
  });

  it("forgives a missed letter", () => {
    const result = read(["VICTOR WEMBANYMA"]);
    assert.equal(result.players[0]?.name, "Victor Wembanyama");
    assert.ok((result.players[0]?.score ?? 1) < 1);
  });

  it("joins a name split over two lines", () => {
    assert.equal(read(["SHAI", "GILGEOUS-ALEXANDER", "THUNDER"]).players[0]?.name, "Shai Gilgeous-Alexander");
  });

  it("matches initials and suffixes", () => {
    assert.equal(read(["C.J. STROUD"]).players[0]?.name, "CJ Stroud");
    assert.equal(read(["BOBBY WITT JR."]).players[0]?.name, "Bobby Witt Jr.");
  });

  it("does not read a team or brand line as a player", () => {
    assert.deepEqual(read(["DALLAS MAVERICKS", "PRIZM", "ROOKIE"]).players, []);
    assert.deepEqual(read(["KANSAS CITY CHIEFS", "PANINI SELECT"]).players, []);
  });

  it("does not guess from a surname alone", () => {
    assert.deepEqual(read(["JUDGE"]).players, []);
  });

  it("returns both players when two sports share a name", () => {
    const sports = read(["WILL SMITH"]).players.map((hit) => hit.sport).sort();
    assert.equal(sports.length, 2);
  });

  it("keeps at most three players, best first", () => {
    const result = read(["LUKA DONCIC", "VICTOR WEMBANYAMA", "AARON JUDGE", "PAUL SKENES", "CJ STROUD"]);
    assert.equal(result.players.length, 3);
    assert.equal(result.players[0]?.score, 1);
  });
});

describe("readRawCardText: card details", () => {
  it("reads a card back", () => {
    const result = read([
      "NO. 280",
      "LUKA DONCIC",
      "GUARD",
      "HT: 6-7 WT: 230",
      "SEASON TEAM GP PTS REB",
      "© 2018 Panini America, Inc.",
    ]);
    assert.equal(result.cardNumber, "280");
    assert.equal(result.copyrightYear, "2018");
    assert.equal(result.side, "back");
    assert.equal(result.players[0]?.name, "Luka Doncic");
  });

  it("reads a season label and the set next to it", () => {
    const result = read(["2023-24 PANINI PRIZM", "#136"]);
    assert.equal(result.yearLabel, "2023-24");
    assert.equal(result.setNames[0], "Panini Prizm");
    assert.equal(result.cardNumber, "136");
  });

  it("reads a year printed before a brand, but not stat-line years", () => {
    assert.equal(read(["2017 TOPPS CHROME"]).yearLabel, "2017");
    assert.equal(read(["2019 NYY 102 27", "2020 NYY 28 9"]).yearLabel, "");
  });

  it("reads a serial number only when it fits under the run", () => {
    assert.deepEqual(read(["12/99"]).serial, { number: "12", run: "99" });
    assert.deepEqual(read(["12 / 99"]).serial, { number: "12", run: "99" });
    assert.equal(read(["99/25"]).serial, null);
  });

  it("collects parallel words, including two-word ones", () => {
    assert.deepEqual(read(["REFRACTOR"]).parallelWords, ["REFRACTOR"]);
    assert.deepEqual(read(["CRACKED ICE"]).parallelWords, ["CRACKED ICE"]);
  });

  it("finds a popular insert by name", () => {
    const result = read(["KABOOM!", "PATRICK MAHOMES"]);
    assert.equal(result.insert, "Kaboom");
    assert.equal(result.players[0]?.name, "Patrick Mahomes");
  });

  it("ranks the fuller set name first and keeps lookalikes", () => {
    assert.equal(read(["DONRUSS OPTIC"]).setNames[0], "Donruss Optic");
    const optic = read(["OPTIC"]).setNames;
    assert.ok(optic.includes("Panini Optic"));
    assert.ok(optic.includes("Donruss Optic"));
    assert.equal(read(["TOPPS CHROME UPDATE"]).setNames[0], "Topps Chrome Update");
  });

  it("does not read a set from a brand word inside another word", () => {
    assert.deepEqual(read(["SCORECARD"]).setNames, []);
  });
});

describe("readRawCardText: input", () => {
  it("returns an empty read for no lines", () => {
    const result = read([]);
    assert.deepEqual(result.players, []);
    assert.equal(result.cardNumber, "");
    assert.equal(result.side, "unknown");
  });

  it("ignores blank lines and caps very long input", () => {
    const noise = Array.from({ length: 500 }, () => "x".repeat(1000));
    const result = read(["", " ", "LUKA DONCIC", ...noise]);
    assert.equal(result.players[0]?.name, "Luka Doncic");
    assert.ok(result.lines.length <= 60);
  });
});

describe("readRawCardText: printed codes, nameplates and set marks", () => {
  it("reads a card # printed as a code with no #: BP-27, INS-13", () => {
    assert.equal(read(["AIDAN MILLER", "BP-27"]).cardNumber, "BP-27");
    assert.equal(read(["INSTINCT", "INS-13"]).cardNumber, "INS-13");
    assert.equal(read(["#136", "BP-27"]).cardNumber, "136", "a # number still wins");
  });

  it("doesn't read a height, a season or a maker line as a card #", () => {
    assert.equal(read(["HT: 6-7 WT: 230"]).cardNumber, "");
    assert.equal(read(["2024-25 SEASON"]).cardNumber, "");
    assert.equal(read(["© 2024 THE TOPPS COMPANY, INC. TM-2024"]).cardNumber, "");
  });

  it("keeps a nameplate the directory doesn't know yet, and skips team, set and rookie lines", () => {
    const result = read(["1ST BOWMAN", "PHILADELPHIA PHILLIES", "AIDAN MILLER"]);
    assert.equal(result.printedName, "Aidan Miller");
    assert.deepEqual(result.team, { name: "Philadelphia Phillies", sport: "Baseball" });
    assert.equal(read(["RATED ROOKIE", "DALLAS MAVERICKS", "TOPPS CHROME"]).printedName, "");
  });

  it("ranks the nameplate above a name inside other text", () => {
    const result = read(["AARON JUDGE IS ONE OF THE BEST HITTERS AROUND", "PAUL SKENES"]);
    assert.equal(result.players[0]?.name, "Paul Skenes");
    assert.equal(result.players[0]?.nameplate, true);
    assert.equal(result.players.find((hit) => hit.name === "Aaron Judge")?.nameplate, undefined);
  });

  it("reads the set from the card, not from the maker's copyright line", () => {
    assert.deepEqual(read(["AIDAN MILLER", "© 2024 THE TOPPS COMPANY, INC."]).setNames, []);
    assert.deepEqual(read(["1ST BOWMAN", "© 2024 THE TOPPS COMPANY, INC."]).setNames, ["Bowman"]);
  });

  it("counts a printed set once: TOPPS NOW is Topps Now, MOSAIC is Panini Mosaic", () => {
    assert.deepEqual(read(["TOPPS NOW"]).setNames, ["Topps Now"]);
    assert.equal(read(["MOSAIC", "JAXSON DART"]).setNames[0], "Panini Mosaic");
  });
});

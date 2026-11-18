import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SCAN_DIRECTORY as DIRECTORY } from "@/lib/players/scan-directory";
import { rankScanMatches, type SoldTitle } from "./match";
import { findPlayers } from "./raw-text";
import { scanReadFrom } from "./session";

/**
 * A name one or two letters off a roster player (RONDON for Rodon) is only a guess. It counts when
 * the card's own team line is that player's team, or a sold or active title for this card names
 * the player. With neither, the player stays open: never the guess, never the misread as a new player.
 * Accents never matter: Rodón is Rodon.
 */

function top(front: string[], titles: SoldTitle[] = [], back: string[] | null = null, kind: "card" | "slab" = "card") {
  const read = scanReadFrom({ lines: front, backLines: back, image: null, kind }, DIRECTORY);
  return rankScanMatches(read, [], { directory: DIRECTORY, products: null, soldTitles: titles }).matches[0];
}

const title = (text: string): SoldTitle => ({ title: text, price: 4, soldAt: "2026-11-01" });

describe("accents in player names", () => {
  it("reads RODÓN and RODON as Carlos Rodon, an exact match", () => {
    for (const line of ["CARLOS RODÓN", "CARLOS RODON", "Carlos Rodón", "CARLOS RODÓN"]) {
      assert.deepEqual(
        findPlayers([line], DIRECTORY).map((hit) => [hit.name, hit.score]),
        [["Carlos Rodon", 1]],
        line,
      );
      const match = top(["TOPPS CHROME", line]);
      assert.equal(match?.playerName, "Carlos Rodon", line);
      assert.equal(match?.sureness.player, "sure", line);
      assert.ok(!match?.playerNew, line);
    }
  });

  it("treats accents as equal for any player, not just one", () => {
    for (const [line, name] of [
      ["JOSÉ RAMÍREZ", "Jose Ramirez"],
      ["LUKA DONČIĆ", "Luka Doncic"],
      ["NIKOLA JOKIĆ", "Nikola Jokic"],
    ]) {
      assert.deepEqual(findPlayers([line], DIRECTORY).map((hit) => [hit.name, hit.score]), [[name, 1]], line);
    }
  });

  it("a sold title that spells the name with its accent backs the card like any other", () => {
    const titles = [title("2024 Topps Chrome Carlos Rodón #88 Refractor Yankees"), title("2024 Topps Chrome Carlos Rodón #88")];
    const match = top(["TOPPS CHROME", "CARLOS RODON"], titles);
    assert.equal(match?.playerName, "Carlos Rodon");
    assert.equal(match?.cardNumber, "88");
  });
});

describe("a near match needs backing", () => {
  it("RONDON beside the Yankees team line is Carlos Rodon", () => {
    const match = top(["TOPPS CHROME", "CARLOS RONDON", "NEW YORK YANKEES"]);
    assert.equal(match?.playerName, "Carlos Rodon");
    assert.equal(match?.sport, "Baseball");
    assert.ok(!match?.playerNew);
  });

  it("RONDON with sold titles for this card that name Rodon is Carlos Rodon", () => {
    const titles = [title("2024 Topps Chrome Carlos Rodón #88 Refractor"), title("2024 Topps Chrome Carlos Rodon #88 Yankees")];
    const match = top(["TOPPS CHROME", "CARLOS RONDON"], titles);
    assert.equal(match?.playerName, "Carlos Rodon");
    assert.ok(!match?.playerNew);
  });

  it("RONDON with the card # a title names is Carlos Rodon", () => {
    const match = top(["CARLOS RONDON"], [title("Carlos Rodon Topps Chrome #88 Refractor")], ["88", "CARLOS RONDON", "PITCHER", "© 2024 THE TOPPS COMPANY, INC."]);
    assert.equal(match?.playerName, "Carlos Rodon");
  });

  it("RONDON with no team and no titles stays open: not Rodon, and never a new 'Carlos Rondon'", () => {
    const match = top(["TOPPS CHROME", "CARLOS RONDON"]);
    assert.ok(match, "the card still shows");
    assert.equal(match.playerName, "");
    assert.equal(match.setBrand, "Topps Chrome");
    assert.ok(!match.playerNew);
    assert.notEqual(match.sureness.player, "sure");
  });

  it("RONDON on a baseball card (sport only, no team) stays open", () => {
    const match = top(["TOPPS CHROME", "CARLOS RONDON"], [], ["88", "CARLOS RONDON", "PITCHER", "© 2024 THE TOPPS COMPANY, INC."]);
    assert.equal(match?.playerName ?? "", "");
  });

  it("titles for another card of his do not back the guess", () => {
    const titles = [title("2019 Panini Prizm Carlos Rodon #12 Silver"), title("Carlos Rodon 2021 Bowman Chrome #45")];
    assert.equal(top(["TOPPS CHROME", "CARLOS RONDON"], titles)?.playerName ?? "", "");
    // The same set, another card #.
    const other = [title("2024 Topps Chrome Carlos Rodon #150 Refractor")];
    assert.equal(top(["TOPPS CHROME", "CARLOS RONDON"], other, ["88", "CARLOS RONDON", "© 2024 THE TOPPS COMPANY, INC."])?.playerName ?? "", "");
  });

  it("another team's line does not back the guess", () => {
    assert.equal(top(["TOPPS CHROME", "CARLOS RONDON", "BOSTON RED SOX"])?.playerName ?? "", "");
  });

  it("any near miss with nothing behind it stays open; the same one with the team line reads", () => {
    assert.equal(top(["PANINI PRIZM", "JAYLEN BROWM"])?.playerName ?? "", "");
    assert.equal(top(["PANINI PRIZM", "JAXSON DARI"])?.playerName ?? "", "");
    // The team is the roster file's own, so the test holds when a player moves.
    const team = DIRECTORY.find((player) => player.name === "Jaxson Dart" && !player.more)?.team ?? "";
    assert.ok(team);
    assert.equal(top(["PANINI PRIZM", "JAXSON DARI", team.toUpperCase()])?.playerName, "Jaxson Dart");
  });

  it("a slab label one letter off, with no titles, is open: never the label's misread as the name", () => {
    const match = top(["PSA", "2024 TOPPS CHROME", "#88", "CARLOS RONDON", "GEM MT 10", "61234567"], [], null, "slab");
    assert.equal(match?.playerName ?? "", "");
  });

  it("a slab label one letter off reads once a title for the card names the player", () => {
    const match = top(["PSA", "2024 TOPPS CHROME", "#88", "CARLOS RONDON", "GEM MT 10", "61234567"], [title("2024 Topps Chrome Carlos Rodon #88 PSA 10")], null, "slab");
    assert.equal(match?.playerName, "Carlos Rodon");
  });
});

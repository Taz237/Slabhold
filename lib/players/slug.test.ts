import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INDEXED_DIRECTORY } from "./directory";
import {
  canonicalPlayerSlug,
  dedupePlayers,
  normalizeSlug,
  playerBaseSlug,
  playerHref,
  playerNameKey,
  resolvePlayerSlug,
  type PlayerRef,
} from "./slug";

const ROSTER: PlayerRef[] = INDEXED_DIRECTORY.map((player) => ({
  name: player.name,
  sport: player.sport,
}));

describe("player slug", () => {
  it("folds case and dots so C.J. Stroud and cj-stroud are one page", () => {
    assert.equal(playerBaseSlug("C.J. Stroud"), "cj-stroud");
    assert.equal(playerBaseSlug("CJ Stroud"), "cj-stroud");
    assert.equal(normalizeSlug("C.J. Stroud"), "cj-stroud");
    assert.equal(normalizeSlug("cj-stroud"), "cj-stroud");
    assert.equal(normalizeSlug("CJ-STROUD"), "cj-stroud");

    const dotted = resolvePlayerSlug("C.J. Stroud", ROSTER);
    const hyphen = resolvePlayerSlug("cj-stroud", ROSTER);
    const spaced = resolvePlayerSlug("c.j.-stroud", ROSTER);
    assert.equal(dotted.status, "player");
    assert.equal(hyphen.status, "player");
    assert.equal(spaced.status, "player");
    if (dotted.status !== "player" || hyphen.status !== "player" || spaced.status !== "player") {
      return;
    }
    assert.equal(playerNameKey(dotted.player.name), playerNameKey("C.J. Stroud"));
    assert.equal(dotted.player.name, "CJ Stroud");
    assert.equal(dotted.player.sport, "Football");
    assert.equal(dotted.slug, "cj-stroud");
    assert.equal(hyphen.slug, dotted.slug);
    assert.equal(spaced.slug, dotted.slug);
    assert.equal(hyphen.player.name, dotted.player.name);
    assert.equal(playerHref("C.J. Stroud", "Football"), "/p/cj-stroud-football");
    const withSport = resolvePlayerSlug("cj-stroud-football", ROSTER);
    assert.equal(withSport.status, "player");
    if (withSport.status === "player") assert.equal(withSport.slug, "cj-stroud");
  });

  it("splits a shared name by sport", () => {
    const baseball = resolvePlayerSlug("will-smith-baseball", ROSTER);
    const hockey = resolvePlayerSlug("will-smith-hockey", ROSTER);
    const shared = resolvePlayerSlug("will-smith", ROSTER);
    assert.equal(baseball.status, "player");
    assert.equal(hockey.status, "player");
    assert.equal(shared.status, "choices");
    if (baseball.status !== "player" || hockey.status !== "player" || shared.status !== "choices") {
      return;
    }
    assert.equal(baseball.player.sport, "Baseball");
    assert.equal(hockey.player.sport, "Hockey");
    assert.equal(baseball.player.name, "Will Smith");
    assert.equal(hockey.player.name, "Will Smith");
    assert.equal(baseball.slug, "will-smith-baseball");
    assert.equal(hockey.slug, "will-smith-hockey");
    assert.notEqual(baseball.slug, hockey.slug);
    assert.deepEqual(
      shared.players.map((player) => player.sport),
      ["Baseball", "Hockey"],
    );
    assert.equal(
      canonicalPlayerSlug(baseball.player, shared.players),
      "will-smith-baseball",
    );
  });

  it("returns unknown for a name that is not a player", () => {
    assert.equal(resolvePlayerSlug("not-a-real-player-zzzz", ROSTER).status, "unknown");
    assert.equal(resolvePlayerSlug("", ROSTER).status, "unknown");
    assert.equal(resolvePlayerSlug("charizard", [{ name: "Charizard", sport: "Pokémon" }]).status, "unknown");
    assert.equal(playerHref("Charizard", "Pokémon"), null);
    assert.equal(playerHref("Pikachu", "Baseball"), null);
  });
});

describe("player dedupe", () => {
  it("collapses dotted spellings and keeps each sport", () => {
    const rows = dedupePlayers([
      { name: "CJ Stroud", sport: "Football" },
      { name: "C.J. Stroud", sport: "football" },
      { name: "c.j. stroud", sport: "Football" },
      { name: "Will Smith", sport: "Baseball" },
      { name: "Will Smith", sport: "Hockey" },
      { name: "Will Smith", sport: "baseball" },
      { name: "Charizard", sport: "Pokémon" },
    ]);
    assert.deepEqual(
      rows.map((player) => `${player.name}|${player.sport}`),
      ["C.J. Stroud|Football", "Will Smith|Baseball", "Will Smith|Hockey"],
    );
  });

  it("keeps one roster row per name and sport", () => {
    const rows = dedupePlayers(ROSTER);
    const keys = new Set(rows.map((player) => `${player.name.toLowerCase()}|${player.sport}`));
    const folded = new Set(
      rows.map((player) => `${playerBaseSlug(player.name)}|${player.sport.toLowerCase()}`),
    );
    assert.equal(folded.size, rows.length);
    assert.ok(rows.length < ROSTER.length || keys.size === rows.length);
    assert.equal(rows.filter((player) => player.name === "Will Smith").length, 2);
    assert.equal(rows.filter((player) => playerBaseSlug(player.name) === "cj-stroud").length, 1);
  });
});

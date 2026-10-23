import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CARD_CATALOG } from "@/lib/card-catalog";
import { compactInterest } from "@/lib/social/follow-rank";
import { INDEXED_DIRECTORY } from "./directory";
import { playerCanonicalPath, PLAYER_SLUG_ALIASES } from "./canonical-path";
import { playerRequestIsMissing, playerSlugMightExist } from "./player-presence";
import { playerIlikeOr } from "./ilike";
import {
  ambiguousPlayerKeys,
  canonicalPlayerSlug,
  dedupePlayers,
  normalizeSlug,
  playerBaseSlug,
  playerHref,
  playerNameKey,
  playerSpellings,
  resolvedPlayerHref,
  resolvePlayerSlug,
  sharedPlayerName,
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
    assert.equal(playerHref("C.J. Stroud", "Football"), "/p/cj-stroud");
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

  it("resolves Dončić and Ja'Marr on the compact slug", () => {
    const roster: PlayerRef[] = [
      { name: "Luka Doncic", sport: "Basketball" },
      { name: "Luka Dončić", sport: "Basketball" },
      { name: "Ja'Marr Chase", sport: "Football" },
      { name: "JaMarr Chase", sport: "Football" },
    ];
    assert.equal(playerBaseSlug("Ja'Marr Chase"), "jamarr-chase");
    assert.equal(playerBaseSlug("JaMarr Chase"), "jamarr-chase");
    assert.equal(playerBaseSlug("Luka Dončić"), "luka-doncic");
    assert.equal(playerNameKey("C.J. Stroud"), "cj stroud");
    assert.equal(compactInterest("Ja'Marr Chase"), compactInterest("JaMarr Chase"));
    assert.equal(compactInterest("Luka Dončić"), compactInterest("Luka Doncic"));

    const doncic = resolvePlayerSlug("luka-doncic", roster);
    const accented = resolvePlayerSlug("luka-dončić", roster);
    const jamarr = resolvePlayerSlug("jamarr-chase", roster);
    const spaced = resolvePlayerSlug("ja-marr-chase", roster);
    assert.equal(doncic.status, "player");
    assert.equal(accented.status, "player");
    assert.equal(jamarr.status, "player");
    assert.equal(spaced.status, "player");
    if (
      doncic.status !== "player" ||
      accented.status !== "player" ||
      jamarr.status !== "player" ||
      spaced.status !== "player"
    ) {
      return;
    }
    assert.equal(doncic.player.name, "Luka Dončić");
    assert.equal(doncic.slug, "luka-doncic");
    assert.equal(accented.slug, "luka-doncic");
    assert.equal(accented.player.name, "Luka Dončić");
    assert.equal(jamarr.slug, "jamarr-chase");
    assert.equal(spaced.slug, "jamarr-chase");
    assert.equal(jamarr.player.name, "Ja'Marr Chase");
    assert.equal(playerHref("Ja'Marr Chase", "Football"), "/p/jamarr-chase");
    assert.equal(playerHref("Luka Dončić", "Basketball"), "/p/luka-doncic");
    assert.equal(playerHref("Will Smith", "Baseball"), "/p/will-smith-baseball");
    assert.equal(playerHref("Will Smith", "Hockey"), "/p/will-smith-hockey");
    assert.ok(playerSpellings("Luka Dončić").includes("Luka Doncic"));
    assert.ok(playerSpellings("Ja'Marr Chase").includes("JaMarr Chase"));
    assert.ok(playerSpellings("C.J. Stroud").includes("CJ Stroud"));
    assert.equal(
      playerIlikeOr("player", ["Luka Dončić", "Luka Doncic"]),
      'player.ilike."%Luka Dončić%",player.ilike."%Luka Doncic%"',
    );

    const directoryJamarr = resolvePlayerSlug("jamarr-chase", ROSTER);
    const directoryDoncic = resolvePlayerSlug("luka-doncic", ROSTER);
    assert.equal(directoryJamarr.status, "player");
    assert.equal(directoryDoncic.status, "player");
    if (directoryJamarr.status === "player") assert.equal(directoryJamarr.slug, "jamarr-chase");
    if (directoryDoncic.status === "player") assert.equal(directoryDoncic.slug, "luka-doncic");
  });

  it("appends a sport only for names the bundled roster shares", async () => {
    const rows = dedupePlayers([
      ...ROSTER,
      ...CARD_CATALOG.map((card) => ({ name: card.playerName, sport: card.sport })),
    ]);
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = compactInterest(row.name);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const shared = [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([key]) => key)
      .sort();
    assert.deepEqual(ambiguousPlayerKeys(), shared);
    assert.equal(sharedPlayerName("Will Smith"), true);
    assert.equal(sharedPlayerName("CJ Stroud"), false);
    assert.equal(resolvedPlayerHref("Not A Real Player Zzzz", "Football", ROSTER), null);
    assert.equal(resolvedPlayerHref("C.J. Stroud", "Football", ROSTER), "/p/cj-stroud");
    assert.equal(resolvedPlayerHref("Will Smith", "Baseball", ROSTER), "/p/will-smith-baseball");
    assert.equal(playerCanonicalPath("/p/cj-stroud-football"), "/p/cj-stroud");
    assert.equal(playerCanonicalPath("/p/c.j.-stroud"), "/p/cj-stroud");
    assert.equal(playerCanonicalPath("/p/CJ-STROUD"), "/p/cj-stroud");
    assert.equal(playerCanonicalPath("/p/ja-marr-chase"), "/p/jamarr-chase");
    assert.equal(playerCanonicalPath("/p/jamarr-chase"), null);
    assert.equal(playerCanonicalPath("/p/will-smith-baseball"), null);
    assert.equal(playerCanonicalPath("/p/will-smith"), null);
    assert.equal(playerCanonicalPath("/p/cj-stroud/opengraph-image"), null);
    const aliasRows = dedupePlayers([
      ...ROSTER,
      ...CARD_CATALOG.map((card) => ({ name: card.playerName, sport: card.sport })),
    ]);
    const expected: Record<string, string> = {};
    for (const row of aliasRows) {
      if (sharedPlayerName(row.name)) continue;
      const canonical = canonicalPlayerSlug(row, aliasRows);
      const natural = normalizeSlug(row.name);
      if (!natural || !canonical || natural === canonical) continue;
      expected[natural] = canonical;
    }
    assert.deepEqual(
      Object.fromEntries(Object.entries(PLAYER_SLUG_ALIASES).sort(([a], [b]) => a.localeCompare(b))),
      Object.fromEntries(Object.entries(expected).sort(([a], [b]) => a.localeCompare(b))),
    );
    for (const row of aliasRows) {
      assert.equal(playerSlugMightExist(canonicalPlayerSlug(row, aliasRows)), true, row.name);
      assert.equal(playerSlugMightExist(playerBaseSlug(row.name)), true, row.name);
    }
    assert.equal(playerSlugMightExist("not-a-real-player-zzzz"), false);
    assert.equal(playerSlugMightExist("cj-stroud"), true);
    assert.equal(playerSlugMightExist("will-smith-baseball"), true);
    assert.equal(
      await playerRequestIsMissing({
        pathname: "/p/cj-stroud",
        supabaseUrl: "https://example.supabase.co",
        anonKey: "anon",
        fetchImpl: async () => {
          throw new Error("roster slugs do not query");
        },
      }),
      false,
    );
    const calls: string[] = [];
    assert.equal(
      await playerRequestIsMissing({
        pathname: "/p/not-a-real-player-zzzz",
        supabaseUrl: "https://example.supabase.co",
        anonKey: "anon",
        fetchImpl: async (input) => {
          calls.push(String(input));
          return new Response(JSON.stringify([]), { status: 200 });
        },
      }),
      true,
    );
    assert.ok(calls.some((url) => url.includes("/rest/v1/public_cards")));
    assert.ok(calls.every((url) => !url.includes("/rest/v1/cards?")));
    assert.equal(
      await playerRequestIsMissing({
        pathname: "/p/jaxon-smith",
        supabaseUrl: "https://example.supabase.co",
        anonKey: "anon",
        fetchImpl: async () => new Response(JSON.stringify([{ player: "Jaxon Smith" }]), { status: 200 }),
      }),
      false,
    );
    assert.equal(
      await playerRequestIsMissing({
        pathname: "/p/not-a-real-player-zzzz",
        supabaseUrl: "https://example.supabase.co",
        anonKey: "anon",
        fetchImpl: async () => {
          throw new Error("offline");
        },
      }),
      false,
    );
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

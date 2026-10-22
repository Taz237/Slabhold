import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import {
  MATCH_WEIGHT,
  hiddenFromSuggestions,
  interestShortName,
  rankCollectors,
  teamPostReason,
  type CollectorCandidate,
  type RankCard,
} from "./follow-rank";
import { mergeRankedSuggestions, rankedCollectorKeys } from "./suggestion-order";
import type { Profile } from "./types";

function person(
  id: string,
  username: string,
  extra: Partial<CollectorCandidate> = {},
): CollectorCandidate {
  return {
    id,
    username,
    displayName: extra.displayName ?? username,
    createdAt: extra.createdAt ?? "2026-01-01T00:00:00.000Z",
    ...extra,
  };
}

const interests = [
  { kind: "player" as const, value: "Victor Wembanyama" },
  { kind: "team" as const, value: "Chiefs" },
];

describe("rankCollectors", () => {
  const people = [
    person("rookie", "ada", { createdAt: "2026-01-03T00:00:00.000Z" }),
    person("chiefs", "beau", { createdAt: "2026-01-02T00:00:00.000Z" }),
    person("both", "cara", { createdAt: "2026-01-04T00:00:00.000Z" }),
    person("quiet", "drew", { createdAt: "2026-01-01T00:00:00.000Z" }),
    person("hold", "slabhold", { createdAt: "2026-01-09T00:00:00.000Z", bio: "internal test notes" }),
    person("bot", "grokbotreview", { createdAt: "2026-01-01T00:00:00.000Z" }),
    person("flagged", "waxroom", { isTest: true }),
    person("bio", "maya", { bio: "This is a test collector" }),
    person("handle", "qatest"),
    person("prefix", "qa_alpha"),
    person("blocked", "niko", { blocked: true }),
    person("followed", "opal"),
    person("me", "self"),
    person("privateOnly", "quinn"),
    person("want", "rory", { createdAt: "2026-01-05T00:00:00.000Z" }),
  ];

  const cards: RankCard[] = [
    { userId: "rookie", player: "Victor Wembanyama", sport: "Basketball", isRookie: true, isPublic: true },
    { userId: "both", player: "Victor Wembanyama", sport: "Basketball", isRookie: true, isPublic: true },
    { userId: "bot", player: "Victor Wembanyama", sport: "Basketball", isRookie: true, isPublic: true },
    { userId: "blocked", player: "Victor Wembanyama", sport: "Basketball", isRookie: true, isPublic: true },
    { userId: "privateOnly", player: "Victor Wembanyama", sport: "Basketball", isRookie: true, isPublic: false },
    {
      userId: "privateOnly",
      player: "Secret Player",
      sport: "Basketball",
      isRookie: false,
      isPublic: false,
    },
  ];

  const posts = [
    { userId: "chiefs", body: "Love the Chiefs secondary" },
    { userId: "both", body: "Chiefs rookies are wild" },
    { userId: "flagged", body: "Chiefs" },
  ];

  const wants = [{ userId: "want", label: "Victor Wembanyama Prizm" }];

  const ranked = rankCollectors(people, interests, { cards, posts, wants }, {
    viewerId: "me",
    followingIds: ["followed"],
    limit: 4,
  });

  it("orders by overlap and writes the one-line reason", () => {
    assert.deepEqual(
      ranked.map((row) => [row.username, row.reason, row.score]),
      [
        ["cara", "Collects Wembanyama rookies", MATCH_WEIGHT.playerRookie + MATCH_WEIGHT.teamPost],
        ["ada", "Collects Wembanyama rookies", MATCH_WEIGHT.playerRookie],
        ["beau", "Posts about the Chiefs", MATCH_WEIGHT.teamPost],
        ["rory", "Wants Wembanyama", MATCH_WEIGHT.playerWant],
        ["slabhold", null, 0],
      ],
    );
    assert.equal(teamPostReason("Chiefs"), "Posts about the Chiefs");
    assert.equal(teamPostReason("Maple Leafs"), "Posts about Maple Leafs");
    assert.equal(interestShortName("Victor Wembanyama"), "Wembanyama");
    assert.equal(interestShortName("Bobby Witt Jr."), "Witt");
  });

  it("says Collects when the matching public card is not a rookie", () => {
    const rows = rankCollectors(
      [person("base", "lena")],
      [{ kind: "player", value: "Victor Wembanyama" }],
      {
        cards: [
          {
            userId: "base",
            player: "Victor Wembanyama",
            sport: "Basketball",
            isRookie: false,
            isPublic: true,
          },
        ],
      },
    );
    assert.equal(rows[0]?.reason, "Collects Wembanyama");
    assert.equal(rows[0]?.score, MATCH_WEIGHT.playerCollection);
  });

  it("hides test accounts and respects blocks, follows, and the viewer", () => {
    const names = ranked.map((row) => row.username);
    assert.equal(names.includes("grokbotreview"), false);
    assert.equal(names.includes("waxroom"), false);
    assert.equal(names.includes("maya"), false);
    assert.equal(names.includes("qatest"), false);
    assert.equal(names.includes("qa_alpha"), false);
    assert.equal(names.includes("niko"), false);
    assert.equal(names.includes("opal"), false);
    assert.equal(names.includes("self"), false);
    assert.equal(hiddenFromSuggestions({ username: "slabhold", bio: "internal test notes" }), false);
    assert.equal(names.includes("slabhold"), true);
  });

  it("does not rank or return another collector's private cards", () => {
    const withPrivate = ranked.find((row) => row.username === "quinn");
    assert.equal(withPrivate, undefined);
    const open = rankCollectors(
      [person("privateOnly", "quinn"), person("quiet", "drew", { createdAt: "2026-01-01T00:00:00.000Z" })],
      interests,
      { cards, posts, wants },
    );
    const closed = rankCollectors(
      [person("privateOnly", "quinn"), person("quiet", "drew", { createdAt: "2026-01-01T00:00:00.000Z" })],
      interests,
      { cards: [], posts, wants },
    );
    assert.deepEqual(
      open.map((row) => [row.username, row.score, row.reason]),
      closed.map((row) => [row.username, row.score, row.reason]),
    );
    for (const row of ranked) {
      assert.deepEqual(rankedCollectorKeys(row), ["displayName", "id", "reason", "score", "username"]);
      assert.equal(JSON.stringify(row).includes("Secret Player"), false);
      assert.equal(JSON.stringify(row).includes("paid"), false);
    }
  });
});

describe("suggest_collectors SQL", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20261022180000_profile_interests.sql"),
    "utf8",
  );
  const ranker = sql.slice(
    sql.indexOf("function private.collector_match_weight"),
    sql.indexOf("function public.suggest_collectors"),
  );

  it("ranks on the server from public cards, posts, and want labels", () => {
    assert.match(sql, /function public\.suggest_collectors/);
    assert.match(ranker, /public\.public_cards/);
    assert.match(ranker, /public\.posts/);
    assert.match(ranker, /public\.want_list/);
    assert.match(ranker, /private\.is_blocked/);
    assert.match(ranker, /grokbotreview/);
    assert.match(ranker, /p\.username = 'slabhold'/);
    assert.match(ranker, /is_test/);
    assert.match(ranker, /position\('test' in p\.username\)/);
    assert.match(ranker, /position\('test' in lower\(coalesce\(p\.bio/);
    assert.match(sql, /'Collects ' \|\| private\.interest_short_name\(interest_value\) \|\| ' rookies'/);
    assert.match(sql, /'Posts about the '/);
    assert.match(sql, /then 100/);
    assert.match(sql, /then 70/);
    assert.doesNotMatch(ranker, /from public\.cards\b/);
    assert.doesNotMatch(ranker, /paid_price|cert_number|purchase_date|sell_price|\bnotes\b|source_card_id|target_price/);
    assert.match(sql, /Read own interests/);
    assert.match(sql, /\(select auth\.uid\(\)\) = user_id/);
  });
});

function profile(id: string, username: string, createdAt: string): Profile {
  return {
    id,
    email: "",
    username,
    displayName: username,
    bio: "",
    avatarDataUrl: null,
    coverDataUrl: null,
    accent: "#7c5cff",
    createdAt,
  };
}

describe("mergeRankedSuggestions", () => {
  const fallback = [
    profile("a", "real_a", "2026-01-01T00:00:00.000Z"),
    profile("b", "real_b", "2026-01-02T00:00:00.000Z"),
    profile("bot", "grokbotreview", "2026-01-03T00:00:00.000Z"),
    profile("hold", "slabhold", "2026-01-04T00:00:00.000Z"),
  ];

  it("keeps the old order when the ranking function is missing", () => {
    const merged = mergeRankedSuggestions({ fallback, server: null });
    assert.deepEqual(
      merged.map((row) => [row.username, row.suggestionReason]),
      [
        ["real_a", null],
        ["real_b", null],
        ["slabhold", null],
      ],
    );
  });

  it("uses the server order and reason everywhere suggestions are shown", () => {
    const merged = mergeRankedSuggestions({
      fallback,
      server: [
        {
          userId: "b",
          username: "real_b",
          displayName: "real_b",
          avatarUrl: null,
          accent: null,
          reason: "Posts about the Chiefs",
          score: 70,
        },
        {
          userId: "a",
          username: "real_a",
          displayName: "real_a",
          avatarUrl: null,
          accent: null,
          reason: "Collects Wembanyama rookies",
          score: 100,
        },
        {
          userId: "bot",
          username: "grokbotreview",
          displayName: "bot",
          avatarUrl: null,
          accent: null,
          reason: "Collects Wembanyama rookies",
          score: 100,
        },
      ],
      blockedIds: [],
    });
    assert.deepEqual(
      merged.map((row) => [row.username, row.suggestionReason]),
      [
        ["real_b", "Posts about the Chiefs"],
        ["real_a", "Collects Wembanyama rookies"],
      ],
    );
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import {
  INTEREST_RANK_LIMIT,
  MATCH_WEIGHT,
  hiddenFromSuggestions,
  interestShortName,
  rankCollectors,
  teamPostReason,
  type CollectorCandidate,
  type RankCard,
} from "./follow-rank";
import { followAllIds, FOLLOW_ALL_LIMIT, mergeRankedSuggestions, rankedCollectorKeys } from "./suggestion-order";
import { NOT_SUGGESTED_HANDLES, TEST_ACCOUNT_HANDLES, TEST_ACCOUNT_PREFIXES } from "../test-accounts";
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
    person("great", "greatestpulls", { bio: "biggest test of the year" }),
    person("prefix", "qa_alpha"),
    person("blocked", "niko", { blocked: true }),
    person("followed", "opal"),
    person("me", "self"),
    person("privateOnly", "quinn"),
    person("want", "rory", { createdAt: "2026-01-05T00:00:00.000Z", showAsHunter: true }),
    person("quietWant", "nia", { showAsHunter: false }),
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

  const wants = [
    { userId: "want", label: "Victor Wembanyama Prizm" },
    { userId: "quietWant", label: "Victor Wembanyama Prizm" },
  ];

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
    assert.equal(names.includes("qa_alpha"), false);
    assert.equal(hiddenFromSuggestions({ username: "maya", bio: "This is a test collector" }), false);
    assert.equal(hiddenFromSuggestions({ username: "qatest" }), false);
    assert.equal(hiddenFromSuggestions({ username: "greatestpulls", bio: "biggest test of the year" }), false);
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
    join(process.cwd(), "supabase/migrations/20261022181000_profile_interests.sql"),
    "utf8",
  );
  const ranker = sql.slice(
    sql.indexOf("function private.collector_match_weight"),
    sql.indexOf("function public.suggest_collectors"),
  );

  it("ignores a non-hunter want, a hidden post, and picks past the first 25", () => {
    const hunter = rankCollectors(
      [person("open", "rory", { showAsHunter: true })],
      [{ kind: "player", value: "Victor Wembanyama" }],
      { wants: [{ userId: "open", label: "Victor Wembanyama Prizm" }] },
    );
    const quiet = rankCollectors(
      [person("closed", "nia", { showAsHunter: false })],
      [{ kind: "player", value: "Victor Wembanyama" }],
      { wants: [{ userId: "closed", label: "Victor Wembanyama Prizm" }] },
    );
    assert.equal(hunter[0]?.reason, "Wants Wembanyama");
    assert.equal(hunter[0]?.score, MATCH_WEIGHT.playerWant);
    assert.equal(quiet[0]?.score ?? 0, 0);
    assert.equal(quiet[0]?.reason ?? null, null);
    const hidden = rankCollectors(
      [person("beau", "beau")],
      [{ kind: "team", value: "Chiefs" }],
      { posts: [{ userId: "beau", body: "Go Chiefs", hiddenAt: "2026-02-01T00:00:00.000Z" }] },
    );
    assert.equal(hidden[0]?.score ?? 0, 0);
    assert.equal(hidden[0]?.reason ?? null, null);
    const muted = rankCollectors(
      [person("beau", "beau", { muted: true })],
      [{ kind: "team", value: "Chiefs" }],
      { posts: [{ userId: "beau", body: "Go Chiefs" }] },
    );
    assert.equal(muted.find((row) => row.username === "beau"), undefined);
    const picks = Array.from({ length: INTEREST_RANK_LIMIT }, (_, index) => ({
      kind: "player" as const,
      value: `Nobody ${index}`,
    }));
    picks.push({ kind: "player", value: "Victor Wembanyama" });
    const capped = rankCollectors(
      [person("ada", "ada")],
      picks,
      {
        cards: [
          {
            userId: "ada",
            player: "Victor Wembanyama",
            sport: "Basketball",
            isRookie: true,
            isPublic: true,
          },
        ],
      },
    );
    assert.equal(capped[0]?.score ?? 0, 0);
    assert.equal(capped[0]?.reason ?? null, null);
  });

  it("ranks on the server from public cards, posts, and hunter want labels", () => {
    assert.match(sql, /function public\.suggest_collectors/);
    assert.match(ranker, /public\.public_cards/);
    assert.match(ranker, /public\.posts/);
    assert.match(ranker, /public\.want_list/);
    assert.match(ranker, /hunter\.show_as_hunter is true/);
    assert.match(ranker, /private\.is_blocked/);
    assert.match(ranker, /not private\.is_muted/);
    assert.match(ranker, /post\.hidden_at is null/);
    assert.match(ranker, /p\.username = 'slabhold'/);
    assert.match(ranker, /is_test/);
    assert.match(ranker, /limit 25/);
    assert.match(ranker, /180 days/);
    assert.match(ranker, /left join lateral/);
    assert.match(sql, />= 50/);
    assert.match(sql, /current_user not in \('postgres', 'supabase_admin'\)/);
    assert.match(sql, /PostgREST/);
    assert.doesNotMatch(sql, /set statement_timeout/);
    assert.doesNotMatch(sql, /position\('test'/);
    assert.doesNotMatch(ranker, /p\.bio/);
    for (const handle of NOT_SUGGESTED_HANDLES) {
      assert.match(ranker, new RegExp(`p\\.username <> '${handle}'`));
    }
    for (const handle of TEST_ACCOUNT_HANDLES) {
      assert.match(ranker, new RegExp(`p\\.username <> '${handle}'`));
    }
    for (const prefix of TEST_ACCOUNT_PREFIXES) {
      assert.match(ranker, new RegExp(`left\\(p\\.username, ${prefix.length}\\) <> '${prefix}'`));
    }
    const suggest = sql.slice(
      sql.indexOf("function private.suggest_collectors"),
      sql.indexOf("function public.suggest_collectors"),
    );
    assert.equal((suggest.match(/collector_match_weight/g) ?? []).length, 1);
    assert.match(sql, /'Collects ' \|\| private\.interest_short_name\(interest_value\) \|\| ' rookies'/);
    assert.match(sql, /'Posts about the '/);
    assert.match(sql, /then 100/);
    assert.match(sql, /then 70/);
    assert.doesNotMatch(ranker, /from public\.cards\b/);
    assert.doesNotMatch(ranker, /paid_price|cert_number|purchase_date|sell_price|\bnotes\b|source_card_id|target_price/);
    assert.match(sql, /Read own interests/);
    assert.match(sql, /\(select auth\.uid\(\)\) = user_id/);
  });

  it("serializes interest inserts inside a transaction", () => {
    assert.match(sql, /^begin;\n\nset local lock_timeout = '5s';/m);
    assert.match(
      sql,
      /perform pg_advisory_xact_lock\(hashtextextended\('profile_interests:' \|\| new\.user_id::text, 0\)\);/,
    );
    assert.match(sql, /\n\ncommit;\n$/);
    assert.match(
      sql,
      /revoke all on function private\.limit_profile_interests\(\) from public, anon, authenticated;/,
    );
    assert.doesNotMatch(sql, /grant execute on function private\.limit_profile_interests/);
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

  it("drops muted accounts and caps Follow all", () => {
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
      ],
      mutedIds: ["b"],
    });
    assert.deepEqual(
      merged.map((row) => row.username),
      ["real_a"],
    );
    assert.equal(FOLLOW_ALL_LIMIT, 5);
    assert.deepEqual(
      followAllIds(["m", "a", "b", "c", "d", "e", "f", "a"], {
        viewerId: "me",
        mutedIds: ["m"],
        followingIds: ["b"],
      }),
      ["a", "c", "d", "e", "f"],
    );
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { isTestAccount } from "../test-accounts";
import {
  FOLLOW_SUGGESTION_OVERFETCH,
  followSuggestionFetchLimit,
  followSuggestions,
  needsSuggestionHeadroom,
  PROFILE_SUGGESTION_PAGE,
  suggestionExtraRange,
} from "./follow-suggestions";

function person(id: string, username = id) {
  return { id, username, displayName: username };
}

describe("followSuggestionFetchLimit", () => {
  it("asks for a few extra rows before the filter", () => {
    assert.equal(FOLLOW_SUGGESTION_OVERFETCH >= 4, true);
    assert.equal(followSuggestionFetchLimit(6), 6 + FOLLOW_SUGGESTION_OVERFETCH);
    assert.equal(followSuggestionFetchLimit(0), FOLLOW_SUGGESTION_OVERFETCH);
    assert.equal(followSuggestionFetchLimit(1.9), 1 + FOLLOW_SUGGESTION_OVERFETCH);
    assert.equal(followSuggestionFetchLimit(Number.NaN), FOLLOW_SUGGESTION_OVERFETCH);
  });

  it("loads another short page only after the profile page is full", () => {
    assert.equal(needsSuggestionHeadroom(PROFILE_SUGGESTION_PAGE - 1), false);
    assert.equal(needsSuggestionHeadroom(PROFILE_SUGGESTION_PAGE), true);
    assert.deepEqual(suggestionExtraRange(PROFILE_SUGGESTION_PAGE), {
      from: PROFILE_SUGGESTION_PAGE,
      to: PROFILE_SUGGESTION_PAGE + FOLLOW_SUGGESTION_OVERFETCH - 1,
    });
  });
});

describe("followSuggestions", () => {
  const profiles = [
    person("qa1", "qa_one"),
    person("a", "real_a"),
    person("test1", "test_two"),
    person("b", "real_b"),
    person("reset", "vreset_one"),
    person("c", "real_c"),
    person("me", "maya"),
    person("d", "real_d"),
    person("e", "real_e"),
    person("followed", "real_f"),
    person("team", "slabhold"),
    person("bot", "grokbotreview"),
    person("updates", "slabholdupdates"),
    person("listed", "qa_vreset_1021"),
    person("hyphen", "qa-bot"),
  ];

  it("drops test accounts, the viewer, and people they already follow", () => {
    const result = followSuggestions(profiles, {
      viewerId: "me",
      followingIds: ["followed"],
    });
    assert.deepEqual(
      result.map((profile) => profile.username),
      ["real_a", "real_b", "real_c", "real_d", "real_e", "slabhold"],
    );
    assert.equal(result.some((profile) => isTestAccount(profile.username)), false);
    assert.equal(result.some((profile) => profile.id === "me"), false);
    assert.equal(result.some((profile) => profile.id === "followed"), false);
  });

  it("still fills the rail when the extra rows cover the filtered accounts", () => {
    const displayLimit = 6;
    const shortWindow = profiles.slice(0, displayLimit);
    const short = followSuggestions(shortWindow, {
      viewerId: "me",
      followingIds: ["followed"],
      limit: displayLimit,
    });
    assert.ok(short.length < displayLimit);

    const candidates = profiles.slice(0, followSuggestionFetchLimit(displayLimit));
    const filled = followSuggestions(candidates, {
      viewerId: "me",
      followingIds: ["followed"],
      limit: displayLimit,
    });
    assert.equal(filled.length, displayLimit);
    assert.deepEqual(
      filled.map((profile) => profile.username),
      ["real_a", "real_b", "real_c", "real_d", "real_e", "slabhold"],
    );
  });

  it("keeps a signed-out list free of test accounts", () => {
    const result = followSuggestions(profiles);
    assert.equal(result.some((profile) => profile.id === "me"), true);
    assert.equal(result.some((profile) => isTestAccount(profile.username)), false);
    assert.equal(result.some((profile) => profile.username === "slabhold"), true);
  });

  it("does not suggest someone just because they follow the viewer", () => {
    const result = followSuggestions(
      [person("fan", "fan"), person("me", "maya")],
      { viewerId: "me", followingIds: [] },
    );
    assert.deepEqual(
      result.map((profile) => profile.id),
      ["fan"],
    );
  });

  it("is the only people-suggestion filter, and search is left alone", () => {
    const root = process.cwd();
    const provider = readFileSync(join(root, "components/social-provider.tsx"), "utf8");
    const search = readFileSync(join(root, "components/search-view.tsx"), "utf8");
    const feed = readFileSync(join(root, "components/collector-suggestions.tsx"), "utf8");
    const cards = readFileSync(join(root, "lib/cards/people.ts"), "utf8");
    const remote = readFileSync(join(root, "lib/social/remote.ts"), "utf8");
    assert.match(provider, /followSuggestionFetchLimit\(displayLimit\)/);
    assert.match(provider, /followSuggestions\(candidates/);
    assert.match(feed, /Collectors to follow/);
    const suggestions = feed.slice(
      feed.indexOf("function CollectorSuggestions"),
      feed.indexOf("function FollowingEmpty"),
    );
    assert.equal(
      suggestions.includes(
        '<div className="mb-3 flex min-h-11 items-center justify-between gap-2 px-4 max-md:pr-20">',
      ),
      true,
    );
    const followAll = suggestions.slice(
      suggestions.indexOf("<button"),
      suggestions.indexOf("</button>"),
    );
    assert.equal(followAll.includes("Follow all"), true);
    assert.equal(followAll.includes("whitespace-nowrap"), true);
    assert.equal(followAll.includes("shrink-0"), true);
    // Hosted: suggestions come only from the server ranking (load-suggestions).
    // The snapshot never reads the whole profiles table, so there is no headroom read.
    assert.doesNotMatch(remote, /needsSuggestionHeadroom|suggestionExtraRange/);
    assert.doesNotMatch(remote, /\.order\("created_at", \{ ascending: true \}\)\s*\.range\(from, to\)/);
    assert.match(provider, /if \(mode === "supabase"\) return \[\];/);
    assert.doesNotMatch(search, /isTestAccount|followSuggestions/);
    assert.doesNotMatch(cards, /isTestAccount|followSuggestions/);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rankMentionMatches, type MentionCandidate } from "./mentions";

function person(
  id: string,
  username: string,
  displayName: string,
): MentionCandidate {
  return {
    id,
    username,
    displayName,
    avatarDataUrl: null,
    accent: "#7c5cff",
  };
}

describe("rankMentionMatches", () => {
  const alice = person("1", "alice", "Alice Wonder");
  const wonder = person("2", "wonderkid", "Sam");
  const bob = person("3", "bobby", "Wonder Bob");
  const carl = person("4", "carl", "Carl");
  const all = [alice, wonder, bob, carl];

  it("matches username and display name case-insensitively", () => {
    const hits = rankMentionMatches(all, "WO", new Set(), 8);
    assert.deepEqual(
      hits.map((p) => p.id),
      ["2", "3", "1"],
    );
  });

  it("ranks following first, then prefix over contains", () => {
    const hits = rankMentionMatches(all, "wo", new Set(["1"]), 8);
    assert.deepEqual(
      hits.map((p) => p.id),
      ["1", "2", "3"],
    );
  });

  it("prefers prefix matches before contains among non-followed", () => {
    const hits = rankMentionMatches(all, "wo", new Set(), 8);
    assert.deepEqual(
      hits.map((p) => p.id),
      ["2", "3", "1"],
    );
  });

  it("caps at 8 and excludes non-matches", () => {
    const hits = rankMentionMatches(all, "zz", new Set(), 8);
    assert.equal(hits.length, 0);
  });
});

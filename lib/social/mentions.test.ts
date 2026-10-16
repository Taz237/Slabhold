import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  escapeIlike,
  mentionQueryAt,
  rankMentionMatches,
  type MentionCandidate,
} from "./mentions";

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

describe("mentionQueryAt", () => {
  it("extracts the text after @ up to the cursor", () => {
    assert.equal(mentionQueryAt("@", 1), "");
    assert.equal(mentionQueryAt("@d", 2), "d");
    assert.equal(mentionQueryAt("@do", 3), "do");
    assert.equal(mentionQueryAt("hey @do", 7), "do");
    assert.equal(mentionQueryAt("hey @do more", 7), "do");
  });

  it("returns null when the caret is not in a mention", () => {
    assert.equal(mentionQueryAt("hello", 5), null);
    assert.equal(mentionQueryAt("a@b.com", 4), null);
    assert.equal(mentionQueryAt("@do ", 4), null);
  });
});

describe("escapeIlike", () => {
  it("escapes %, _, and strips commas", () => {
    assert.equal(escapeIlike("a%b_c,d"), "a\\%b\\_cd");
  });
});

describe("rankMentionMatches", () => {
  const alice = person("1", "alice", "Alice Wonder");
  const wonder = person("2", "wonderkid", "Sam");
  const bob = person("3", "bobby", "Wonder Bob");
  const don = person("5", "donnie", "Don Smith");
  const dale = person("6", "dale", "Dale");
  const carl = person("4", "carl", "Carl");

  it("ranks prefix before contains; followed first within each tier", () => {
    // prefix: bobby (display), wonderkid (username); contains: alice (followed)
    const hits = rankMentionMatches(
      [alice, wonder, bob, carl],
      "wo",
      new Set(["1"]),
      8,
    );
    assert.deepEqual(
      hits.map((p) => p.id),
      ["3", "2", "1"],
    );
  });

  it("filters by typed query so @d and @do differ", () => {
    const pool = [
      person("1", "alice", "Alice"),
      carl,
      don,
      dale,
    ];
    assert.deepEqual(
      rankMentionMatches(pool, "d", new Set(), 8).map((p) => p.username),
      ["dale", "donnie"],
    );
    assert.deepEqual(
      rankMentionMatches(pool, "do", new Set(), 8).map((p) => p.username),
      ["donnie"],
    );
  });

  it("empty query returns followed users only", () => {
    const hits = rankMentionMatches(
      [alice, wonder, bob, carl, don],
      "",
      new Set(["4", "5"]),
      8,
    );
    assert.deepEqual(
      hits.map((p) => p.id),
      ["4", "5"],
    );
  });

  it("caps at 8 and excludes non-matches", () => {
    const hits = rankMentionMatches([alice, wonder, bob, carl], "zz", new Set(), 8);
    assert.equal(hits.length, 0);
  });
});

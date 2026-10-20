import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { escapeIlike } from "./escape-ilike";
import { mentionIlikeOr } from "../social/mentions";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("escapeIlike", () => {
  it("escapes percent, underscore, and backslash", () => {
    assert.equal(escapeIlike("100%"), "100\\%");
    assert.equal(escapeIlike("wax_room"), "wax\\_room");
    assert.equal(escapeIlike("a\\b"), "a\\\\b");
    assert.equal(escapeIlike("a%b_c\\d"), "a\\%b\\_c\\\\d");
    assert.equal(escapeIlike("plain"), "plain");
  });
});

describe("mentionIlikeOr", () => {
  it("escapes wildcards and still drops characters that add or() filters", () => {
    assert.equal(
      mentionIlikeOr("a_b"),
      "username.ilike.%a\\_b%,display_name.ilike.%a\\_b%",
    );
    assert.equal(
      mentionIlikeOr("100%"),
      "username.ilike.%100\\%%,display_name.ilike.%100\\%%",
    );
    assert.equal(
      mentionIlikeOr("a\\b"),
      "username.ilike.%a\\\\b%,display_name.ilike.%a\\\\b%",
    );
    assert.equal(mentionIlikeOr("a,b(c)d%"), "username.ilike.%abcd\\%%,display_name.ilike.%abcd\\%%");
    assert.equal(mentionIlikeOr(",()"), null);
  });
});

describe("ilike call sites", () => {
  it("escapes want-list player names and mention search before ilike", () => {
    const summary = read("lib/wants/summary.ts");
    const dispatch = read("lib/wants/dispatch.ts");
    const remote = read("lib/social/remote.ts");
    assert.match(summary, /\.ilike\("player", escapeIlike\(player\)\)/);
    assert.match(dispatch, /\.ilike\("player", escapeIlike\(player\)\)/);
    assert.match(remote, /mentionIlikeOr\(query\)/);
    assert.doesNotMatch(remote, /username\.ilike\.%\$\{q\}%/);
  });
});

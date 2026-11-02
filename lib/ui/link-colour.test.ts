import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const VIOLET_PAIR = [
  "text-violet-700",
  "decoration-violet-700/70",
  "dark:text-violet-300",
  "dark:decoration-violet-300/80",
];

describe("in-text links are purple", () => {
  it("uses the violet pair for the default mention, hashtag and URL tone", () => {
    const source = read("components/mention-text.tsx");
    const match = source.match(/const MENTION_CLASS = "([^"]+)";/);
    assert.ok(match, "MENTION_CLASS is a string literal");
    const tone = match[1];
    for (const name of VIOLET_PAIR) assert.ok(tone.split(" ").includes(name), `MENTION_CLASS has ${name}`);
    assert.doesNotMatch(tone, /sky-/);
    assert.match(tone, /hover:underline/);
  });

  it("gives received DM bubbles the violet pair and keeps sent bubbles white", () => {
    const source = read("components/message-thread.tsx");
    const match = source.match(/linkClassName=\{\s*mine\s*\?\s*"([^"]+)"\s*:\s*"([^"]+)"\s*\}/);
    assert.ok(match, "message bubbles pick a link class by sender");
    const [, sent, received] = match;
    assert.match(sent, /\btext-white underline\b/);
    assert.doesNotMatch(sent, /violet|sky-/);
    for (const name of VIOLET_PAIR) assert.ok(received.split(" ").includes(name), `received has ${name}`);
    assert.match(received, /\bunderline\b/);
    assert.doesNotMatch(received, /sky-/);
  });

  for (const file of [
    "components/quoted-post-embed.tsx",
    "components/post-view.tsx",
    "components/profile-view.tsx",
    "components/search-view.tsx",
    "components/mention-text.tsx",
  ]) {
    it(`has no sky link colours in ${file}`, () => {
      const source = read(file);
      assert.doesNotMatch(source, /text-sky-|decoration-sky-/);
    });
  }
});

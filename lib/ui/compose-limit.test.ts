import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CharacterRing } from "@/components/character-ring";
import { charRing } from "@/lib/ui/char-ring";
import { isOverLimit } from "@/lib/ui/compose-limit";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const LIMIT = 280;
const paste = "x".repeat(300);

describe("compose limit", () => {
  it("is over only past the limit", () => {
    assert.equal(isOverLimit("", LIMIT), false);
    assert.equal(isOverLimit("x".repeat(280), LIMIT), false);
    assert.equal(isOverLimit("x".repeat(281), LIMIT), true);
    assert.equal(isOverLimit(paste, LIMIT), true);
  });

  it("counts like the server does (UTF-16 length)", () => {
    assert.equal(isOverLimit("🔥".repeat(140), LIMIT), false);
    assert.equal(isOverLimit("🔥".repeat(141), LIMIT), true);
  });

  it("a 300-char paste shows rose -20, and trimming to 280 clears it", () => {
    const over = charRing(paste.length, LIMIT);
    assert.equal(over.tone, "over");
    assert.equal(over.label, "-20");
    const back = paste.slice(0, 280);
    assert.equal(isOverLimit(back, LIMIT), false);
  });
});

describe("shared character ring", () => {
  it("draws nothing when empty", () => {
    assert.equal(renderToStaticMarkup(createElement(CharacterRing, { length: 0, limit: LIMIT })), "");
  });

  it("is purple with room, amber near the end, rose with a negative count over", () => {
    const normal = renderToStaticMarkup(createElement(CharacterRing, { length: 10, limit: LIMIT }));
    assert.match(normal, /data-tone="normal"/);
    assert.match(normal, /text-\[#7C3AED\]/);
    const warn = renderToStaticMarkup(createElement(CharacterRing, { length: 265, limit: LIMIT }));
    assert.match(warn, /data-tone="warn"/);
    assert.match(warn, /text-amber-500/);
    assert.match(warn, />15</);
    const over = renderToStaticMarkup(createElement(CharacterRing, { length: 300, limit: LIMIT }));
    assert.match(over, /data-tone="over"/);
    assert.match(over, /text-rose-500/);
    assert.match(over, />-20</);
    assert.match(over, /stroke="currentColor"/);
    assert.match(over, /aria-hidden="true"/);
  });
});

describe("composers never cut text", () => {
  it("drops the slice from both textareas but keeps the maxLength prop", () => {
    for (const path of ["components/mention-textarea.tsx", "components/mention-textarea-lazy.tsx"]) {
      const source = read(path);
      assert.doesNotMatch(source, /slice\(0, maxLength\)/, path);
      assert.doesNotMatch(source, /insertMention\([^)]*maxLength\)/, path);
      assert.match(source, /maxLength/, path);
      assert.match(source, /aria-invalid=\{value\.length > maxLength\}/, path);
    }
    const card = read("components/card-form.tsx");
    assert.doesNotMatch(card, /maxLength=\{POST_LIMIT\}/);
  });

  it("uses the shared ring with a sr-only count in every composer", () => {
    const places: [string, RegExp, RegExp][] = [
      ["components/compose-view.tsx", /<CharacterRing length=\{body\.length\} limit=\{POST_LIMIT\} \/>/, /\{body\.length\}\/\{POST_LIMIT\}/],
      ["components/feed-view.tsx", /<CharacterRing length=\{body\.length\} limit=\{POST_LIMIT\} \/>/, /\{body\.length\}\/\{POST_LIMIT\}/],
      ["components/post-view.tsx", /<CharacterRing length=\{draft\.length\} limit=\{COMMENT_LIMIT\} \/>/, /\{draft\.length\}\/\{COMMENT_LIMIT\}/],
      ["components/card-form.tsx", /<CharacterRing length=\{caption\.length\} limit=\{POST_LIMIT\} \/>/, /\{caption\.length\}\/\{POST_LIMIT\}/],
    ];
    for (const [path, ring, count] of places) {
      const source = read(path);
      assert.match(source, /import \{ CharacterRing \} from "@\/components\/character-ring";/, path);
      assert.match(source, ring, path);
      assert.match(source, new RegExp(`sr-only[\\s\\S]{0,80}${count.source}`), path);
      assert.doesNotMatch(source, /function CharacterRing/, path);
    }
  });

  it("disables Post and Reply over the limit, and the submit handlers refuse too", () => {
    const compose = read("components/compose-view.tsx");
    assert.match(compose, /const overLimit = isOverLimit\(body, POST_LIMIT\)/);
    assert.match(compose, /const canPost = !overLimit &&/);
    assert.match(compose, /if \(isOverLimit\(body, POST_LIMIT\)\) return;/);
    const feed = read("components/feed-view.tsx");
    assert.match(feed, /disabled=\{sending \|\| readingPhoto \|\| overLimit\}/);
    assert.match(feed, /if \(overLimit\) return;/);
    const post = read("components/post-view.tsx");
    assert.match(post, /isOverLimit\(draft, COMMENT_LIMIT\) \|\|/);
    assert.match(post, /if \(pending \|\| isOverLimit\(draft, COMMENT_LIMIT\)\) return;/);
  });
});

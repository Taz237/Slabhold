import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/** The declarations of every `selector { ... }` rule whose selector list names `name` on its own. */
function rulesFor(css: string, name: string): string {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let found = "";
  for (const match of bare.matchAll(/(^|[}\n])\s*([^{}@]+)\{([^{}]*)\}/g)) {
    const selectors = match[2].split(",").map((part) => part.trim());
    if (selectors.includes(name)) found += match[3];
  }
  return found;
}

describe("the page never pans sideways", () => {
  const css = read("app/globals.css");

  for (const root of ["html", "body"]) {
    it(`${root} clips sideways overflow and has no sideways bounce`, () => {
      const rules = rulesFor(css, root);
      // clip, not hidden: hidden makes a scroll container and breaks sticky headers.
      assert.match(rules, /overflow-x:\s*clip\s*;/);
      assert.doesNotMatch(rules, /overflow(-x)?:\s*hidden/);
      assert.match(rules, /overscroll-behavior-x:\s*none\s*;/);
      // pan-y would kill the horizontal swipe rows.
      assert.doesNotMatch(rules, /touch-action:\s*pan-y/);
    });
  }

  it("Collection's swipe rows hold their own screen-reader words", () => {
    // An sr-only span is absolute. In a row that is not positioned it escapes
    // the row's clip, and one in a card scrolled off to the right widens the page.
    const movers = read("components/collection-movers.tsx");
    assert.match(movers, /<ul\s+data-no-pull\s+className="relative -mx-4 [^"]*overflow-x-auto/);
    const hero = read("components/portfolio-hero.tsx");
    assert.match(hero, /data-slot="collection-stats"[\s\S]{0,200}className="relative -mx-4 [^"]*overflow-x-auto/);
  });
});

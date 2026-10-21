import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { searchEmptyTitle, visibleSearchSections } from "./sections";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("search sections", () => {
  it("names a section only when that section has results", () => {
    assert.deepEqual(visibleSearchSections({ people: 0, posts: 2, cards: 0 }), ["Posts"]);
    assert.deepEqual(visibleSearchSections({ people: 1, posts: 0, cards: 3 }), ["People", "Cards"]);
    assert.deepEqual(visibleSearchSections({ people: 0, posts: 0, cards: 0 }), []);
    assert.deepEqual(visibleSearchSections({ people: 4, posts: 1, cards: 1 }), [
      "People",
      "Posts",
      "Cards",
    ]);
  });

  it("uses one empty state when nothing matches", () => {
    assert.equal(searchEmptyTitle("xyz"), 'No results for "xyz"');
    assert.equal(searchEmptyTitle("  wemby  "), 'No results for "wemby"');
    assert.equal(visibleSearchSections({ people: 0, posts: 0, cards: 0 }).length === 0, true);
  });

  it("puts the search field above intro copy and hides empty section headings", () => {
    const view = read("components/search-view.tsx");
    const page = read("app/search/page.tsx");
    const field = view.indexOf('aria-label="Search"');
    const intro = view.indexOf("Search Slabhold");
    const recent = view.indexOf(">Recent<");
    const loading = view.indexOf("<LoadingRows");
    assert.ok(field >= 0 && field < intro);
    assert.ok(field < recent);
    assert.ok(field < loading);
    assert.match(view, /visibleSearchSections\(/);
    assert.match(view, /searchEmptyTitle\(typed\)/);
    assert.match(view, /text-base/);
    assert.doesNotMatch(view, /autoFocus/);
    assert.doesNotMatch(view, /No matching people/);
    assert.doesNotMatch(view, /No matching posts/);
    assert.match(page, /aria-label="Search"/);
    const fallbackField = page.indexOf('aria-label="Search"');
    const fallbackRows = page.indexOf("<LoadingRows");
    assert.ok(fallbackField >= 0 && fallbackField < fallbackRows);
    assert.doesNotMatch(page, /autoFocus/);
  });
});

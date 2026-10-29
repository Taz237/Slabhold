import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TIMELINE_MEMORY_MS, memoryFresh, mergeFreshPage } from "./feed-refresh";

function page(keys: string[], extra: Partial<{ hasMore: boolean; nextCursor: string | null; likes: number }> = {}) {
  return {
    items: keys.map((key) => ({ key })),
    posts: keys.map((id) => ({ id, likes: extra.likes ?? 0 })),
    relatedPosts: [],
    profiles: [{ id: "maya" }],
    hasMore: extra.hasMore ?? true,
    nextCursor: extra.nextCursor ?? `after-${keys.at(-1)}`,
  };
}

describe("pull to refresh merge", () => {
  it("puts new posts on top and keeps the older pages already loaded", () => {
    const current = page(["c", "b", "a", "z", "y"], { nextCursor: "after-y" });
    const fresh = page(["e", "d", "c", "b"], { likes: 3, nextCursor: "after-b" });
    const { page: merged, kept } = mergeFreshPage(current, fresh);
    assert.equal(kept, true);
    assert.deepEqual(
      merged.items.map((item) => item.key),
      ["e", "d", "c", "b", "a", "z", "y"],
    );
    assert.equal(merged.nextCursor, "after-y");
    assert.equal(merged.posts.find((post) => post.id === "c")?.likes, 3);
  });

  it("drops an item that left the fresh page's range", () => {
    const current = page(["c", "gone", "b", "a"]);
    const fresh = page(["d", "c", "b"]);
    assert.deepEqual(
      mergeFreshPage(current, fresh).page.items.map((item) => item.key),
      ["d", "c", "b", "a"],
    );
  });

  it("replaces the list when there is a gap or nothing older", () => {
    const gap = mergeFreshPage(page(["b", "a"]), page(["f", "e", "d"]));
    assert.equal(gap.kept, false);
    assert.deepEqual(gap.page.items.map((item) => item.key), ["f", "e", "d"]);
    const same = mergeFreshPage(page(["b", "a"]), page(["c", "b", "a"], { nextCursor: "fresh" }));
    assert.equal(same.kept, false);
    assert.equal(same.page.nextCursor, "fresh");
    assert.equal(mergeFreshPage(page([]), page(["a"])).kept, false);
  });

  it("remembers a timeline for a few minutes", () => {
    assert.equal(memoryFresh(1000, 1000 + TIMELINE_MEMORY_MS - 1), true);
    assert.equal(memoryFresh(1000, 1000 + TIMELINE_MEMORY_MS), false);
    assert.equal(memoryFresh(5000, 1000), false);
  });
});

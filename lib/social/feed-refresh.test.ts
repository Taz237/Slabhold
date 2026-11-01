import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  REFRESH_MAX_PAGES,
  TIMELINE_MEMORY_MS,
  fetchFreshHead,
  hasNewerItems,
  memoryFresh,
  mergeFreshPage,
} from "./feed-refresh";

function page(keys: string[], extra: Partial<{ hasMore: boolean; nextCursor: string | null; likes: number }> = {}) {
  return {
    items: keys.map((key) => ({ key })),
    posts: keys.map((id) => ({ id, likes: extra.likes ?? 0 })),
    relatedPosts: [] as { id: string; likes: number }[],
    profiles: [{ id: "maya" }],
    hasMore: extra.hasMore ?? true,
    nextCursor: (extra.nextCursor ?? `after-${keys.at(-1)}`) as string | null,
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

type TestPage = ReturnType<typeof page>;

/** Server pages, newest first, served by cursor like loadFeedPage. */
function server(pages: TestPage[]) {
  const calls: (string | null)[] = [];
  const fetchPage = async (cursor: string | null) => {
    calls.push(cursor);
    const index = cursor === null ? 0 : pages.findIndex((p) => p.items.length && `after-${p.items.at(-1)?.key}` === cursor) + 1;
    const found = pages[index];
    return found ?? page([], { hasMore: false, nextCursor: null });
  };
  return { calls, fetchPage };
}

function refreshed(current: TestPage, fresh: TestPage) {
  return mergeFreshPage(current, fresh, (item) => item.key.split(":").at(-1) ?? item.key).page;
}

describe("pull to refresh with no holes", () => {
  it("overlap found: one page, then the older pages stay below it", async () => {
    const current = page(["c", "b", "a", "z", "y"], { nextCursor: "after-y" });
    const { calls, fetchPage } = server([page(["e", "d", "c", "b"]), page(["a", "z", "y"])]);
    const fresh = await fetchFreshHead({ current, fetchPage });
    assert.deepEqual(calls, [null]);
    const merged = refreshed(current, fresh);
    assert.deepEqual(merged.items.map((item) => item.key), ["e", "d", "c", "b", "a", "z", "y"]);
    assert.equal(merged.nextCursor, "after-y");
  });

  it("more than a page new: keeps fetching until it reaches the loaded head", async () => {
    const current = page(["c", "b", "a"], { nextCursor: "after-a" });
    const { calls, fetchPage } = server([page(["h", "g", "f"]), page(["e", "d", "c"]), page(["b", "a"])]);
    const fresh = await fetchFreshHead({ current, fetchPage });
    assert.deepEqual(calls, [null, "after-f"]);
    const merged = refreshed(current, fresh);
    assert.deepEqual(merged.items.map((item) => item.key), ["h", "g", "f", "e", "d", "c", "b", "a"]);
    assert.equal(merged.nextCursor, "after-a");
  });

  it("no overlap: drops the stale older pages and resets the cursor", async () => {
    const current = page(["b", "a"], { nextCursor: "after-a" });
    const newer = Array.from({ length: REFRESH_MAX_PAGES + 1 }, (_, n) => page([`n${n}x`, `n${n}y`]));
    const { calls, fetchPage } = server([...newer, page(["b", "a"])]);
    const fresh = await fetchFreshHead({ current, fetchPage });
    assert.equal(calls.length, REFRESH_MAX_PAGES);
    const merged = refreshed(current, fresh);
    const keys = merged.items.map((item) => item.key);
    assert.ok(!keys.includes("b") && !keys.includes("a"), "stale pages below the gap are gone");
    assert.deepEqual(keys.slice(0, 2), ["n0x", "n0y"]);
    assert.equal(merged.nextCursor, `after-${keys.at(-1)}`, "the next page starts right below the fresh head");
  });

  it("duplicate ids: a post shows once across pages and as a repost", async () => {
    const current = page(["c", "repost:u1:e", "b", "a", "repost:u2:f"], { nextCursor: "after-f" });
    // The second fresh page repeats "d" from the first (a post that moved between reads).
    const { fetchPage } = server([page(["f", "e", "d"]), page(["d", "c", "b"])]);
    const fresh = await fetchFreshHead({ current, fetchPage });
    const merged = refreshed(current, fresh);
    const keys = merged.items.map((item) => item.key);
    assert.deepEqual(keys, ["f", "e", "d", "c", "b", "a"]);
    assert.equal(new Set(merged.posts.map((post) => post.id)).size, merged.posts.length);
  });
});

describe("new posts check on return", () => {
  it("is true only when the newest read has items above the loaded head", () => {
    assert.equal(hasNewerItems(["c", "b"], ["d", "c", "b"]), true);
    assert.equal(hasNewerItems(["c", "b"], ["c", "b"]), false);
    // The old head was deleted: what is left is not new.
    assert.equal(hasNewerItems(["x", "c", "b"], ["c", "b"]), false);
    assert.equal(hasNewerItems(["c"], ["f", "e"]), true);
    assert.equal(hasNewerItems([], ["a"]), false);
    assert.equal(hasNewerItems(["a"], []), false);
  });
});

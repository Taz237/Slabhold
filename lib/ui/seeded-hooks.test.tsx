import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDom } from "@/lib/test/dom";
import { usePagedTimeline } from "@/components/use-paged-timeline";
import { seedsViewer } from "@/lib/auth/route-access";
import { preloadOnHint } from "@/lib/auth/session-hint";
import type { HomeSeedPage } from "@/lib/social/home-seed";
import type { Post } from "@/lib/social/types";
import { useCardValues } from "@/lib/value/use-card-values";
import type { CardValueResult } from "@/lib/value/types";

installDom();

let root: Root | null = null;
let host: HTMLElement;
const realFetch = globalThis.fetch;
let fetched: string[] = [];

beforeEach(() => {
  if (root) act(() => root!.unmount());
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  fetched = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetched.push(String(input));
    return new Response(JSON.stringify({ values: {} }), { status: 200 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete document.documentElement.dataset.session;
});

describe("which screens the server draws for a signed-in viewer", () => {
  it("is Home, Collection, and a card page, nothing else", () => {
    assert.equal(seedsViewer("/"), true);
    assert.equal(seedsViewer("/collection"), true);
    assert.equal(seedsViewer("/cards/0000-1"), true);
    assert.equal(seedsViewer("/cards/new"), false);
    assert.equal(seedsViewer("/cards/0000-1/edit"), false);
    assert.equal(seedsViewer("/notifications"), false);
    assert.equal(seedsViewer("/u/ada"), false);
  });

  it("keeps the early signed-in preloads for every other screen", () => {
    document.documentElement.dataset.session = "";
    window.history.replaceState(null, "", "/notifications");
    assert.equal(preloadOnHint(), true);
    window.history.replaceState(null, "", "/collection");
    assert.equal(preloadOnHint(), false);
    delete document.documentElement.dataset.session;
    window.history.replaceState(null, "", "/notifications");
    assert.equal(preloadOnHint(), false);
  });
});

describe("card values the server already read", () => {
  const value = { value: 120 } as unknown as CardValueResult;

  function Values({ ids, initial }: { ids: string[]; initial?: Parameters<typeof useCardValues>[1] }) {
    const result = useCardValues(ids, initial);
    return createElement("span", null, `${result.loading ? "loading" : "ready"}:${result.values.size}`);
  }

  it("draws them at once and doesn't ask again", async () => {
    await act(async () => {
      root!.render(createElement(Values, { ids: ["b", "a"], initial: { key: "a,b", values: { a: value } } }));
    });
    assert.equal(host.textContent, "ready:1");
    assert.deepEqual(fetched, []);
  });

  it("asks as before when the ids differ from what the server read", async () => {
    await act(async () => {
      root!.render(createElement(Values, { ids: ["a", "c"], initial: { key: "a,b", values: { a: value } } }));
    });
    assert.equal(fetched.length, 1);
    assert.match(fetched[0] ?? "", /ids=a%2Cc/);
  });
});

describe("a timeline page the server already read", () => {
  const post: Post = {
    id: "p1",
    authorId: "a1",
    body: "Pulled a 10",
    imageDataUrl: null,
    card: null,
    quotedPostId: null,
    createdAt: "2026-10-29T12:00:00.000Z",
  };

  function page(token: string): HomeSeedPage {
    return {
      items: [{ key: "post:p1", post, at: post.createdAt, repostedBy: null }],
      posts: [post],
      relatedPosts: [],
      profiles: [],
      hasMore: true,
      nextCursor: null,
      likes: [],
      token,
    };
  }

  function Timeline({ initial, remembered, viewerId }: { initial: HomeSeedPage; remembered: string[]; viewerId: string }) {
    const result = usePagedTimeline({
      enabled: true,
      scope: "public",
      viewerId,
      refreshKey: 0,
      initial,
      rememberPosts: (posts) => remembered.push(...posts.map((item) => item.id)),
    });
    return createElement("span", null, `${result.loading ? "loading" : "ready"}:${result.items.length}`);
  }

  it("draws the server's page at once, whatever the phone's clock says, and hands its posts to the provider", () => {
    const remembered: string[] = [];
    const realNow = Date.now;
    Date.now = () => realNow() + 365 * 24 * 60 * 60 * 1000;
    try {
      act(() => root!.render(createElement(Timeline, { initial: page("t1"), remembered, viewerId: "v1" })));
    } finally {
      Date.now = realNow;
    }
    assert.equal(host.textContent, "ready:1");
    assert.deepEqual(remembered, ["p1"]);
  });

  it("loads fresh when the same server page comes back on a later mount", () => {
    const remembered: string[] = [];
    act(() => root!.render(createElement(Timeline, { initial: page("t2"), remembered, viewerId: "v2" })));
    act(() => root!.unmount());
    root = createRoot(host);
    act(() => root!.render(createElement(Timeline, { initial: page("t2"), remembered, viewerId: "v3" })));
    assert.equal(host.textContent, "loading:0");
  });
});

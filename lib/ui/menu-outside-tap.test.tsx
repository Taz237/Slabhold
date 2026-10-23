import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, afterEach, before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, type Context, type ContextType, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Post, PostComment, Profile } from "@/lib/social/types";
import type { CompListing } from "@/lib/types";

const require = createRequire(import.meta.url);
const serverOnlyId = require.resolve("server-only");
require.cache[serverOnlyId] = {
  id: serverOnlyId,
  filename: serverOnlyId,
  loaded: true,
  exports: {},
  children: [],
  paths: [],
} as unknown as NodeJS.Module;

const menus = Promise.all([
  import("@/components/comps-list"),
  import("@/components/create-menu"),
  import("@/components/post-view"),
  import("@/components/safety-menu"),
  import("@/components/social-provider"),
  import("@/components/tweet"),
  import("@/lib/ui/menu-outside-tap"),
]).then(([comps, create, post, safety, social, tweet, tap]) => ({
  CompsList: comps.CompsList,
  CreateMenu: create.CreateMenu,
  PostView: post.PostView,
  SafetyMenu: safety.SafetyMenu,
  SocialContext: social.SocialContext,
  Tweet: tweet.Tweet,
  clearMenuClickSwallow: tap.clearMenuClickSwallow,
}));

let CompsList: Awaited<typeof menus>["CompsList"];
let CreateMenu: Awaited<typeof menus>["CreateMenu"];
let PostView: Awaited<typeof menus>["PostView"];
let SafetyMenu: Awaited<typeof menus>["SafetyMenu"];
let SocialContext: Awaited<typeof menus>["SocialContext"];
let Tweet: Awaited<typeof menus>["Tweet"];
let clearMenuClickSwallow: Awaited<typeof menus>["clearMenuClickSwallow"];

before(async () => {
  ({ CompsList, CreateMenu, PostView, SafetyMenu, SocialContext, Tweet, clearMenuClickSwallow } =
    await menus);
});
const { PathnameContext } = require("next/dist/shared/lib/hooks-client-context.shared-runtime") as {
  PathnameContext: Context<string | null>;
};
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: Context<AppRouterInstance | null>;
};

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const win = dom.window;

function expose(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

expose("window", win);
expose("self", win);
expose("document", win.document);
expose("navigator", win.navigator);
expose("HTMLElement", win.HTMLElement);
expose("Node", win.Node);
expose("Element", win.Element);
expose("SVGElement", win.SVGElement);
expose("MouseEvent", win.MouseEvent);
expose("KeyboardEvent", win.KeyboardEvent);
expose("getComputedStyle", win.getComputedStyle.bind(win));
expose("requestAnimationFrame", (callback: FrameRequestCallback) => win.setTimeout(() => callback(Date.now()), 0));
expose("cancelAnimationFrame", (id: number) => win.clearTimeout(id));
expose("IS_REACT_ACT_ENVIRONMENT", true);

after(() => {
  win.close();
});

afterEach(() => {
  clearMenuClickSwallow();
});

const pushes: string[] = [];
const router: AppRouterInstance = {
  back() {},
  forward() {},
  refresh() {},
  push(href: string) {
    pushes.push(href);
  },
  replace() {},
  prefetch() {},
  bfcacheId: "_b_0_",
};

function profile(id: string, username: string): Profile {
  return {
    id,
    email: `${username}@example.com`,
    username,
    displayName: username,
    bio: "",
    avatarDataUrl: null,
    coverDataUrl: null,
    accent: "violet",
    createdAt: "2024-01-01T00:00:00.000Z",
    pinnedPostId: null,
  };
}

function feedPost(authorId: string): Post {
  return {
    id: "post-1",
    authorId,
    body: "Hello from the post",
    imageDataUrl: null,
    card: null,
    quotedPostId: null,
    createdAt: "2024-01-01T00:00:00.000Z",
  };
}

function social(partial: Record<string, unknown>) {
  return partial as NonNullable<ContextType<typeof SocialContext>>;
}

function shell(value: Record<string, unknown>, child: ReactNode) {
  return createElement(
    AppRouterContext.Provider,
    { value: router },
    createElement(
      PathnameContext.Provider,
      { value: "/" },
      createElement(SocialContext.Provider, { value: social(value) }, child),
    ),
  );
}

function feedValue(me: Profile, item: Post, extra: Record<string, unknown> = {}) {
  return {
    user: me,
    profiles: [me],
    posts: [item],
    commentsFor: () => [],
    findPost: () => item,
    deletePost: async () => ({}),
    pinPost: async () => ({}),
    unpinPost: async () => ({}),
    toggleLike: () => {},
    toggleRepost: () => {},
    isLiked: () => false,
    isReposted: () => false,
    likeCount: () => 0,
    repostCount: () => 0,
    blockedIds: [],
    mutedIds: [],
    applySafetyChange: () => {},
    refresh: async () => [],
    deleteComment: async () => ({}),
    ready: true,
    mode: "supabase",
    loadingPostId: null,
    addComment: async () => ({}),
    followingOf: () => [],
    ...extra,
  };
}

async function mount(node: ReactNode) {
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root: Root = createRoot(host);
  await act(async () => {
    root.render(node);
  });
  return {
    host,
    async tap(target: Element) {
      await act(async () => {
        target.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        target.dispatchEvent(new win.MouseEvent("mouseup", { bubbles: true, cancelable: true }));
        target.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
      });
    },
    async click(target: Element) {
      await act(async () => {
        target.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
      });
    },
    menu() {
      return host.querySelector("[role=menu]");
    },
    async destroy() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

function paragraph(host: ParentNode, text: string) {
  const node = [...host.querySelectorAll("p")].find((item) => item.textContent === text);
  assert.ok(node, text);
  return node;
}

describe("outside tap closes the menu only", () => {
  it("post ⋯ menu does not open the post underneath", async () => {
    const me = profile("me", "ada");
    const item = feedPost(me.id);
    pushes.length = 0;
    let hits = 0;
    const view = await mount(shell(feedValue(me, item), createElement(Tweet, { post: item, author: me })));
    const body = paragraph(view.host, "Hello from the post");
    body.addEventListener("click", () => {
      hits += 1;
    });

    await view.tap(body);
    assert.deepEqual(pushes, [`/posts/${item.id}`]);
    assert.equal(hits, 1);
    pushes.length = 0;

    const more = view.host.querySelector('button[aria-label="More"]');
    assert.ok(more);
    await view.click(more);
    assert.ok(view.menu());

    await view.tap(body);
    assert.equal(view.menu(), null);
    assert.deepEqual(pushes, []);
    assert.equal(hits, 1);

    await view.tap(body);
    assert.deepEqual(pushes, [`/posts/${item.id}`]);
    assert.equal(hits, 2);
    await view.destroy();
  });

  it("repost menu does not open the post underneath", async () => {
    const me = profile("me", "ada");
    const item = feedPost(me.id);
    pushes.length = 0;
    let hits = 0;
    const view = await mount(shell(feedValue(me, item), createElement(Tweet, { post: item, author: me })));
    const body = paragraph(view.host, "Hello from the post");
    body.addEventListener("click", () => {
      hits += 1;
    });
    const repost = view.host.querySelector('button[aria-label="Repost"]');
    assert.ok(repost);
    await view.click(repost);
    assert.ok(view.menu());

    await view.tap(body);
    assert.equal(view.menu(), null);
    assert.deepEqual(pushes, []);
    assert.equal(hits, 0);

    await view.tap(body);
    assert.deepEqual(pushes, [`/posts/${item.id}`]);
    assert.equal(hits, 1);
    await view.destroy();
  });

  it("+ menu does not open the post underneath", async () => {
    const me = profile("me", "ada");
    let hits = 0;
    const view = await mount(
      shell(
        { user: me },
        createElement(
          "div",
          null,
          createElement(
            "button",
            {
              type: "button",
              id: "under",
              onClick: () => {
                hits += 1;
              },
            },
            "Open post",
          ),
          createElement(CreateMenu),
        ),
      ),
    );
    const under = view.host.querySelector("#under");
    assert.ok(under);
    await view.tap(under);
    assert.equal(hits, 1);

    const fab = view.host.querySelector('button[aria-label="Post"]');
    assert.ok(fab);
    await view.click(fab);
    assert.ok(view.menu());

    await view.tap(under);
    assert.equal(view.menu(), null);
    assert.equal(hits, 1);

    await view.tap(under);
    assert.equal(hits, 2);
    await view.destroy();
  });

  it("reply menu does not pass the outside tap through", async () => {
    const me = profile("me", "ada");
    const them = profile("them", "bea");
    const item = feedPost(them.id);
    const reply: PostComment = {
      id: "reply-1",
      postId: item.id,
      authorId: me.id,
      body: "Nice pull",
      createdAt: "2024-01-02T00:00:00.000Z",
    };
    let hits = 0;
    const view = await mount(
      shell(
        feedValue(me, item, {
          profiles: [me, them],
          commentsFor: (id: string) => (id === item.id ? [reply] : []),
        }),
        createElement(PostView, { id: item.id }),
      ),
    );
    const body = paragraph(view.host, "Hello from the post");
    body.addEventListener("click", () => {
      hits += 1;
    });
    const more = view.host.querySelector('li button[aria-label="More"]');
    assert.ok(more);
    await view.click(more);
    assert.ok(view.menu());

    await view.tap(body);
    assert.equal(view.menu(), null);
    assert.equal(hits, 0);

    await view.tap(body);
    assert.equal(hits, 1);
    await view.destroy();
  });

  it("safety menu does not pass the outside tap through", async () => {
    const me = profile("me", "ada");
    const them = profile("them", "bea");
    let hits = 0;
    const view = await mount(
      shell(
        feedValue(me, feedPost(them.id), { profiles: [me, them] }),
        createElement(
          "article",
          {
            onClick: () => {
              hits += 1;
            },
          },
          createElement("p", null, "Their post"),
          createElement(SafetyMenu, {
            targetType: "post",
            targetId: "post-1",
            reportedUserId: them.id,
            username: them.username,
          }),
        ),
      ),
    );
    const body = paragraph(view.host, "Their post");
    await view.tap(body);
    assert.equal(hits, 1);

    const more = view.host.querySelector('button[aria-label="More"]');
    assert.ok(more);
    await view.click(more);
    assert.ok(view.menu());

    await view.tap(body);
    assert.equal(view.menu(), null);
    assert.equal(hits, 1);

    await view.tap(body);
    assert.equal(hits, 2);
    await view.destroy();
  });

  it("comps menu does not pass the outside tap through", async () => {
    const comp: CompListing = {
      id: "c1",
      itemId: "i1",
      title: "1986 Fleer",
      soldPrice: 12,
      soldDate: "2024-01-01",
      platform: "eBay",
      condition: "Raw",
      shipping: null,
      url: "https://example.com/sale",
    };
    let hits = 0;
    const view = await mount(
      createElement(CompsList, {
        comps: [comp],
        cardId: "card-1",
        canFlag: true,
        onFlag: async () => true,
      }),
    );
    const link = view.host.querySelector("a");
    assert.ok(link);
    link.addEventListener("click", () => {
      hits += 1;
    });
    await view.tap(link);
    assert.equal(hits, 1);

    const more = view.host.querySelector('button[aria-label="Actions for 1986 Fleer"]');
    assert.ok(more);
    await view.click(more);
    assert.ok(view.menu());

    await view.tap(link);
    assert.equal(view.menu(), null);
    assert.equal(hits, 1);

    await view.tap(link);
    assert.equal(hits, 2);
    await view.destroy();
  });
});

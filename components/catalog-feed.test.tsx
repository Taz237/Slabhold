import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { installDom } from "@/lib/test/dom";
import type { FeedCard, FeedPage } from "@/lib/catalog-feed/feed";
import type { SocialContextValue } from "@/components/social-provider";

const { win } = installDom();
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, writable: true, value: win.sessionStorage });
Object.defineProperty(globalThis, "Image", { configurable: true, writable: true, value: win.Image });

// react-dom reads the DOM when it loads, so it and the components load after installDom.
let createRoot: typeof import("react-dom/client").createRoot;
let CatalogFeed: typeof import("@/components/catalog-feed").CatalogFeed;
let CardOwnerRow: typeof import("@/components/public-card-view").CardOwnerRow;
let SocialContext: typeof import("@/components/social-provider").SocialContext;
let CollectionContext: typeof import("@/components/collection-provider").CollectionContext;
before(async () => {
  ({ createRoot } = await import("react-dom/client"));
  ({ CatalogFeed } = await import("@/components/catalog-feed"));
  ({ CardOwnerRow } = await import("@/components/public-card-view"));
  ({ SocialContext } = await import("@/components/social-provider"));
  ({ CollectionContext } = await import("@/components/collection-provider"));
});

const pushed: string[] = [];
const router = {
  push(href: string) {
    pushed.push(href);
  },
  replace() {},
  refresh() {},
  prefetch() {},
  back() {},
  forward() {},
};

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function card(n: number, partial: Partial<FeedCard> = {}): FeedCard {
  return {
    id: id(n),
    href: `/u/owner${n}/cards/${id(n)}`,
    player: `Player ${n}`,
    yearLabel: "2023-24",
    setName: "Prizm",
    cardNumber: String(n),
    parallel: "",
    serialRun: null,
    isRookie: false,
    isAuto: false,
    isRelic: false,
    conditionType: "raw",
    grade: "",
    grader: "",
    gradeValue: "",
    imageUrl: null,
    accent: "#7c5cff",
    sport: "basketball",
    priceLabel: "",
    createdAt: "2026-11-10T00:00:00Z",
    owner: { id: id(900 + n), username: `owner${n}`, displayName: `Owner ${n}`, avatarUrl: null },
    likeCount: 0,
    commentCount: 0,
    postId: null,
    source: "fresh",
    ...partial,
  };
}

function feedPage(from: number, count: number, nextOffset: number | null): FeedPage {
  return { cards: Array.from({ length: count }, (_, i) => card(from + i)), nextOffset };
}

let viewer: { id: string; username: string } | null = null;
let followCalls: string[] = [];

function social(): SocialContextValue {
  return {
    user: viewer,
    follows: [],
    isFollowing: () => false,
    toggleFollow: async (userId: string) => {
      followCalls.push(userId);
      return {};
    },
    addComment: async () => ({}),
  } as unknown as SocialContextValue;
}

const collection = { cards: [] } as never;

function wrap(element: ReactNode) {
  return createElement(
    AppRouterContext.Provider,
    { value: router as never },
    createElement(
      PathnameContext.Provider,
      { value: "/catalog" },
      createElement(
        SocialContext.Provider,
        { value: social() },
        createElement(CollectionContext.Provider, { value: collection }, element),
      ),
    ),
  );
}

let root: Root | null = null;
let host: HTMLElement;
const fetched: string[] = [];
let respond: (url: string) => FeedPage = () => feedPage(0, 0, null);

beforeEach(() => {
  window.history.replaceState(null, "", "/catalog");
  window.sessionStorage.clear();
  window.localStorage.clear();
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  fetched.length = 0;
  pushed.length = 0;
  followCalls = [];
  viewer = null;
  respond = () => feedPage(0, 0, null);
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    fetched.push(url);
    return new Response(JSON.stringify(respond(url)), { status: 200 });
  }) as typeof fetch;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
});

function mount(element: ReactNode) {
  act(() => root!.render(wrap(element)));
}

async function flush(ms = 0) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const forYou = { tab: "for-you" as const, sport: null };

describe("Catalog feed", () => {
  it("shows one card per screen with snap paging, its name line, tags, owner and value", async () => {
    const first = card(1, {
      player: "Victor Wembanyama",
      cardNumber: "136",
      isRookie: true,
      conditionType: "graded",
      grade: "PSA 10",
      serialRun: 25,
      priceLabel: "$420.00",
    });
    mount(createElement(CatalogFeed, { initial: { cards: [first, card(2)], nextOffset: null }, initialFilters: forYou }));
    await flush();
    const scroller = host.querySelector("[data-feed-scroller]")!;
    assert.match(scroller.className, /snap-y snap-mandatory/);
    const slides = host.querySelectorAll("[data-feed-slide]");
    assert.equal(slides.length, 2);
    assert.match(slides[0].className, /h-\[100dvh\] snap-start snap-always/);
    const text = slides[0].textContent ?? "";
    assert.match(text, /Victor Wembanyama/);
    assert.match(text, /2023-24 Prizm #136/);
    assert.match(text, /@owner1/);
    assert.match(text, /\$420\.00/);
    const tags = [...slides[0].querySelectorAll("[aria-label='Tags'] li")].map((li) => li.textContent);
    assert.deepEqual(tags, ["RC", "PSA 10", "/25"]);
    assert.ok(slides[0].querySelector(`a[href='${first.href}']`), "See details links to the card page");
  });

  it("has a TikTok rail: avatar to profile with a follow plus, heart, comments, save and share", async () => {
    mount(createElement(CatalogFeed, { initial: { cards: [card(1, { likeCount: 1250, commentCount: 3 })], nextOffset: null }, initialFilters: forYou }));
    await flush();
    const slide = host.querySelector("[data-feed-slide]")!;
    assert.ok(slide.querySelector("a[href='/u/owner1'][aria-label='Owner 1, @owner1']"));
    assert.ok(slide.querySelector("button[aria-label='Follow @owner1']"));
    const heart = slide.querySelector("button[aria-label^='Like']")!;
    assert.equal(heart.getAttribute("aria-pressed"), "false");
    assert.match(slide.textContent ?? "", /1\.2K/);
    assert.ok(slide.querySelector("button[aria-label='Comments, 3']"));
    assert.ok(slide.querySelector("button[aria-label='Save to your wants']"));
    assert.ok(slide.querySelector("button[aria-label='Share']"));
  });

  it("sends a signed-out heart to sign up, and keeps a signed-in heart on a never-posted card", async () => {
    mount(createElement(CatalogFeed, { initial: { cards: [card(1, { likeCount: 2 })], nextOffset: null }, initialFilters: forYou }));
    await flush();
    act(() => host.querySelector<HTMLButtonElement>("button[aria-label^='Like']")!.click());
    assert.deepEqual(pushed, ["/signup?next=%2Fcatalog"]);

    act(() => root!.unmount());
    root = createRoot(host);
    viewer = { id: id(1), username: "me" };
    mount(createElement(CatalogFeed, { initial: { cards: [card(1, { likeCount: 2 })], nextOffset: null }, initialFilters: forYou }));
    await flush();
    act(() => host.querySelector<HTMLButtonElement>("button[aria-label^='Like']")!.click());
    const heart = host.querySelector("button[aria-pressed='true'][aria-label^='Unlike']");
    assert.ok(heart);
    assert.equal(heart.getAttribute("aria-label"), "Unlike, 3 likes");
    assert.match(window.localStorage.getItem("slabhold:catalog-feed:hearts:v1") ?? "", new RegExp(id(1)));
  });

  it("double tap likes with a heart burst; one tap opens the card page", async () => {
    viewer = { id: id(1), username: "me" };
    mount(createElement(CatalogFeed, { initial: { cards: [card(1)], nextOffset: null }, initialFilters: forYou }));
    await flush();
    const hero = host.querySelector<HTMLAnchorElement>("a[aria-label^='Open Player 1']")!;
    act(() => {
      hero.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, clientX: 40, clientY: 40 }));
      hero.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, clientX: 40, clientY: 40 }));
    });
    assert.ok(host.querySelector("[data-heart-burst]"));
    assert.ok(host.querySelector("button[aria-pressed='true'][aria-label^='Unlike']"));
    await flush(320);
    assert.deepEqual(pushed, [], "a double tap never opens the card");

    act(() => {
      hero.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    });
    await flush(320);
    assert.deepEqual(pushed, [card(1).href]);
    // The spot is saved, so Back lands on this card.
    assert.ok(window.sessionStorage.getItem("slabhold:catalog-feed:v1:for-you:all"));
  });

  it("restores the saved spot on Back", async () => {
    window.sessionStorage.setItem(
      "slabhold:catalog-feed:v1:for-you:all",
      JSON.stringify({ cards: [card(5), card(6), card(7)], nextOffset: null, index: 2, savedAt: Date.now() }),
    );
    mount(createElement(CatalogFeed, { initial: feedPage(1, 2, null), initialFilters: forYou }));
    await flush(20);
    const slides = [...host.querySelectorAll("[data-feed-slide]")];
    assert.equal(slides.length, 3);
    assert.ok(slides[2].hasAttribute("data-active"));
  });

  it("switches sport and tab in the URL with a skeleton while the page loads", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetched.push(String(input));
      await gate;
      return new Response(JSON.stringify(feedPage(40, 3, null)), { status: 200 });
    }) as typeof fetch;
    mount(createElement(CatalogFeed, { initial: feedPage(1, 3, null), initialFilters: forYou }));
    await flush();
    const chips = [...host.querySelectorAll<HTMLButtonElement>("[aria-label='Sport'] button")].map((b) => b.textContent);
    assert.deepEqual(chips, ["All", "Baseball", "Basketball", "Football", "Hockey", "Soccer"]);
    const tabs = [...host.querySelectorAll("[role='tab']")].map((t) => t.textContent);
    assert.deepEqual(tabs, ["For You", "Following"]);
    act(() => [...host.querySelectorAll<HTMLButtonElement>("[aria-label='Sport'] button")].find((b) => b.textContent === "Football")!.click());
    assert.equal(window.location.search, "?sport=football");
    assert.ok(host.querySelector("[aria-busy='true']"), "skeleton while loading");
    assert.match(fetched.at(-1) ?? "", /\/api\/catalog\/feed\?sport=football$/);
    release();
    await flush();
    assert.equal(host.querySelectorAll("[data-feed-slide]").length, 3);
  });

  it("reads the next page before the end and never shows a card twice", async () => {
    respond = () => ({ cards: [card(3), card(4), card(5)], nextOffset: null });
    mount(createElement(CatalogFeed, { initial: feedPage(1, 3, 12), initialFilters: forYou }));
    await flush(10);
    assert.match(fetched[0] ?? "", /offset=12/);
    const ids = [...host.querySelectorAll("[data-feed-slide]")].map((slide) => slide.getAttribute("aria-label"));
    assert.equal(ids.length, 5);
    assert.equal(new Set(ids).size, 5);
  });

  it("shows a designed empty state, never a blank screen", async () => {
    mount(createElement(CatalogFeed, { initial: { cards: [], nextOffset: null }, initialFilters: { tab: "following", sport: null } }));
    await flush();
    const empty = host.querySelector("[data-feed-empty]")!;
    assert.match(empty.textContent ?? "", /See who you follow/);
    assert.ok(empty.querySelector("a[href^='/signup']"));
  });
});

describe("Catalog feed rules", () => {
  it("uses brand purple, never teal, and none of the banned words in what readers see", () => {
    for (const file of ["components/catalog-feed.tsx", "components/catalog-feed-comments.tsx", "lib/catalog-feed/feed.ts"]) {
      const source = read(file);
      assert.doesNotMatch(source, /teal|cyan|#14b8a6|#0d9488/i, file);
      // Copy only: strings in quotes and JSX text.
      const copy = [...source.matchAll(/"([^"\n]*)"|>([^<>{}\n]+)</g)].map((m) => m[1] ?? m[2]).join("\n");
      assert.doesNotMatch(copy, /\b(best|free|number one|flip)\b|\bAI\b/i, file);
    }
  });

  it("reads only public cards and keeps For You cacheable while Following never caches", () => {
    const route = read("app/api/catalog/feed/route.ts");
    assert.match(route, /CATALOG_CACHE_CONTROL/);
    assert.match(route, /private, no-store/);
    assert.match(read("lib/catalog-feed/load.ts"), /from\("public_cards"\)/);
  });

  it("keeps the card_likes / card_comments proposal out of the migrations folder, and the feed never needs those tables", () => {
    const migrations = readdirSync(join(process.cwd(), "supabase/migrations"));
    for (const file of migrations) {
      assert.doesNotMatch(read(`supabase/migrations/${file}`), /card_likes|card_comments/, file);
    }
    assert.match(read("docs/catalog-feed-1/proposed-card-likes-comments.sql"), /PROPOSAL ONLY\. UNAPPLIED/);
    for (const file of [
      "components/catalog-feed.tsx",
      "components/catalog-feed-comments.tsx",
      "lib/catalog-feed/feed.ts",
      "lib/catalog-feed/load.ts",
      "app/api/catalog/feed/route.ts",
    ]) {
      assert.doesNotMatch(read(file), /card_likes|card_comments/, file);
    }
  });

  it("replaces Moving today: /moving-today sends readers to the feed", () => {
    const old = read("app/(app)/moving-today/page.tsx");
    assert.match(old, /redirect\(/);
    assert.match(old, /CATALOG_PATH/);
    const page = read("app/(app)/catalog/page.tsx");
    assert.match(page, /<CatalogFeed /);
    assert.match(page, /readFeedPage\(filters, 0, viewerId\)/);
  });
});

describe("Card page owner", () => {
  it("shows the owner's avatar and @handle linked to their profile, holding Follow's room until ready", () => {
    mount(
      createElement(CardOwnerRow, {
        owner: { id: id(900), username: "ada", displayName: "Ada", avatarUrl: null },
        followReady: false,
      }),
    );
    const link = host.querySelector<HTMLAnchorElement>("[data-card-owner] a");
    assert.equal(link?.getAttribute("href"), "/u/ada");
    assert.match(link?.textContent ?? "", /@ada/);
    assert.equal(link?.getAttribute("aria-label"), "Ada, @ada");
  });

  it("draws Follow on the public card page once the viewer is known", () => {
    const view = read("components/public-card-view.tsx");
    assert.match(view, /<CardOwnerRow owner=\{owner\} followReady=\{followReady\} \/>/);
    assert.match(view, /<FollowButton userId=\{owner\.id\} \/>/);
    assert.match(view, /followReady\n/);
  });
});

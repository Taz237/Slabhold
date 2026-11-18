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
import type { ListedCardComment } from "@/lib/catalog-feed/card-client";
import type { CardCommentResult, CardLikeResult } from "@/lib/catalog-feed/card-social";
import type { SocialContextValue } from "@/components/social-provider";

const { win } = installDom();
const SHEET_SETTLE = 240;
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, writable: true, value: win.sessionStorage });
Object.defineProperty(globalThis, "Image", { configurable: true, writable: true, value: win.Image });

// react-dom reads the DOM when it loads, so it and the components load after installDom.
let createRoot: typeof import("react-dom/client").createRoot;
let CatalogFeed: typeof import("@/components/catalog-feed").CatalogFeed;
let CardOwnerRow: typeof import("@/components/public-card-view").CardOwnerRow;
let SocialContext: typeof import("@/components/social-provider").SocialContext;
let CollectionContext: typeof import("@/components/collection-provider").CollectionContext;
let client: typeof import("@/lib/catalog-feed/card-client").cardSocialClient;
before(async () => {
  ({ createRoot } = await import("react-dom/client"));
  ({ CatalogFeed } = await import("@/components/catalog-feed"));
  ({ CardOwnerRow } = await import("@/components/public-card-view"));
  ({ SocialContext } = await import("@/components/social-provider"));
  ({ CollectionContext } = await import("@/components/collection-provider"));
  ({ cardSocialClient: client } = await import("@/lib/catalog-feed/card-client"));
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
    source: "fresh",
    ...partial,
  };
}

function feedPage(from: number, count: number, nextOffset: number | null): FeedPage {
  return { cards: Array.from({ length: count }, (_, i) => card(from + i)), nextOffset };
}

let viewer: { id: string; username: string; displayName?: string; avatarDataUrl?: string | null } | null = null;
let likeCalls: { cardId: string; liked: boolean }[] = [];
let likeReply: (input: { cardId: string; liked: boolean }) => Promise<CardLikeResult> = async (input) => ({
  ok: true,
  liked: input.liked,
  likeCount: null,
});
let listed: ListedCardComment[] = [];
let posted: { cardId: string; body: string }[] = [];
let postReply: (input: { cardId: string; body: string }) => Promise<CardCommentResult> = async () => ({ ok: false, error: "unset" });
let removed: string[] = [];
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
  likeCalls = [];
  likeReply = async (input) => ({ ok: true, liked: input.liked, likeCount: null });
  listed = [];
  posted = [];
  removed = [];
  postReply = async (input) => ({
    ok: true,
    comment: { id: id(777), cardId: input.cardId, userId: viewer!.id, body: input.body, createdAt: new Date().toISOString() },
  });
  client.like = (input) => {
    likeCalls.push(input);
    return likeReply(input);
  };
  client.likedCards = async () => new Set();
  client.list = async () => listed;
  client.post = (input) => {
    posted.push(input);
    return postReply(input);
  };
  client.remove = async ({ commentId }) => {
    removed.push(commentId);
    return { ok: true };
  };
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
    // Sized to the scroller, never 100dvh (they differ in the iOS app and the snap springs back).
    assert.match(slides[0].className, /\bh-full\b.*\bsnap-start\b/);
    assert.doesNotMatch(slides[0].className, /100dvh|snap-always/);
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

  it("shows counts signed out, and a tap on heart, comments, save or follow asks to sign in", async () => {
    mount(createElement(CatalogFeed, { initial: { cards: [card(1, { likeCount: 2, commentCount: 4 })], nextOffset: null }, initialFilters: forYou }));
    await flush();
    assert.ok(host.querySelector("button[aria-label='Like, 2 likes']"));
    assert.ok(host.querySelector("button[aria-label='Comments, 4']"));
    for (const [label, title] of [
      ["Like, 2 likes", "Log in to like cards"],
      ["Comments, 4", "Log in to comment"],
      ["Save to your wants", "Log in to save cards"],
      ["Follow @owner1", "Log in to follow collectors"],
    ]) {
      act(() => host.querySelector<HTMLButtonElement>(`button[aria-label='${label}']`)!.click());
      await flush(5);
      const prompt = document.querySelector("[data-sign-in-prompt]");
      assert.ok(prompt, label);
      assert.match(prompt.textContent ?? "", new RegExp(title));
      assert.ok(prompt.querySelector("a[href='/signup?next=%2Fcatalog']"));
      assert.ok(prompt.querySelector("a[href^='/login']"));
      // Its own layer on the page, above the app's tab bar, never inside the feed's layer.
      const layer = prompt.closest<HTMLElement>("[data-feed-sheet]")!;
      assert.equal(layer.parentElement, document.body);
      assert.match(layer.className, /z-\[60\]/);
      assert.equal(prompt.closest("[data-catalog-feed]"), null);
      act(() => prompt.querySelector<HTMLButtonElement>("button[aria-label='Close']")!.click());
      await flush(SHEET_SETTLE + 20);
      assert.equal(document.querySelector("[data-sign-in-prompt]"), null, "closed");
    }
    assert.deepEqual(likeCalls, [], "nothing is written signed out");
    assert.deepEqual(pushed, [], "the feed stays put");
  });

  it("hearts at once, saves through the server action, and takes the saved count", async () => {
    viewer = { id: id(1), username: "me" };
    let release: (value: CardLikeResult) => void = () => {};
    likeReply = () => new Promise((resolve) => (release = resolve));
    mount(createElement(CatalogFeed, { initial: { cards: [card(1, { likeCount: 2 })], nextOffset: null }, initialFilters: forYou }));
    await flush();
    act(() => host.querySelector<HTMLButtonElement>("button[aria-label='Like, 2 likes']")!.click());
    assert.ok(host.querySelector("button[aria-pressed='true'][aria-label='Unlike, 3 likes']"), "optimistic");
    await flush();
    assert.deepEqual(likeCalls, [{ cardId: id(1), liked: true }]);
    release({ ok: true, liked: true, likeCount: 7 });
    await flush();
    assert.ok(host.querySelector("button[aria-label='Unlike, 7 likes']"), "the saved count");

    act(() => host.querySelector<HTMLButtonElement>("button[aria-label='Unlike, 7 likes']")!.click());
    await flush();
    assert.deepEqual(likeCalls.at(-1), { cardId: id(1), liked: false });
    release({ ok: true, liked: false, likeCount: 6 });
    await flush();
    assert.ok(host.querySelector("button[aria-pressed='false'][aria-label='Like, 6 likes']"));
  });

  it("puts the heart back and says why when the save fails", async () => {
    viewer = { id: id(1), username: "me" };
    likeReply = async () => ({ ok: false, error: "Your account can't do that right now." });
    mount(createElement(CatalogFeed, { initial: { cards: [card(1, { likeCount: 2 })], nextOffset: null }, initialFilters: forYou }));
    await flush();
    act(() => host.querySelector<HTMLButtonElement>("button[aria-label='Like, 2 likes']")!.click());
    await flush();
    assert.ok(host.querySelector("button[aria-pressed='false'][aria-label='Like, 2 likes']"));
    assert.match(host.querySelector("[role='status']")?.textContent ?? "", /can't do that right now/);
  });

  it("double tap likes with a heart burst and never unlikes; one tap opens the card page", async () => {
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
    assert.deepEqual(likeCalls, [{ cardId: id(1), liked: true }]);

    // A second double tap shows the burst again but never unlikes.
    await flush(320);
    act(() => {
      hero.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, clientX: 50, clientY: 50 }));
      hero.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, clientX: 50, clientY: 50 }));
    });
    assert.ok(host.querySelector("button[aria-pressed='true'][aria-label^='Unlike']"));
    assert.equal(likeCalls.length, 1, "no unlike was sent");
    await flush(320);

    act(() => {
      hero.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    });
    await flush(320);
    assert.deepEqual(pushed, [card(1).href]);
    // The spot is saved, so Back lands on this card.
    assert.ok(window.sessionStorage.getItem("slabhold:catalog-feed:v2:for-you:all"));
  });

  it("restores the saved spot on Back", async () => {
    window.sessionStorage.setItem(
      "slabhold:catalog-feed:cards:v1",
      JSON.stringify(Object.fromEntries([card(5), card(6), card(7)].map((c) => [c.id, c]))),
    );
    window.sessionStorage.setItem(
      "slabhold:catalog-feed:v2:for-you:all",
      JSON.stringify({ ids: [id(5), id(6), id(7)], nextOffset: null, index: 2, savedAt: Date.now() }),
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
    const ids = [...host.querySelectorAll("[data-card-id]")].map((slide) => slide.getAttribute("data-card-id"));
    assert.equal(ids.length, 5);
    assert.equal(new Set(ids).size, 5);
  });

  it("mounts only the cards within two of the screen; the rest hold their place", async () => {
    mount(createElement(CatalogFeed, { initial: feedPage(1, 10, null), initialFilters: forYou }));
    await flush();
    assert.equal(host.querySelectorAll("[data-card-id]").length, 10, "every card keeps a box");
    assert.equal(host.querySelectorAll("[data-feed-slide]").length, 3, "the card on screen and the next two");
    const hold = host.querySelector("[data-feed-hold]")!;
    assert.equal(hold.getAttribute("aria-hidden"), "true");
    assert.equal(hold.textContent, "");
  });

  it("saves card ids for Back, never whole cards on every swipe", async () => {
    mount(createElement(CatalogFeed, { initial: feedPage(1, 3, null), initialFilters: forYou }));
    await flush(700);
    const spot = JSON.parse(window.sessionStorage.getItem("slabhold:catalog-feed:v2:for-you:all") ?? "null");
    assert.deepEqual(spot.ids, [id(1), id(2), id(3)]);
    assert.equal("cards" in spot, false);
  });

  it("a heart from the catalog only touches card hearts, never timeline likes", () => {
    const actions = read("lib/catalog-feed/card-actions.ts");
    assert.match(actions, /CARD_LIKES_BUCKET/);
    assert.doesNotMatch(actions, /consumeLikeLimit/);
  });

  it("shows a designed empty state, never a blank screen", async () => {
    mount(createElement(CatalogFeed, { initial: { cards: [], nextOffset: null }, initialFilters: { tab: "following", sport: null } }));
    await flush();
    const empty = host.querySelector("[data-feed-empty]")!;
    assert.match(empty.textContent ?? "", /See who you follow/);
    assert.ok(empty.querySelector("a[href^='/signup']"));
  });
});

describe("Card comments sheet", () => {
  const comment = (n: number, userId: string, body: string): ListedCardComment => ({
    id: id(600 + n),
    userId,
    body,
    createdAt: new Date(Date.now() - n * 60000).toISOString(),
    author: { username: `writer${n}`, displayName: `Writer ${n}`, avatarUrl: null },
  });

  async function openSheet(feedCard: FeedCard) {
    mount(createElement(CatalogFeed, { initial: { cards: [feedCard], nextOffset: null }, initialFilters: forYou }));
    await flush();
    act(() => host.querySelector<HTMLButtonElement>("button[aria-label^='Comments']")!.click());
    for (let i = 0; i < 20 && !document.querySelector("[role='dialog'] h2"); i++) await flush(5);
    await flush(5);
    return document.querySelector<HTMLElement>("[role='dialog']")!;
  }

  it("opens in its own layer above the app's tab bar, with the comment bar always showing", async () => {
    viewer = { id: id(1), username: "me", displayName: "Me", avatarDataUrl: null };
    listed = [comment(1, id(50), "Clean card")];
    const sheet = await openSheet(card(1, { commentCount: 1 }));
    const layer = sheet.closest<HTMLElement>("[data-feed-sheet]")!;
    assert.equal(layer.parentElement, document.body, "portaled to the page, out of the feed's layer");
    assert.match(layer.className, /fixed inset-0 z-\[60\]/);
    const bar = sheet.querySelector("[data-comment-bar]")!;
    assert.equal(bar.querySelector("textarea")?.getAttribute("placeholder"), "Add a comment…");
    assert.ok(bar.querySelector("button[type='submit']"));
  });

  it("goes straight to writing when a card has no comments yet", async () => {
    viewer = { id: id(1), username: "me", displayName: "Me", avatarDataUrl: null };
    const sheet = await openSheet(card(1));
    assert.ok(sheet.querySelector("[data-comments-empty]"));
    assert.equal(document.activeElement, sheet.querySelector("textarea"));
  });

  it("sits on top of the iOS keyboard", async () => {
    viewer = { id: id(1), username: "me", displayName: "Me", avatarDataUrl: null };
    const sheet = await openSheet(card(1));
    act(() => {
      window.dispatchEvent(Object.assign(new win.Event("keyboardWillShow"), { keyboardHeight: 320 }));
    });
    await flush(20);
    assert.equal(sheet.style.bottom, "320px");
    act(() => {
      window.dispatchEvent(new win.Event("keyboardWillHide"));
    });
    await flush(20);
    assert.equal(sheet.style.bottom, "");
  });

  it("gives focus back to the comments button without scrolling the feed", async () => {
    viewer = { id: id(1), username: "me", displayName: "Me", avatarDataUrl: null };
    listed = [comment(1, id(50), "Clean card")];
    mount(createElement(CatalogFeed, { initial: { cards: [card(1)], nextOffset: null }, initialFilters: forYou }));
    await flush();
    const button = host.querySelector<HTMLButtonElement>("button[aria-label^='Comments']")!;
    button.focus();
    act(() => button.click());
    for (let i = 0; i < 20 && !document.querySelector("[role='dialog'] h2"); i++) await flush(5);
    const calls: { node: Element; options: unknown }[] = [];
    const focus = win.HTMLElement.prototype.focus;
    win.HTMLElement.prototype.focus = function (this: HTMLElement, options?: FocusOptions) {
      calls.push({ node: this, options });
      return focus.call(this, options);
    };
    try {
      act(() => document.querySelector<HTMLButtonElement>("[role='dialog'] button[aria-label='Close']")!.click());
      await flush(SHEET_SETTLE + 20);
    } finally {
      win.HTMLElement.prototype.focus = focus;
    }
    assert.equal(document.querySelector("[role='dialog']"), null);
    const back = calls.find((call) => call.node === button);
    assert.deepEqual(back?.options, { preventScroll: true });
  });

  it("shows a new comment at once, then keeps it with Retry when it fails", async () => {
    viewer = { id: id(1), username: "me", displayName: "Me", avatarDataUrl: null };
    let release: (value: CardCommentResult) => void = () => {};
    postReply = () => new Promise((resolve) => (release = resolve));
    const sheet = await openSheet(card(1));
    const field = sheet.querySelector<HTMLTextAreaElement>("textarea")!;
    const setter = Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, "value")!.set!;
    act(() => {
      setter.call(field, "Sharp corners");
      field.dispatchEvent(new win.Event("input", { bubbles: true }));
    });
    act(() => sheet.querySelector<HTMLButtonElement>("button[type='submit']")!.click());
    const row = () => sheet.querySelector("[data-comments] li")!;
    assert.match(row().textContent ?? "", /Sharp corners/, "shows before the server answers");
    assert.equal(row().getAttribute("data-comment-state"), "sending");
    assert.equal(field.value, "", "the bar is ready for the next one");

    release({ ok: false, error: "That comment can't be posted." });
    await flush(10);
    assert.equal(row().getAttribute("data-comment-state"), "failed");
    assert.equal(sheet.querySelector("[role='alert']")?.textContent, "That comment can't be posted.");
    assert.ok(host.querySelector("button[aria-label='Comments, 0']"), "no count for a comment that didn't post");

    postReply = async (input) => ({
      ok: true,
      comment: { id: id(778), cardId: input.cardId, userId: viewer!.id, body: input.body, createdAt: new Date().toISOString() },
    });
    act(() => [...row().querySelectorAll("button")].find((b) => b.textContent === "Retry")!.click());
    await flush(10);
    assert.equal(row().hasAttribute("data-comment-state"), false, "posted");
    assert.deepEqual(posted.map((p) => p.body), ["Sharp corners", "Sharp corners"]);
    assert.ok(host.querySelector("button[aria-label='Comments, 1']"));
  });

  it("says why comments didn't load and lets you try again", async () => {
    viewer = { id: id(1), username: "me", displayName: "Me", avatarDataUrl: null };
    let fail = true;
    client.list = async () => {
      if (fail) throw { code: "42501", message: "permission denied for table card_comments" };
      return [comment(1, id(50), "Back again")];
    };
    const sheet = await openSheet(card(1, { commentCount: 1 }));
    const box = sheet.querySelector("[data-comments-error]")!;
    assert.match(box.textContent ?? "", /Your account can't do that right now\./);
    assert.doesNotMatch(box.textContent ?? "", /permission denied/);
    fail = false;
    act(() => [...box.querySelectorAll("button")].find((b) => b.textContent === "Try again")!.click());
    await flush(10);
    assert.match(sheet.querySelector("[data-comments]")?.textContent ?? "", /Back again/);
  });

  it("lists comments newest first, as read", async () => {
    viewer = { id: id(1), username: "me", displayName: "Me", avatarDataUrl: null };
    listed = [comment(1, id(50), "Newest one"), comment(2, id(51), "Older one")];
    const sheet = await openSheet(card(1, { commentCount: 2 }));
    const bodies = [...sheet.querySelectorAll("[data-comments] li")].map((li) => li.textContent ?? "");
    assert.match(bodies[0], /Newest one/);
    assert.match(bodies[1], /Older one/);
    assert.match(sheet.querySelector("h2")?.textContent ?? "", /2 comments/);
  });

  it("posts 1 to 280 characters, adds it on top and bumps the count", async () => {
    viewer = { id: id(1), username: "me", displayName: "Me", avatarDataUrl: null };
    listed = [comment(1, id(50), "First")];
    const sheet = await openSheet(card(1, { commentCount: 1 }));
    const field = sheet.querySelector<HTMLTextAreaElement>("textarea")!;
    const type = (value: string) =>
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, "value")!.set!;
        setter.call(field, value);
        field.dispatchEvent(new win.Event("input", { bubbles: true }));
      });
    const submit = () => sheet.querySelector<HTMLButtonElement>("button[type='submit']")!;
    type("x".repeat(281));
    assert.equal(submit().disabled, true, "over 280 can't be sent");
    type("  Clean corners  ");
    assert.equal(submit().disabled, false);
    act(() => submit().click());
    await flush(10);
    assert.deepEqual(posted, [{ cardId: id(1), body: "Clean corners" }]);
    const first = sheet.querySelector("[data-comments] li")?.textContent ?? "";
    assert.match(first, /Clean corners/);
    assert.ok(host.querySelector("button[aria-label='Comments, 2']"), "the rail count moved");
  });

  it("shows the friendly words for a rejected comment and a restricted account", async () => {
    viewer = { id: id(1), username: "me", displayName: "Me", avatarDataUrl: null };
    const sheet = await openSheet(card(1));
    assert.ok(sheet.querySelector("[data-comments-empty]"));
    const field = sheet.querySelector<HTMLTextAreaElement>("textarea")!;
    const setter = Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, "value")!.set!;
    for (const message of ["That comment can't be posted.", "Your account can't do that right now."]) {
      postReply = async () => ({ ok: false, error: message });
      act(() => {
        setter.call(field, "Nice pickup");
        field.dispatchEvent(new win.Event("input", { bubbles: true }));
      });
      act(() => sheet.querySelector<HTMLButtonElement>("button[type='submit']")!.click());
      await flush(10);
      assert.equal(sheet.querySelector("[role='alert']")?.textContent, message);
    }
  });

  it("lets you delete your own comment, and the card owner delete any on their card", async () => {
    viewer = { id: id(1), username: "me", displayName: "Me", avatarDataUrl: null };
    listed = [comment(1, id(1), "Mine"), comment(2, id(52), "Someone else's")];
    let sheet = await openSheet(card(1));
    const deletes = () => [...sheet.querySelectorAll("button")].filter((b) => b.textContent === "Delete");
    assert.equal(deletes().length, 1, "only my own on someone else's card");
    act(() => deletes()[0].click());
    await flush(10);
    assert.deepEqual(removed, [id(601)]);
    assert.doesNotMatch(sheet.textContent ?? "", /Mine/);

    act(() => root!.unmount());
    root = createRoot(host);
    document.body.querySelectorAll("[role='dialog']").forEach((node) => node.remove());
    listed = [comment(1, id(1), "Mine"), comment(2, id(52), "Someone else's")];
    // Viewer owns this card.
    sheet = await openSheet(card(1, { owner: { id: id(1), username: "me", displayName: "Me", avatarUrl: null } }));
    assert.equal(deletes().length, 2, "the owner can delete any comment on their card");
  });
});

describe("Catalog feed rules", () => {
  it("uses brand purple, never teal, and none of the banned words in what readers see", () => {
    for (const file of ["components/catalog-feed.tsx", "components/catalog-feed-comments.tsx", "lib/catalog-feed/feed.ts", "lib/catalog-feed/card-social.ts"]) {
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

  it("uses card_likes and card_comments for the heart and comments, and adds no SQL", () => {
    for (const file of readdirSync(join(process.cwd(), "supabase/migrations"))) {
      assert.doesNotMatch(read(`supabase/migrations/${file}`), /card_likes|card_comments/, file);
    }
    const client = read("lib/catalog-feed/card-client.ts");
    assert.match(client, /from\("card_likes"\)/);
    assert.match(client, /from\("card_comments"\)[\s\S]*order\("created_at", \{ ascending: false \}\)/);
    const load = read("lib/catalog-feed/load.ts");
    assert.match(load, /"card_likes"/);
    assert.match(load, /"card_comments"/);
    // Post likes and replies no longer drive the card's heart or comments.
    for (const file of ["components/catalog-feed.tsx", "components/catalog-feed-comments.tsx"]) {
      assert.doesNotMatch(read(file), /syncPostLike|addComment|from\("likes"\)|from\("comments"\)|postId/, file);
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

describe("Full screen catalog", () => {
  it("hides the app's tab bar, + button and join bar on /catalog only", async () => {
    const { isFullScreenPath } = await import("@/lib/auth/guest-paths");
    assert.equal(isFullScreenPath("/catalog"), true);
    assert.equal(isFullScreenPath("/catalog?tab=following"), true);
    assert.equal(isFullScreenPath("/catalog/"), true);
    assert.equal(isFullScreenPath("/"), false);
    assert.equal(isFullScreenPath("/collection"), false);
    const shell = read("components/app-shell.tsx");
    assert.match(shell, /showNav && !chromeless && !fullScreen \? \(\n\s*<nav/);
    assert.match(shell, /showJoin && !chromeless && !fullScreen \? <JoinBar \/>/);
    assert.match(shell, /showNav && !chromeless && !fullScreen \? <CreateMenu/);
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

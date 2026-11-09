import "@/lib/test/server-only-stub";
import { dom } from "@/lib/test/dom-installed";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { beforeEach, describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import nextConfig from "@/next.config";
import { CollectionContext } from "@/components/collection-provider";
import { DealSheet } from "@/components/deal-sheet";
import { MessageAttachments } from "@/components/message-attachments";
import { MessageThread } from "@/components/message-thread";
import { SendPostSheetView } from "@/components/send-post-sheet-view";
import { SocialContext } from "@/components/social-provider";
import { Tweet } from "@/components/tweet";
import { inboxPreviewText, messageLinks, SHARED_A_POST } from "@/lib/social/dm-inbox";
import { BLOCKED_INTERACTION } from "@/lib/safety/block";
import { MARK_SOLD_LABEL } from "@/lib/deals/state";
import type { DirectMessage, Post, Profile, PublicCard } from "@/lib/social/types";
import type { SportsCard } from "@/lib/types";

const { win } = dom;

type Provider = { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: Provider;
};
const { PathnameContext, SearchParamsContext } = require(
  "next/dist/shared/lib/hooks-client-context.shared-runtime",
) as { PathnameContext: Provider; SearchParamsContext: Provider };

const pushes: string[] = [];
const router = {
  back() {},
  forward() {},
  refresh() {},
  push: (href: string) => pushes.push(href),
  replace() {},
  prefetch() {},
};

let root: Root | null = null;

beforeEach(() => {
  if (root) act(() => root!.unmount());
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  pushes.length = 0;
});

function person(id: string, username: string, displayName: string): Profile {
  return {
    id,
    username,
    displayName,
    bio: "",
    avatarDataUrl: null,
    coverDataUrl: null,
    accent: "#7c5cff",
    createdAt: "2026-01-01T00:00:00Z",
  } as Profile;
}

const sam = person("user-sam", "sam", "Sam");
const maya = person("user-maya", "maya", "Maya");
const ben = person("user-ben", "ben", "Ben");
const dee = person("user-dee", "dee", "Dee");
const eve = person("user-eve", "eve", "Eve");

const POST_ID = "11111111-2222-4333-8444-555555555555";

function publicCard(id = "card-1"): PublicCard {
  return {
    id,
    playerName: "Victor Wembanyama",
    year: 2023,
    setBrand: "Prizm",
    cardNumber: "136",
    sport: "Basketball",
    photoDataUrl: null,
    accent: "#7c5cff",
    estimatedSellPrice: 0,
  } as PublicCard;
}

function post(partial: Partial<Post> = {}): Post {
  return {
    id: POST_ID,
    authorId: maya.id,
    body: "Wemby still feels like the hold.",
    imageDataUrl: null,
    card: null,
    quotedPostId: null,
    createdAt: new Date().toISOString(),
    ...partial,
  } as Post;
}

function dm(id: string, senderId: string, receiverId: string, at: string, content = "hi"): DirectMessage {
  return { id, senderId, receiverId, content, createdAt: at, read: true, kind: "text", cardPreview: null };
}

function ownedCard(id: string, sold = false): SportsCard {
  return {
    id,
    playerName: `Player ${id}`,
    sellPrice: sold ? 100 : null,
    sellDate: sold ? "2026-10-01" : null,
  } as SportsCard;
}

function socialValue(overrides: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = {
    ready: true,
    mode: "local",
    user: sam,
    profiles: [sam, maya, ben, dee, eve],
    posts: [],
    messages: [],
    follows: [],
    blockedIds: [],
    mutedIds: [],
    safetyAccounts: [],
    publicCards: [],
    postCardValues: new Map(),
    postCardValuesLoading: false,
    commentsFor: () => [],
    findPost: () => undefined,
    followingOf: () => [],
    profilesReady: () => true,
    profilesFailed: () => false,
    requestProfiles: () => {},
    requestPublicCards: () => {},
    publicCardsReady: () => true,
    publicCardsFailed: () => false,
    isLiked: () => false,
    isReposted: () => false,
    likeCount: () => 0,
    repostCount: () => 0,
    threadMore: () => false,
    loadThreadMessages: async () => {},
    markThreadRead: () => {},
    refreshInbox: async () => [],
    sendMessage: async () => ({}),
    rememberPosts: () => {},
    ...overrides,
  };
  base.profileByUsername = (name: string) =>
    (base.profiles as Profile[]).find((profile) => profile.username === name.trim().toLowerCase());
  return new Proxy(base, {
    get(target, key) {
      if (typeof key === "symbol" || key === "then" || key === "$$typeof") return undefined;
      return key in target ? target[key] : () => undefined;
    },
  });
}

function mount(
  element: ReactNode,
  { social = socialValue(), cards = [] as SportsCard[], search = "", path = "/" } = {},
) {
  act(() =>
    root!.render(
      createElement(
        AppRouterContext.Provider,
        { value: router },
        createElement(
          PathnameContext.Provider,
          { value: path },
          createElement(
            SearchParamsContext.Provider,
            { value: new URLSearchParams(search) },
            createElement(
              ImageConfigContext.Provider,
              { value: { ...imageConfigDefault, ...nextConfig.images } },
              createElement(
                SocialContext.Provider,
                { value: social as never },
                createElement(
                  CollectionContext.Provider,
                  { value: { cards, ready: true, syncError: null, reload() {} } as never },
                  element,
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

function click(element: Element | null) {
  assert.ok(element, "element to click");
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("Send button on posts", () => {
  it("shows Send in a DM when logged in", () => {
    mount(createElement(Tweet, { post: post(), author: maya }));
    const send = document.querySelector("[data-engagement] button[aria-label='Send in a DM']");
    assert.ok(send, "send button");
    assert.match(send.className, /min-h-11/);
  });

  it("hides Send when logged out", () => {
    mount(createElement(Tweet, { post: post(), author: maya }), { social: socialValue({ user: null }) });
    assert.equal(document.querySelector("button[aria-label='Send in a DM']"), null);
  });

  it("hides Send on your own hidden post", () => {
    mount(createElement(Tweet, { post: post({ authorId: sam.id, hiddenAt: "2026-10-01T00:00:00Z" }), author: sam }));
    assert.equal(document.querySelector("button[aria-label='Send in a DM']"), null);
  });

  it("puts Ask price in the menu on someone else's card post", () => {
    mount(createElement(Tweet, { post: post({ card: publicCard() }), author: maya }));
    click(document.querySelector("button[aria-label='More']"));
    const ask = document.querySelector<HTMLAnchorElement>("[data-ask-price]");
    assert.ok(ask, "ask price item");
    assert.equal(ask.getAttribute("href"), `/messages/maya?post=${POST_ID}`);
    assert.equal(ask.textContent, "Ask price");
  });

  it("has no Ask price without a card", () => {
    mount(createElement(Tweet, { post: post(), author: maya }));
    click(document.querySelector("button[aria-label='More']"));
    assert.equal(document.querySelector("[data-ask-price]"), null);
  });
});

describe("Send sheet", () => {
  const messages = [
    dm("1", sam.id, maya.id, "2026-10-01T10:00:00Z"),
    dm("2", ben.id, sam.id, "2026-10-03T10:00:00Z"),
    dm("3", dee.id, sam.id, "2026-10-04T10:00:00Z"),
  ];

  function rows() {
    return [...document.querySelectorAll("[data-send-row]")].map((row) => row.getAttribute("data-send-row"));
  }

  it("lists recent partners first and leaves out blocked and safety accounts", () => {
    mount(createElement(SendPostSheetView, { post: post(), onClose() {} }), {
      social: socialValue({
        messages,
        blockedIds: [ben.id],
        safetyAccounts: [dee],
        followingOf: () => [eve, dee],
      }),
    });
    const recent = [...document.querySelectorAll("[data-send-recent] [data-send-row]")].map((row) =>
      row.getAttribute("data-send-row"),
    );
    assert.deepEqual(recent, ["maya"]);
    assert.deepEqual(rows(), ["maya", "eve"]);
  });

  it("sends one message with exactly one post link, one tap at a time", async () => {
    const sent: { to: string; text: string }[] = [];
    let finish: (value: { error?: string }) => void = () => {};
    mount(createElement(SendPostSheetView, { post: post(), onClose() {} }), {
      social: socialValue({
        messages,
        sendMessage: (to: string, text: string) => {
          sent.push({ to, text });
          return new Promise((resolve) => (finish = resolve));
        },
      }),
    });
    const note = document.querySelector<HTMLInputElement>("input[placeholder='Add a note (optional)']");
    assert.ok(note);
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")!.set!;
      setter.call(note, "This one");
      note.dispatchEvent(new win.Event("input", { bubbles: true }));
    });
    click(document.querySelector("button[aria-label='Send to @maya']"));
    click(document.querySelector("button[aria-label='Send to @maya']"));
    click(document.querySelector("button[aria-label='Send to @dee']"));
    assert.equal(sent.length, 1, "one send while pending");
    assert.ok(document.querySelector<HTMLButtonElement>("button[aria-label='Send to @dee']")?.disabled);
    assert.equal(sent[0].to, maya.id);
    assert.equal(sent[0].text, `This one\nhttps://slabhold.app/posts/${POST_ID}`);
    assert.equal(messageLinks(sent[0].text).length, 1);
    await act(async () => finish({}));
    const toast = document.querySelector("[data-send-toast]");
    assert.match(toast?.textContent ?? "", /^Sent/);
    assert.equal(toast?.querySelector("a")?.getAttribute("href"), "/messages/maya");
    assert.ok(document.querySelector("button[aria-label='Sent to @maya']"));
  });

  it("shows the block error from the send", async () => {
    mount(createElement(SendPostSheetView, { post: post(), onClose() {} }), {
      social: socialValue({ messages, sendMessage: async () => ({ error: BLOCKED_INTERACTION }) }),
    });
    click(document.querySelector("button[aria-label='Send to @maya']"));
    await flush();
    assert.match(document.querySelector("[data-send-row='maya'] [role=alert]")?.textContent ?? "", /can't interact/);
  });

  it("stops at 5 people per sheet", async () => {
    const people = Array.from({ length: 7 }, (_, i) => person(`p${i}`, `p${i}`, `P${i}`));
    const many = people.map((p, i) => dm(`m${i}`, p.id, sam.id, `2026-10-1${i}T10:00:00Z`));
    let calls = 0;
    mount(createElement(SendPostSheetView, { post: post(), onClose() {} }), {
      social: socialValue({
        profiles: [sam, ...people],
        messages: many,
        sendMessage: async () => {
          calls++;
          return {};
        },
      }),
    });
    for (const p of [...people].reverse()) {
      click(document.querySelector(`button[aria-label='Send to @${p.username}']`));
      await flush();
    }
    assert.equal(calls, 5);
    assert.match(document.body.textContent ?? "", /send this to 5 people at a time/);
  });
});

describe("Ask price in the thread", () => {
  function field() {
    return document.querySelector<HTMLTextAreaElement>("textarea[aria-label='Message Maya']");
  }

  it("fills the box with How much? and the link, and doesn't send", async () => {
    let sends = 0;
    mount(createElement(MessageThread, { username: "maya" }), {
      social: socialValue({ sendMessage: async () => (sends++, {}) }),
      search: `post=${POST_ID}`,
      path: "/messages/maya",
    });
    await flush();
    assert.equal(field()?.value, `How much?\nhttps://slabhold.app/posts/${POST_ID}`);
    assert.equal(sends, 0);
  });

  it("shows the blocked state with no draft when you blocked them", async () => {
    mount(createElement(MessageThread, { username: "maya" }), {
      social: socialValue({ profiles: [sam], blockedIds: [maya.id], safetyAccounts: [maya] }),
      search: `post=${POST_ID}`,
      path: "/messages/maya",
    });
    await flush();
    assert.equal(field(), null);
    assert.match(document.body.textContent ?? "", /You've blocked @maya/);
  });

  it("shows the blocked state when they're blocked but still loaded", async () => {
    mount(createElement(MessageThread, { username: "maya" }), {
      social: socialValue({ blockedIds: [maya.id] }),
      search: `post=${POST_ID}`,
      path: "/messages/maya",
    });
    await flush();
    assert.equal(field(), null);
    assert.match(document.body.textContent ?? "", /can't message @maya/);
  });
});

describe("Deal sheet start card", () => {
  function picked() {
    return document.querySelector<HTMLSelectElement>("[role=dialog] select")?.value;
  }
  const cards = [ownedCard("held"), ownedCard("sold", true)];

  it("starts on an owned card you still hold", () => {
    mount(createElement(DealSheet, { onClose() {}, fixedBuyerId: maya.id, initialCardId: "held" }), { cards });
    assert.equal(picked(), "held");
  });

  it("ignores a sold card or one you don't own", () => {
    mount(createElement(DealSheet, { onClose() {}, fixedBuyerId: maya.id, initialCardId: "sold" }), { cards });
    assert.equal(picked(), "");
    mount(createElement(DealSheet, { onClose() {}, fixedBuyerId: maya.id, initialCardId: "theirs" }), { cards });
    assert.equal(picked(), "");
  });

  it("is today's sheet with no start card", () => {
    mount(createElement(DealSheet, { onClose() {}, fixedBuyerId: maya.id }), { cards });
    assert.equal(picked(), "");
    assert.match(document.body.textContent ?? "", /With @maya|With @them/);
  });

  it("is passed from the thread's newest linked post with your card", async () => {
    const linked = post({ card: publicCard("held") });
    mount(createElement(MessageThread, { username: "maya" }), {
      social: socialValue({
        messages: [dm("1", maya.id, sam.id, "2026-10-01T10:00:00Z", `https://slabhold.app/posts/${POST_ID}`)],
        findPost: (id: string) => (id === POST_ID ? linked : undefined),
      }),
      cards,
      path: "/messages/maya",
    });
    click([...document.querySelectorAll("button")].find((button) => button.textContent === MARK_SOLD_LABEL) ?? null);
    assert.equal(picked(), "held");
  });
});

describe("Post unavailable", () => {
  const text = `Look\nhttps://slabhold.app/posts/${POST_ID}`;

  it("draws the mini card for a post that's there", () => {
    mount(createElement(MessageAttachments, { text }), {
      social: socialValue({ findPost: () => post() }),
    });
    assert.ok(document.querySelector("[data-shared-post]"));
    assert.equal(document.querySelector("[data-post-unavailable]"), null);
  });

  for (const [name, overrides] of [
    ["hidden", { findPost: () => post({ hiddenAt: "2026-10-01T00:00:00Z" }) }],
    ["by a blocked author", { findPost: () => post(), blockedIds: [maya.id] }],
    ["missing", { findPost: () => undefined }],
  ] as const) {
    it(`shows a grey chip for a post that's ${name}`, () => {
      mount(createElement(MessageAttachments, { text }), { social: socialValue(overrides) });
      const chip = document.querySelector("[data-post-unavailable]");
      assert.equal(chip?.textContent, "Post unavailable");
      assert.match(chip?.className ?? "", /zinc/);
      assert.equal(document.querySelector("[data-shared-post]"), null);
    });
  }

  it("draws nothing for a card link it can't find", () => {
    mount(createElement(MessageAttachments, { text: "https://slabhold.app/u/maya/cards/c-1" }));
    assert.equal(document.querySelector("[data-post-unavailable]"), null);
  });

  it("keeps the inbox line as Shared a post", () => {
    assert.equal(inboxPreviewText(`https://slabhold.app/posts/${POST_ID}`), SHARED_A_POST);
  });
});

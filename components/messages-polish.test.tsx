import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import nextConfig from "@/next.config";
import { installDom } from "@/lib/test/dom";
import { CollectionContext } from "@/components/collection-provider";
import { SocialContext } from "@/components/social-provider";
import { MessagesView } from "@/components/messages-view";
import { MessageThread } from "@/components/message-thread";
import type { DirectMessage, OwnedCard, Post, Profile } from "@/lib/social/types";

const { state } = installDom();

const require = createRequire(process.cwd() + "/package.json");
const { SearchParamsContext } = require("next/dist/shared/lib/hooks-client-context.shared-runtime") as {
  SearchParamsContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};

// Deal and value lookups fetch on mount. Nothing here needs them.
globalThis.fetch = (async () => new Response("{}", { status: 404 })) as typeof fetch;

let root: Root | null = null;
let host: HTMLElement;

beforeEach(() => {
  if (root) act(() => root!.unmount());
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  state.reducedMotion = false;
  pushed.length = 0;
});

const pushed: string[] = [];
const router = {
  push: (href: string) => pushed.push(href),
  replace: () => {},
  refresh: () => {},
  prefetch: () => {},
  back: () => {},
  forward: () => {},
};

function profile(id: string, username: string, displayName: string): Profile {
  return {
    id,
    email: "",
    username,
    displayName,
    bio: "",
    avatarDataUrl: null,
    coverDataUrl: null,
    accent: "#7c5cff",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

const me = profile("me", "me", "Me");
const ada = profile("ada", "adacards", "Ada Park");
const sam = profile("sam", "boxbreak", "Sam Ortiz");
const lee = profile("lee", "leeslabs", "Lee Moss");

const T0 = Date.now() - 3 * 60 * 60 * 1000;

function dm(id: string, from: string, to: string, minutes: number, extra: Partial<DirectMessage> = {}): DirectMessage {
  return {
    id,
    senderId: from,
    receiverId: to,
    content: `message ${id}`,
    createdAt: new Date(T0 + minutes * 60_000).toISOString(),
    read: false,
    ...extra,
  };
}

const sharedCard: OwnedCard = {
  id: "card-1",
  ownerId: "ada",
  playerName: "Jordan Love",
  year: 2020,
  setBrand: "Select",
  cardNumber: "1",
  sport: "Football",
  photoDataUrl: "https://example.com/love.jpg",
  accent: "#7c5cff",
  estimatedSellPrice: 0,
  grade: "10",
  grader: "PSA",
  conditionType: "graded",
  openToOffers: true,
};

const sharedPost: Post = {
  id: "post-9",
  authorId: "sam",
  body: "Pulled this Wemby from a hanger.",
  imageDataUrl: null,
  card: null,
  quotedPostId: null,
  createdAt: new Date(T0).toISOString(),
};

function Providers({
  children,
  messages = [],
  suggestions = [],
  search = "",
}: {
  children?: ReactNode;
  messages?: DirectMessage[];
  suggestions?: Profile[];
  search?: string;
}) {
  const social = {
    ready: true,
    user: me,
    profiles: [me, ada, sam, lee],
    messages,
    posts: [sharedPost],
    publicCards: [sharedCard],
    follows: [{ followerId: "me", followingId: "lee", createdAt: "" }],
    suggestions,
    suggestionsReady: true,
    blockedIds: [],
    mutedIds: [],
    safetyAccounts: [],
    notifications: [],
    refresh: async () => {},
    markThreadRead: () => {},
    loadThreadMessages: async () => {},
    refreshInbox: async () => [],
    refreshFollows: async () => {},
    threadMore: () => false,
    inboxMore: { notifications: false, messages: false },
    loadOlderMessages: async () => {},
    sendMessage: async () => ({}),
    findPost: (id: string) => (id === sharedPost.id ? sharedPost : undefined),
    profileByUsername: (username: string) =>
      [me, ada, sam, lee].find((person) => person.username.toLowerCase() === username.toLowerCase()),
    isFollowing: (id: string) => id === "lee",
  };
  const value = new Proxy(social, {
    get(target, key) {
      if (key in target) return target[key as keyof typeof target];
      if (typeof key === "symbol" || key === "then" || key === "$$typeof") return undefined;
      return () => undefined;
    },
  });
  return createElement(
    AppRouterContext.Provider,
    { value: router as never },
    createElement(
      SearchParamsContext.Provider,
      { value: new URLSearchParams(search) },
      createElement(
        ImageConfigContext.Provider,
        { value: { ...imageConfigDefault, ...nextConfig.images } },
        createElement(
          SocialContext.Provider,
          { value: value as never },
          createElement(
            CollectionContext.Provider,
            { value: { cards: [], ready: true, syncError: null, reload: () => {} } as never },
            children,
          ),
        ),
      ),
    ),
  );
}

function mount(element: ReactNode) {
  act(() => root!.render(element));
}

function click(element: Element | null | undefined) {
  assert.ok(element, "element to click");
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** Sets the value and calls React's onChange, the way the field would. */
function type(input: HTMLInputElement | HTMLTextAreaElement | null, value: string) {
  assert.ok(input, "field to type in");
  const proto = input.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(input, value);
    const key = Object.keys(input).find((name) => name.startsWith("__reactProps"));
    const props = key ? (input as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
    props?.onChange?.({ target: input, currentTarget: input });
  });
}

function inbox(messages: DirectMessage[], suggestions: Profile[] = []) {
  mount(createElement(Providers, { messages, suggestions }, createElement(MessagesView)));
}

function thread(messages: DirectMessage[], username = "adacards", search = "") {
  mount(createElement(Providers, { messages, search }, createElement(MessageThread, { username })));
}

describe("inbox", () => {
  const messages = [
    dm("1", "ada", "me", 0, { content: "Still have the Love?" }),
    dm("2", "ada", "me", 1, { content: "Can do $40" }),
    dm("3", "me", "sam", 2, { content: "Nice pull", read: true }),
  ];

  it("bolds unread threads with a purple dot and keeps read ones quiet", () => {
    inbox(messages);
    const rows = [...document.querySelectorAll("[data-conversation]")];
    assert.equal(rows.length, 2);
    const [sams, adas] = rows;
    assert.match(adas.textContent ?? "", /Ada Park/);
    assert.equal(adas.getAttribute("data-unread"), "true");
    assert.ok(adas.querySelector("[data-unread-dot]"));
    assert.match(adas.querySelector("[data-unread-dot]")?.className ?? "", /bg-\[#7C3AED\]|bg-violet-600/);
    assert.match(adas.textContent ?? "", /2 unread/);
    assert.match(adas.querySelector("[data-conversation-name]")?.className ?? "", /font-bold/);
    assert.equal(sams.getAttribute("data-unread"), "false");
    assert.equal(sams.querySelector("[data-unread-dot]"), null);
    assert.match(sams.textContent ?? "", /You: Nice pull/);
    assert.ok(adas.querySelector("time"));
    assert.equal(adas.getAttribute("href"), "/messages/adacards");
  });

  it("filters threads from the search bar", () => {
    inbox(messages);
    const search = document.querySelector<HTMLInputElement>("input[type=search]");
    assert.equal(search?.getAttribute("aria-label"), "Search messages");
    type(search, "box");
    const rows = [...document.querySelectorAll("[data-conversation]")];
    assert.equal(rows.length, 1);
    assert.match(rows[0].textContent ?? "", /Sam Ortiz/);
    type(search, "zzz");
    assert.match(document.body.textContent ?? "", /No conversations match/);
  });

  it("shows a tiny card thumbnail when the last message shares a card", () => {
    inbox([dm("1", "ada", "me", 0, { content: "", kind: "card_preview", cardPreview: { cardId: "card-1" } })]);
    const row = document.querySelector("[data-conversation]");
    assert.match(row?.textContent ?? "", /Sent a card/);
    const thumb = row?.querySelector("[data-inbox-thumb] img");
    assert.equal(thumb?.getAttribute("src"), "https://example.com/love.jpg");
    assert.equal(thumb?.getAttribute("loading"), "lazy");
  });

  it("opens New message with people you follow first, and searches everyone", () => {
    inbox(messages, [sam]);
    const button = document.querySelector("button[aria-label='New message']");
    assert.match(button?.className ?? "", /bg-violet-600/);
    click(button);
    const dialog = document.querySelector("[role=dialog]");
    assert.ok(dialog);
    assert.equal(dialog.getAttribute("aria-modal"), "true");
    const links = [...dialog.querySelectorAll("a")].map((link) => link.getAttribute("href"));
    assert.deepEqual(links, ["/messages/leeslabs", "/messages/boxbreak"]);
    type(dialog.querySelector<HTMLInputElement>("input"), "ada");
    assert.deepEqual(
      [...dialog.querySelectorAll("a")].map((link) => link.getAttribute("href")),
      ["/messages/adacards"],
    );
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    assert.equal(document.querySelector("[role=dialog]"), null);
  });

  it("greets an empty inbox with art, Start a conversation, and collectors to message", () => {
    inbox([], [sam, ada]);
    const empty = document.querySelector("[data-inbox-empty]");
    assert.ok(empty);
    assert.ok(empty.querySelector("svg[aria-hidden='true']"), "brand-shape art");
    const start = [...empty.querySelectorAll("button")].find((b) => b.textContent === "Start a conversation");
    assert.ok(start);
    assert.deepEqual(
      [...empty.querySelectorAll("a[aria-label^='Message']")].map((link) => link.getAttribute("href")),
      ["/messages/boxbreak", "/messages/adacards"],
    );
    assert.equal(document.querySelector("input[type=search]"), null, "no search with nothing to search");
    click(start);
    assert.ok(document.querySelector("[role=dialog]"));
  });
});

describe("conversation", () => {
  it("draws my bubbles in the purple gradient and theirs on a neutral surface", () => {
    thread([dm("1", "ada", "me", 0), dm("2", "me", "ada", 1)]);
    const mine = document.querySelector("[data-bubble='mine']");
    const theirs = document.querySelector("[data-bubble='theirs']");
    assert.match(mine?.className ?? "", /from-\[#7C3AED\]/);
    assert.match(mine?.className ?? "", /to-\[#5B21B6\]/);
    assert.doesNotMatch(theirs?.className ?? "", /7C3AED/);
    assert.match(theirs?.className ?? "", /bg-zinc-200/);
  });

  it("groups back-to-back bubbles and gives only the last one a tail", () => {
    thread([dm("1", "ada", "me", 0), dm("2", "ada", "me", 1), dm("3", "ada", "me", 2)]);
    const bubbles = [...document.querySelectorAll("[data-bubble]")];
    assert.equal(bubbles.length, 3);
    assert.deepEqual(
      bubbles.map((bubble) => Boolean(bubble.querySelector("[data-tail]"))),
      [false, false, true],
    );
  });

  it("puts the time between long gaps, and shows the exact time when a bubble is tapped", () => {
    thread([dm("1", "ada", "me", 0), dm("2", "ada", "me", 120)]);
    assert.equal(document.querySelectorAll("[data-thread-time]").length, 2);
    assert.equal(document.querySelector("[data-bubble-time]"), null);
    const bubble = document.querySelector("[data-bubble] [role=button]");
    assert.equal(bubble?.getAttribute("aria-expanded"), "false");
    click(bubble);
    assert.equal(bubble?.getAttribute("aria-expanded"), "true");
    assert.ok(document.querySelector("[data-bubble-time]"));
  });

  it("says Seen under my last message once they've read it", () => {
    thread([dm("1", "ada", "me", 0), dm("2", "me", "ada", 1, { read: true })]);
    assert.equal(document.querySelector("[data-seen]")?.textContent, "Seen");
    thread([dm("1", "ada", "me", 0), dm("2", "me", "ada", 1)]);
    assert.equal(document.querySelector("[data-seen]"), null);
  });

  it("renders shared cards and posts as rich mini cards that open them", () => {
    thread([
      dm("1", "ada", "me", 0, { content: "", kind: "card_preview", cardPreview: { cardId: "card-1" } }),
      dm("2", "ada", "me", 1, { content: "see https://slabhold.app/posts/post-9 and https://slabhold.app/u/adacards/cards/card-1" }),
    ]);
    const cards = [...document.querySelectorAll("[data-shared-card]")];
    assert.ok(cards.length >= 2, "offer preview and the linked card");
    for (const card of cards) {
      assert.equal(card.getAttribute("href"), "/u/adacards/cards/card-1");
      assert.match(card.textContent ?? "", /Jordan Love/);
      assert.match(card.textContent ?? "", /2020 Select/);
      assert.match(card.textContent ?? "", /PSA 10/);
    }
    const post = document.querySelector("[data-shared-post]");
    assert.equal(post?.getAttribute("href"), "/posts/post-9");
    assert.match(post?.textContent ?? "", /Sam Ortiz/);
    assert.match(post?.textContent ?? "", /Pulled this Wemby/);
  });

  it("keeps Send disabled until there's text, as a purple icon button", () => {
    thread([dm("1", "ada", "me", 0)]);
    const send = document.querySelector<HTMLButtonElement>("button[aria-label='Send']");
    assert.ok(send);
    assert.equal(send.disabled, true);
    assert.match(send.className, /bg-violet-600/);
    assert.match(send.className, /h-11/);
    type(document.querySelector("textarea"), "   ");
    assert.equal(send.disabled, true);
    type(document.querySelector("textarea"), "On my way");
    assert.equal(send.disabled, false);
  });

  it("gives a new conversation a friendly first-message hint", () => {
    thread([], "boxbreak");
    const hint = document.querySelector("[data-thread-hint]");
    assert.ok(hint);
    assert.match(hint.textContent ?? "", /Sam Ortiz/);
    assert.match(hint.textContent ?? "", /Say hi/);
  });

  it("animates only bubbles that arrive after the thread opens", () => {
    thread([dm("1", "ada", "me", 0)]);
    assert.doesNotMatch(document.querySelector("[data-bubble]")?.parentElement?.className ?? "", /bubble-in/);
    thread([dm("1", "ada", "me", 0), dm("2", "me", "ada", 1)]);
    const rows = [...document.querySelectorAll("[data-message-row]")];
    assert.doesNotMatch(rows[0].className, /bubble-in/);
    assert.match(rows[1].className, /motion-safe:animate-\[bubble-in/);
  });

  it("keeps block, report and deal controls exactly where they were", () => {
    const source = readFileSync(join(process.cwd(), "components/message-thread.tsx"), "utf8");
    assert.match(source, /You've blocked @/);
    assert.match(source, /You can't message @/);
    assert.match(source, /DealThreadPanel/);
    assert.match(source, /offerCardForThread\(/);
  });
});

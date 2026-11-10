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
import { MessageThread } from "@/components/message-thread";
import { SocialContext } from "@/components/social-provider";
import type { Profile, PublicCard } from "@/lib/social/types";

const { win } = dom;

type Provider = { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: Provider;
};
const { PathnameContext, SearchParamsContext } = require(
  "next/dist/shared/lib/hooks-client-context.shared-runtime",
) as { PathnameContext: Provider; SearchParamsContext: Provider };

globalThis.fetch = (async () => new Response("{}", { status: 404 })) as typeof fetch;

const replaced: string[] = [];
const router = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  // The URL does not change here, so the thread must detach the card on its own.
  replace: (href: string) => replaced.push(href),
  prefetch() {},
};

let root: Root | null = null;

beforeEach(() => {
  if (root) act(() => root!.unmount());
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  replaced.length = 0;
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

const card = {
  id: "card-1",
  ownerId: maya.id,
  playerName: "Victor Wembanyama",
  year: 2023,
  setBrand: "Prizm",
  cardNumber: "136",
  sport: "Basketball",
  photoDataUrl: null,
  accent: "#7c5cff",
  estimatedSellPrice: 0,
  openToOffers: true,
} as PublicCard;

type Sent = { to: string; text: string; attachment: unknown };

function social(sendMessage: (to: string, text: string, attachment: unknown) => Promise<{ error?: string }>) {
  const base: Record<string, unknown> = {
    ready: true,
    mode: "local",
    user: sam,
    profiles: [sam, maya],
    posts: [],
    messages: [],
    follows: [],
    blockedIds: [],
    mutedIds: [],
    safetyAccounts: [],
    publicCards: [card],
    commentsFor: () => [],
    findPost: () => undefined,
    profilesReady: () => true,
    profilesFailed: () => false,
    requestProfiles: () => {},
    requestPublicCards: () => {},
    publicCardsReady: () => true,
    publicCardsFailed: () => false,
    threadMore: () => false,
    loadThreadMessages: async () => {},
    markThreadRead: () => {},
    refreshInbox: async () => [],
    sendMessage,
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

function mount(value: unknown, search: string) {
  act(() =>
    root!.render(
      createElement(
        AppRouterContext.Provider,
        { value: router },
        createElement(
          PathnameContext.Provider,
          { value: "/messages/maya" },
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
                  { value: { cards: [], ready: true, syncError: null, reload() {} } as never },
                  createElement(MessageThread, { username: "maya" }),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

function field() {
  return document.querySelector<HTMLTextAreaElement>("textarea[aria-label='Message Maya']");
}

function type(value: string) {
  const input = field();
  assert.ok(input, "message box");
  act(() => {
    Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, "value")!.set!.call(input, value);
    const key = Object.keys(input).find((name) => name.startsWith("__reactProps"));
    const props = key ? (input as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
    props?.onChange?.({ target: input, currentTarget: input });
  });
}

async function submit() {
  const form = document.querySelector("form");
  assert.ok(form, "composer form");
  await act(async () => {
    form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function cardInComposer() {
  return document.querySelector("form button[aria-label='Remove card']");
}

describe("DM card attachment", () => {
  it("sends the card once, then the next message is text only", async () => {
    const sent: Sent[] = [];
    mount(
      social(async (to, text, attachment) => {
        sent.push({ to, text, attachment });
        return {};
      }),
      "card=card-1",
    );
    assert.ok(cardInComposer(), "card attached before sending");
    type("Still have this one?");
    await submit();
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].attachment, { cardId: "card-1" });
    assert.equal(Boolean(cardInComposer()), false, "preview gone after a successful send");
    assert.deepEqual(replaced, ["/messages/maya"], "?card= dropped from the URL");

    type("Any trades?");
    await submit();
    assert.equal(sent.length, 2);
    assert.equal(sent[1].attachment, null, "second message carries no card");
  });

  it("sends a card-only message once, then clears it", async () => {
    const sent: Sent[] = [];
    mount(
      social(async (to, text, attachment) => {
        sent.push({ to, text, attachment });
        return {};
      }),
      "card=card-1",
    );
    await submit();
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].attachment, { cardId: "card-1" });
    assert.equal(Boolean(cardInComposer()), false);
    const send = document.querySelector<HTMLButtonElement>("button[aria-label='Send']");
    assert.equal(send?.disabled, true, "nothing left to send");
  });

  it("keeps ?post= when dropping the sent card from the URL", async () => {
    mount(
      social(async () => ({})),
      "card=card-1&post=11111111-2222-4333-8444-555555555555",
    );
    await submit();
    assert.deepEqual(replaced, ["/messages/maya?post=11111111-2222-4333-8444-555555555555"]);
  });

  it("keeps the text and the card when the send fails", async () => {
    const sent: Sent[] = [];
    let fail = true;
    mount(
      social(async (to, text, attachment) => {
        sent.push({ to, text, attachment });
        return fail ? { error: "Couldn't send." } : {};
      }),
      "card=card-1",
    );
    type("Still have this one?");
    await submit();
    assert.equal(sent.length, 1);
    assert.equal(field()?.value, "Still have this one?", "text restored");
    assert.ok(cardInComposer(), "card still attached");
    assert.deepEqual(replaced, [], "URL untouched");

    fail = false;
    await submit();
    assert.equal(sent.length, 2);
    assert.deepEqual(sent[1].attachment, { cardId: "card-1" }, "retry still sends the card");
  });
});

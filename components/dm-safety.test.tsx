import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installDom } from "@/lib/test/dom";
import { MessageThread } from "@/components/message-thread";
import { CollectionContext } from "@/components/collection-provider";
import { SocialContext } from "@/components/social-provider";
import type { Profile } from "@/lib/social/types";

installDom();

type Provider = { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: Provider;
};
const { PathnameContext, SearchParamsContext } = require(
  "next/dist/shared/lib/hooks-client-context.shared-runtime",
) as { PathnameContext: Provider; SearchParamsContext: Provider };

const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };

function person(id: string, username: string, displayName: string): Profile {
  return {
    id,
    username,
    displayName,
    bio: "",
    avatarDataUrl: null,
    accent: "#7c5cff",
    createdAt: "2026-01-01T00:00:00Z",
  } as Profile;
}

const sam = person("user-sam", "sam", "Sam");
const maya = person("user-maya", "maya", "Maya");

function social(overrides: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = {
    ready: true,
    mode: "supabase",
    user: sam,
    profiles: [sam, maya],
    messages: [],
    blockedIds: [],
    mutedIds: [],
    safetyAccounts: [],
    publicCards: [],
    profilesReady: () => true,
    profilesFailed: () => false,
    requestProfiles: () => {},
    requestPublicCards: () => {},
    publicCardsReady: () => true,
    publicCardsFailed: () => false,
    threadMore: () => false,
    loadThreadMessages: async () => {},
    markThreadRead: () => {},
    refreshInbox: async () => {},
    sendMessage: async () => ({}),
    applySafetyChange: () => {},
    refresh: async () => {},
    ...overrides,
  };
  base.profileByUsername = (name: string) =>
    (base.profiles as Profile[]).find((profile) => profile.username === name.trim().toLowerCase());
  return new Proxy(base, {
    // Anything else a child asks for reads as an inert function.
    get: (target, key: string) => (key in target ? target[key] : () => undefined),
  });
}

function thread(username: string, value = social()) {
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: router },
      createElement(
        PathnameContext.Provider,
        { value: `/messages/${username}` },
        createElement(
          SearchParamsContext.Provider,
          { value: new URLSearchParams() },
          createElement(
            SocialContext.Provider,
            { value: value as never },
            createElement(
              CollectionContext.Provider,
              { value: { cards: [], ready: true, syncError: null } as never },
              createElement(MessageThread, { username }),
            ),
          ),
        ),
      ),
    ),
  );
}

function headerRow(markup: string): string {
  const start = markup.indexOf('aria-label="Back to messages"');
  assert.ok(start > 0, "thread header renders");
  return markup.slice(start, markup.indexOf("</div>", markup.indexOf("Mark sold", start)) + 400);
}

describe("DM thread safety menu", () => {
  it("puts report, mute and block for the partner in the thread header", () => {
    const markup = thread("maya");
    const header = headerRow(markup);
    assert.match(header, /@maya/);
    assert.match(header, /aria-label="More"[^>]*aria-haspopup="menu"/);
    assert.ok(
      header.indexOf('aria-label="More"') > header.indexOf("Mark sold"),
      "the menu sits after Mark sold",
    );
  });

  it("uses a user report for the partner", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(`${process.cwd()}/components/message-thread.tsx`, "utf8");
    assert.match(
      source,
      /<SafetyMenu\s+targetType="user"\s+targetId=\{partner\.id\}\s+reportedUserId=\{partner\.id\}\s+username=\{partner\.username\}\s+\/>/,
    );
  });

  it("shows no menu on your own thread", () => {
    const markup = thread("sam");
    assert.doesNotMatch(markup, /aria-label="More"/);
    assert.match(markup, /That conversation isn(&#x27;|')t available/);
  });

  it("shows no menu when signed out", () => {
    const markup = thread("maya", social({ user: null }));
    assert.doesNotMatch(markup, /aria-label="More"/);
  });

  it("lands on the blocked state once the partner is blocked", () => {
    // After Block, applySafetyChange moves the partner from profiles to safetyAccounts.
    const markup = thread(
      "maya",
      social({ profiles: [sam], blockedIds: [maya.id], safetyAccounts: [maya] }),
    );
    assert.match(markup, /You(&#x27;|')ve blocked @maya/);
    assert.doesNotMatch(markup, /aria-label="More"/);
  });
});

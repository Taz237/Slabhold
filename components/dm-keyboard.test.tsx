import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { installDom } from "@/lib/test/dom";
import { CollectionContext } from "@/components/collection-provider";
import { SocialContext } from "@/components/social-provider";
import { threadHeight } from "@/lib/ui/thread-height";
import type { Profile } from "@/lib/social/types";

const { win } = installDom();

type Provider = { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as { AppRouterContext: Provider };
const { PathnameContext, SearchParamsContext } = require("next/dist/shared/lib/hooks-client-context.shared-runtime") as {
  PathnameContext: Provider;
  SearchParamsContext: Provider;
};
const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };

function person(id: string, username: string): Profile {
  return { id, username, displayName: username, bio: "", avatarDataUrl: null, accent: "#7c5cff", createdAt: "2026-01-01T00:00:00Z" } as Profile;
}
const sam = person("user-sam", "sam");
const maya = person("user-maya", "maya");

function social() {
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
    threadMore: () => false,
    loadThreadMessages: async () => {},
    refreshInbox: async () => {},
    sendMessage: async () => ({}),
    refresh: async () => {},
    profileByUsername: (name: string) => [sam, maya].find((profile) => profile.username === name),
  };
  return new Proxy(base, { get: (target, key: string) => (key in target ? target[key] : () => undefined) });
}

describe("DM thread and the keyboard", () => {
  it("is the usual height with the keyboard closed", () => {
    assert.equal(threadHeight(0), "calc(100dvh - 3.5rem - 6.15rem - env(safe-area-inset-top) - env(safe-area-inset-bottom))");
  });

  it("ends right at the keyboard's top edge when it opens, so the composer stays in view", () => {
    assert.equal(
      threadHeight(336),
      "calc(100dvh - 3.5rem - env(safe-area-inset-top) - max(336px, 6.15rem + env(safe-area-inset-bottom)))",
    );
  });

  it("follows the iOS app's keyboard events, like the post composer", async () => {
    const { MessageThread } = await import("@/components/message-thread");
    const { createRoot } = await import("react-dom/client");
    const host = win.document.createElement("div");
    win.document.body.append(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        createElement(
          AppRouterContext.Provider,
          { value: router },
          createElement(
            PathnameContext.Provider,
            { value: "/messages/maya" },
            createElement(
              SearchParamsContext.Provider,
              { value: new URLSearchParams() },
              createElement(
                SocialContext.Provider,
                { value: social() as never },
                createElement(
                  CollectionContext.Provider,
                  { value: { ready: true, cards: [], syncError: null } as never },
                  createElement(MessageThread, { username: "maya" }),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    const frame = () => host.querySelector<HTMLElement>("[data-dm-thread]");
    assert.ok(frame(), "the thread frame");
    assert.equal(frame()!.dataset.keyboardInset, "0");
    await act(async () => {
      const event = Object.assign(new win.Event("keyboardWillShow"), { keyboardHeight: 336 });
      win.dispatchEvent(event);
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    assert.equal(frame()!.dataset.keyboardInset, "336");
    await act(async () => {
      win.dispatchEvent(new win.Event("keyboardWillHide"));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    assert.equal(frame()!.dataset.keyboardInset, "0");
    act(() => root.unmount());
  });
});

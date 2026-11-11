import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installDom } from "@/lib/test/dom";
import { AppShell } from "@/components/app-shell";
import { CollectionContext } from "@/components/collection-provider";
import { SocialContext } from "@/components/social-provider";
import { StartupError, StartupNotice } from "@/components/startup-error";
import { STARTUP_DETAIL, STARTUP_TITLE } from "@/lib/startup/boot";

const { win } = installDom();

const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};
const { PathnameContext } = require("next/dist/shared/lib/hooks-client-context.shared-runtime") as {
  PathnameContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};

const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };

function shell(pathname: string, social: Record<string, unknown>) {
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: router },
      createElement(
        PathnameContext.Provider,
        { value: pathname },
        createElement(
          SocialContext.Provider,
          {
            value: {
              ready: false,
              mode: "local",
              user: null,
              status: null,
              unreadCount: 0,
              unreadMessageCount: 0,
              startupFailed: false,
              retryStartup() {},
              ...social,
            } as never,
          },
          createElement(
            CollectionContext.Provider,
            { value: { cards: [], ready: true, syncError: null } as never },
            createElement(AppShell, null, createElement("p", null, "page body")),
          ),
        ),
      ),
    ),
  ).replace(/&#x27;/g, "'");
}

describe("cold start that never finishes", () => {
  it("an account page shows the designed error instead of a blank screen", () => {
    const blank = shell("/settings", {});
    assert.doesNotMatch(blank, new RegExp(STARTUP_TITLE));
    const failed = shell("/settings", { startupFailed: true });
    assert.match(failed, new RegExp(STARTUP_TITLE));
    assert.match(failed, /Try again/);
  });

  it("sign in shows the error too, not a blank page", () => {
    assert.match(shell("/login", { startupFailed: true }), new RegExp(STARTUP_TITLE));
  });

  it("a public page keeps its content and adds a notice with Try again", () => {
    const markup = shell("/leaderboard", { startupFailed: true });
    assert.match(markup, /page body/);
    assert.match(markup, /Try again/);
    assert.match(markup, /role="status"/);
  });

  it("never names the backend vendor", () => {
    const markup = shell("/settings", { startupFailed: true }) + shell("/leaderboard", { startupFailed: true });
    assert.doesNotMatch(markup, /supabase/i);
    assert.doesNotMatch(STARTUP_DETAIL, /supabase/i);
  });
});

describe("StartupError", () => {
  async function render(element: ReturnType<typeof createElement>) {
    const { createRoot } = await import("react-dom/client");
    const host = win.document.createElement("div");
    win.document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(element));
    return { host, unmount: () => act(() => root.unmount()) };
  }

  it("Try again calls retry once and says it is trying", async () => {
    let calls = 0;
    const view = await render(createElement(StartupError, { onRetry: () => void calls++ }));
    const button = view.host.querySelector("button");
    assert.ok(button);
    assert.equal(button.textContent, "Try again");
    await act(async () => button.click());
    await act(async () => button.click());
    assert.equal(calls, 1);
    assert.equal(button.textContent, "Trying again…");
    assert.equal(button.disabled, true);
    assert.ok(view.host.querySelector("h1"));
    view.unmount();
  });

  it("the notice's Try again is a 44px target", async () => {
    const view = await render(createElement(StartupNotice, { onRetry() {} }));
    const button = view.host.querySelector("button");
    assert.ok(button);
    assert.match(button.className, /min-h-11/);
    view.unmount();
  });
});

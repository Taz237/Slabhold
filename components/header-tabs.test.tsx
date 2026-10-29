import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installDom } from "@/lib/test/dom";
import { AppShell } from "@/components/app-shell";
import { CollectionContext } from "@/components/collection-provider";
import { SocialContext } from "@/components/social-provider";
import { LANE_TABS_TOP, LaneTabs, NewPostsPill } from "@/components/timeline-ui";
import type { Profile } from "@/lib/social/types";

installDom();

const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};
const { PathnameContext } = require("next/dist/shared/lib/hooks-client-context.shared-runtime") as {
  PathnameContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};

const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };
const sam = {
  id: "user-sam",
  username: "sam",
  displayName: "Sam",
  bio: "",
  avatarDataUrl: null,
  accent: "#7c5cff",
  createdAt: "2026-01-01T00:00:00Z",
} as Profile;

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function shell(pathname: string) {
  const social = {
    ready: true,
    mode: "supabase" as const,
    user: sam,
    status: null,
    unreadCount: 0,
    unreadMessageCount: 0,
    signOut: async () => {},
    followerCount: () => 0,
    followingCount: () => 0,
  };
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: router },
      createElement(
        PathnameContext.Provider,
        { value: pathname },
        createElement(
          SocialContext.Provider,
          { value: social as never },
          createElement(
            CollectionContext.Provider,
            { value: { cards: [], ready: true, syncError: null } as never },
            createElement(AppShell, null, createElement("p", null, "page")),
          ),
        ),
      ),
    ),
  );
}

function headerTag(markup: string): string {
  return /<header[^>]*>/.exec(markup)?.[0] ?? "";
}

describe("Header and Home tabs are one sticky unit", () => {
  it("defines the header height once, with the shared chrome background", () => {
    const css = source("app/globals.css");
    assert.match(css, /--app-header-h: calc\(env\(safe-area-inset-top\) \+ 3\.25rem\)/);
    assert.match(css, /--chrome-bg: color-mix\(in oklab, var\(--background\) 82%, transparent\)/);
  });

  it("gives the header row a fixed 52px height and draws its hairline as a shadow", () => {
    const markup = shell("/notifications");
    const header = headerTag(markup);
    assert.match(header, /bg-\[var\(--chrome-bg\)\]/);
    assert.match(header, /backdrop-blur-xl/);
    assert.match(header, /shadow-\[inset_0_-1px_0/);
    assert.doesNotMatch(header, /border-b/);
    const row = /<header[^>]*><div class="([^"]*)"/.exec(markup)?.[1] ?? "";
    assert.match(row, /h-\[3\.25rem\]/);
    assert.match(row, /items-center/);
    assert.doesNotMatch(row, /\bpy-1\b/);
  });

  it("drops the header hairline on Home, where the tabs carry it", () => {
    const header = headerTag(shell("/"));
    assert.match(header, /data-attached-tabs=""/);
    assert.doesNotMatch(header, /border|shadow-\[inset/);
    assert.match(header, /bg-\[var\(--chrome-bg\)\]/);
  });

  it("sticks the tabs at the header's height, with the same background", () => {
    assert.equal(LANE_TABS_TOP, "top-[var(--app-header-h)]");
    const tabs = renderToStaticMarkup(createElement(LaneTabs, { lane: "foryou", onChange: () => {} }));
    assert.match(tabs, /class="sticky top-\[var\(--app-header-h\)\]/);
    assert.match(tabs, /bg-\[var\(--chrome-bg\)\] backdrop-blur-xl backdrop-saturate-150/);
    assert.match(tabs, /data-no-pull=""/);
    assert.match(tabs, /border-b/);
    assert.doesNotMatch(tabs, /3\.8125rem|color-mix\(in_oklab/);
    const pill = renderToStaticMarkup(createElement(NewPostsPill, { onClick: () => {} }));
    assert.match(pill, /sticky top-\[var\(--app-header-h\)\]/);
  });

  it("keeps the tabs out of the pull-to-refresh content, so a pull moves only the feed", () => {
    const feed = source("components/feed-view.tsx");
    const ready = feed.slice(feed.indexOf("if (!ready)"));
    const main = ready.slice(ready.indexOf("  return (\n    <div"));
    const tabs = main.indexOf("<LaneTabs");
    const pull = main.indexOf("<PullToRefresh");
    const pullEnd = main.indexOf("</PullToRefresh>");
    assert.ok(tabs > 0 && pull > tabs, "LaneTabs renders before PullToRefresh");
    assert.ok(main.indexOf("laneStartRef") < tabs);
    assert.ok(main.indexOf("<NewPostsPill") > pull && main.indexOf("<NewPostsPill") < pullEnd);
    assert.ok(main.indexOf("movingToday ??") > pull);
    assert.match(main, /<div className="-mx-4 -mt-5">/);
  });

  it("sticks Search's bar flush under the header too", () => {
    for (const path of ["components/search-view.tsx", "app/search/page.tsx"]) {
      const text = source(path);
      assert.match(text, /sticky top-\[var\(--app-header-h\)\]/, path);
      assert.doesNotMatch(text, /top-\[3\.6rem\]/, path);
    }
  });
});

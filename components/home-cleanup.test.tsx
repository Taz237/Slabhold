import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, afterEach, before, describe, it } from "node:test";
import { act, createElement, type ComponentType, type ReactNode } from "react";
import { installDom } from "@/lib/test/dom";
import type { Post, Profile } from "@/lib/social/types";

installDom();
// Trending's cached read stays pending, so its slot holds the skeleton.
// Any other read the Home tree makes is recorded; there should be none for the movers.
const fetched: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  configurable: true,
  writable: true,
  value: (url: unknown) => {
    fetched.push(String(url));
    return new Promise<Response>(() => {});
  },
});

const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};
const { PathnameContext, SearchParamsContext } = require(
  "next/dist/shared/lib/hooks-client-context.shared-runtime",
) as {
  PathnameContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
  SearchParamsContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};

const router = { back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch() {} };

// Fixture viewer and post. Never real users' data.
const sam = {
  id: "user-sam",
  username: "sam",
  displayName: "Sam",
  bio: "",
  avatarDataUrl: null,
  accent: "#7c5cff",
  createdAt: "2026-01-01T00:00:00Z",
} as Profile;

const post: Post = {
  id: "post-fixture-1",
  authorId: sam.id,
  body: "Fixture pickup post for the Home cleanup test",
  imageDataUrl: null,
  card: null,
  quotedPostId: null,
  createdAt: "2026-11-01T12:00:00Z",
};

type Mods = {
  HomeFeed: ComponentType<{ seed?: null }>;
  AccountMenu: ComponentType<{ user: Profile | null; showLogin: boolean }>;
  SocialContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
  CollectionContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};
let mods: Mods;

const saved = process.env.NEXT_PUBLIC_QUICK_COMP;

function setFlag(on: boolean) {
  if (on) process.env.NEXT_PUBLIC_QUICK_COMP = "1";
  else delete process.env.NEXT_PUBLIC_QUICK_COMP;
}

/** Signed-in Home with one fixture post. Anything Home asks for that isn't listed is empty. */
function homeSocial() {
  const item = { kind: "post", key: `post:${post.id}`, post, author: sam };
  const known: Record<string, unknown> = {
    ready: true,
    mode: "local" as const,
    user: sam,
    status: null,
    unreadCount: 0,
    unreadMessageCount: 0,
    signOut: async () => {},
    followerCount: () => 0,
    followingCount: () => 0,
    hasFullSnapshot: true,
    loadingPostId: null,
    profiles: [sam],
    posts: [post],
    homePosts: [post],
    homeReposts: [],
    reposts: [],
    feed: [item],
    follows: [],
    suggestions: [],
    suggestionsReady: true,
    notifications: [],
    messages: [],
    publicCards: [],
    removedPostIds: new Set<string>(),
    blockedIds: [],
    mutedIds: [],
    postCardValuesMessage: null,
    inboxMore: { notifications: false, messages: false },
    refresh: async () => [],
    commentsFor: () => [],
    findPost: () => null,
    likeCount: () => 0,
    repostCount: () => 0,
    quoteCount: () => 0,
  };
  return new Proxy(known, {
    get(target, key: string) {
      if (key in target) return target[key];
      return () => (/Ready$|^is/.test(key) ? true : undefined);
    },
  });
}

function providers(pathname: string, child: ReactNode) {
  return createElement(
    AppRouterContext.Provider,
    { value: router },
    createElement(
      PathnameContext.Provider,
      { value: pathname },
      createElement(
        SearchParamsContext.Provider,
        { value: new URLSearchParams() },
        createElement(
          mods.SocialContext.Provider,
          { value: homeSocial() },
          createElement(mods.CollectionContext.Provider, { value: { cards: [], ready: true, syncError: null } }, child),
        ),
      ),
    ),
  );
}

async function mountHome() {
  const { createRoot } = await import("react-dom/client");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(providers("/", createElement(mods.HomeFeed, {})));
  });
  // Home keeps the last lane for the session, so start each mount on For you.
  await act(async () => {
    host.querySelector<HTMLButtonElement>("#lane-tab-foryou")?.click();
  });
  return {
    host,
    async following() {
      await act(async () => {
        host.querySelector<HTMLButtonElement>("#lane-tab-following")?.click();
      });
    },
    done() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

/** The timeline area under the lane tabs, without the tab labels. */
function timelineText(host: HTMLElement): string {
  const tabs = host.querySelector('[role="tablist"]');
  const text = host.textContent ?? "";
  return tabs ? text.replace(tabs.textContent ?? "", "") : text;
}

function assertNoRows(host: HTMLElement, lane: string) {
  const text = timelineText(host);
  for (const row of ["Moving", "Leaderboard", "Quick Comp"]) {
    assert.equal(text.includes(row), false, `${lane} has no ${row} row`);
  }
  assert.equal(host.querySelector('a[href="/comp"]'), null, lane);
  assert.equal(host.querySelector('a[href="/moving-today"]'), null, lane);
  assert.equal(host.querySelector('a[href="/leaderboard"]'), null, lane);
}

/** Home markup for a lane, minus React's per-mount ids. */
async function homeMarkup(flag: boolean): Promise<{ foryou: string; following: string }> {
  setFlag(flag);
  const home = await mountHome();
  try {
    const strip = (html: string) => html.replace(/_r_[0-9a-z]+_|«r[0-9a-z]+»|:r[0-9a-z]+:/g, "id");
    const foryou = strip(home.host.innerHTML);
    await home.following();
    return { foryou, following: strip(home.host.innerHTML) };
  } finally {
    home.done();
  }
}

async function drawerRows(): Promise<{ rows: HTMLElement[]; done: () => void }> {
  const { createRoot } = await import("react-dom/client");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(providers("/", createElement(mods.AccountMenu, { user: sam, showLogin: false })));
  });
  await act(async () => {
    document.querySelector<HTMLButtonElement>('button[aria-label="Open menu"]')?.click();
  });
  const nav = document.querySelector<HTMLElement>('[role="dialog"] nav[aria-label="Menu"]');
  assert.ok(nav, "drawer main list");
  return {
    rows: [...nav.querySelectorAll<HTMLElement>("li > a, li > button")],
    done() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function label(row: HTMLElement): string {
  return row.textContent?.trim() ?? "";
}

before(async () => {
  const [home, menu, socialMod, collection] = await Promise.all([
    import("@/components/home-feed"),
    import("@/components/side-menu"),
    import("@/components/social-provider"),
    import("@/components/collection-provider"),
  ]);
  mods = {
    HomeFeed: home.HomeFeed as never,
    AccountMenu: menu.AccountMenu,
    SocialContext: socialMod.SocialContext as never,
    CollectionContext: collection.CollectionContext as never,
  };
});

after(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_QUICK_COMP;
  else process.env.NEXT_PUBLIC_QUICK_COMP = saved;
});

afterEach(() => {
  document.documentElement.style.overflow = "";
});

describe("Home after the cleanup", () => {
  for (const flag of [false, true]) {
    it(`keeps Trending on For you and no Moving, Leaderboard or Quick Comp row (flag ${flag ? "on" : "off"})`, async () => {
      setFlag(flag);
      const home = await mountHome();
      try {
        assert.ok(
          home.host.querySelector("[data-trending-skeleton], [data-trending-now]"),
          "Trending slot on For you",
        );
        assertNoRows(home.host, "For you");
        assert.ok(home.host.querySelector('textarea[placeholder="What\'s happening?"]'), "composer on For you");
        assert.ok(home.host.textContent?.includes(post.body), "post on For you");

        await home.following();
        assert.equal(
          home.host.querySelector("[data-trending-skeleton], [data-trending-now]"),
          null,
          "no Trending on Following",
        );
        assertNoRows(home.host, "Following");
        assert.ok(home.host.querySelector('textarea[placeholder="What\'s happening?"]'), "composer on Following");
        assert.ok(home.host.textContent?.includes(post.body), "post on Following");
      } finally {
        home.done();
      }
    });
  }

  it("never asks for the movers", () => {
    assert.ok(fetched.length > 0, "Trending read happened");
    assert.equal(fetched.some((url) => url.includes("/api/moving-today")), false, fetched.join(", "));
  });

  it("draws the same Home markup with the flag unset and set", async () => {
    const off = await homeMarkup(false);
    const on = await homeMarkup(true);
    assert.equal(on.foryou, off.foryou);
    assert.equal(on.following, off.following);
  });
});

describe("Moving today in the drawer", () => {
  for (const flag of [false, true]) {
    it(`sits directly after Leaderboard (flag ${flag ? "on" : "off"})`, async () => {
      setFlag(flag);
      const drawer = await drawerRows();
      try {
        const labels = drawer.rows.map(label);
        const leaderboard = labels.indexOf("Leaderboard");
        assert.ok(leaderboard >= 0, labels.join(", "));
        const moving = drawer.rows[leaderboard + 1];
        assert.ok(moving);
        assert.equal(moving.tagName, "A");
        assert.equal(moving.getAttribute("href"), "/moving-today");
        assert.equal(label(moving), "Moving today");
        assert.equal(labels.filter((name) => name === "Moving today").length, 1);
        if (flag) {
          const quick = labels.indexOf("Quick Comp");
          assert.ok(quick >= 0, labels.join(", "));
          assert.equal(labels[quick + 1], "Add card");
        } else {
          assert.equal(labels.includes("Quick Comp"), false);
        }
      } finally {
        drawer.done();
      }
    });
  }
});

import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, afterEach, before, describe, it } from "node:test";
import { act, createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { installDom } from "@/lib/test/dom";
import type { Profile } from "@/lib/social/types";

installDom();

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
const sam = {
  id: "user-sam",
  username: "sam",
  displayName: "Sam",
  bio: "",
  avatarDataUrl: null,
  accent: "#7c5cff",
  createdAt: "2026-01-01T00:00:00Z",
} as Profile;

const TODAY_BAR = ["Home", "Catalog", "Scan", "Collection", "Messages"];
const TODAY_DRAWER = ["Profile", "Collection", "Messages", "Add card", "Leaderboard", "Invite a collector"];

type Mods = {
  AppShell: ComponentType<{ children: ReactNode }>;
  AccountMenu: ComponentType<{ user: Profile | null; showLogin: boolean }>;
  SocialContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
  CollectionContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};
let mods: Mods;

function social() {
  return {
    ready: true,
    mode: "local" as const,
    user: sam,
    status: null,
    unreadCount: 0,
    unreadMessageCount: 0,
    signOut: async () => {},
    followerCount: () => 0,
    followingCount: () => 0,
  };
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
          { value: social() },
          createElement(
            mods.CollectionContext.Provider,
            { value: { cards: [], ready: true, syncError: null } },
            child,
          ),
        ),
      ),
    ),
  );
}

/** The bottom bar's links, as a detached DOM tree. */
function bar(pathname: string): HTMLAnchorElement[] {
  const html = renderToStaticMarkup(providers(pathname, createElement(mods.AppShell, null, createElement("p", null, "page"))));
  const host = document.createElement("div");
  host.innerHTML = html;
  const nav = [...host.querySelectorAll("nav")].find((node) => node.getAttribute("style")?.includes("app-nav"));
  assert.ok(nav, "bottom bar");
  return [...nav.querySelectorAll("a")];
}

function tabLabel(link: HTMLAnchorElement): string {
  return link.getAttribute("aria-label") ?? link.textContent?.trim() ?? "";
}

async function drawerLabels(pathname = "/"): Promise<{ labels: string[]; links: HTMLAnchorElement[]; done: () => void }> {
  const { createRoot } = await import("react-dom/client");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(providers(pathname, createElement(mods.AccountMenu, { user: sam, showLogin: false })));
  });
  await act(async () => {
    document.querySelector<HTMLButtonElement>('button[aria-label="Open menu"]')?.click();
  });
  const panel = document.querySelector<HTMLElement>('[role="dialog"] nav[aria-label="Menu"]');
  assert.ok(panel, "drawer main list");
  const rows = [...panel.querySelectorAll<HTMLElement>("li > a, li > button")];
  return {
    labels: rows.map((row) => row.textContent?.trim() ?? ""),
    links: [...panel.querySelectorAll("a")],
    done() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

const saved = process.env.NEXT_PUBLIC_QUICK_COMP;

before(async () => {
  process.env.NEXT_PUBLIC_QUICK_COMP = "1";
  const [shell, menu, socialMod, collection] = await Promise.all([
    import("@/components/app-shell"),
    import("@/components/side-menu"),
    import("@/components/social-provider"),
    import("@/components/collection-provider"),
  ]);
  mods = {
    AppShell: shell.AppShell,
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

/** One Scan flow: Quick Comp's search is on the Scan screen, so the bar and drawer are the same with its flag on or off. */
for (const flag of ["1", undefined]) {
  describe(`the nav with Quick Comp's flag ${flag ? "on" : "unset"}`, () => {
    before(() => {
      if (flag) process.env.NEXT_PUBLIC_QUICK_COMP = flag;
      else delete process.env.NEXT_PUBLIC_QUICK_COMP;
    });

    it("the bar is Home, Catalog, Scan, Collection, Messages, with no /comp or /leaderboard tab", () => {
      for (const path of ["/", "/comp", "/leaderboard"]) {
        const links = bar(path);
        assert.deepEqual(links.map(tabLabel), TODAY_BAR, path);
        assert.equal(links.some((link) => ["/comp", "/leaderboard"].includes(link.getAttribute("href") ?? "")), false, path);
      }
      assert.equal(bar("/")[1]?.getAttribute("href"), "/catalog");
      // The Catalog feed is full screen, like TikTok: no tab bar over it.
      const catalog = renderToStaticMarkup(providers("/catalog", createElement(mods.AppShell, null, createElement("p", null, "page"))));
      assert.doesNotMatch(catalog, /app-nav/);
      assert.equal(bar("/leaderboard").some((link) => link.getAttribute("aria-current") === "page"), false);
    });

    it("the centre button is Scan: purple, straight to the Scan screen", () => {
      const scan = bar("/").find((link) => link.getAttribute("href") === "/scan");
      assert.ok(scan);
      assert.equal(scan.getAttribute("aria-label"), "Scan");
      assert.match(scan.innerHTML, /bg-violet-600/);
    });

    it("the drawer has no Catalog and no Quick Comp", async () => {
      const drawer = await drawerLabels();
      try {
        assert.deepEqual(drawer.labels, TODAY_DRAWER);
        assert.equal(document.querySelector('a[href="/comp"]'), null);
      } finally {
        drawer.done();
      }
    });
  });
}

/** Signed-in Home with nothing in the feed. Anything Home asks for that isn't listed is empty. */
function homeSocial() {
  const known: Record<string, unknown> = {
    ...social(),
    hasFullSnapshot: true,
    loadingPostId: null,
    profiles: [sam],
    posts: [],
    homePosts: [],
    homeReposts: [],
    reposts: [],
    feed: [],
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
  };
  return new Proxy(known, {
    get(target, key: string) {
      if (key in target) return target[key];
      return () => (/Ready$|^is/.test(key) ? true : undefined);
    },
  });
}

async function homeRows(entry: ReactNode): Promise<{ text: () => string; following: () => Promise<void>; done: () => void }> {
  const [{ FeedView }, { createRoot }] = await Promise.all([import("@/components/feed-view"), import("react-dom/client")]);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const tree = createElement(
    AppRouterContext.Provider,
    { value: router },
    createElement(
      PathnameContext.Provider,
      { value: "/" },
      createElement(
        SearchParamsContext.Provider,
        { value: new URLSearchParams() },
        createElement(
          mods.SocialContext.Provider,
          { value: homeSocial() },
          createElement(
            mods.CollectionContext.Provider,
            { value: { cards: [], ready: true, syncError: null } },
            createElement(FeedView as ComponentType<{ homeEntry?: ReactNode; movingToday?: ReactNode }>, {
              homeEntry: entry,
              movingToday: createElement("p", null, "Moving today slot"),
            }),
          ),
        ),
      ),
    ),
  );
  await act(async () => {
    root.render(tree);
  });
  return {
    text: () => host.textContent ?? "",
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

describe("Quick Comp Home entry on both tabs", () => {
  it("draws no Quick Comp row and no movers on either tab", async () => {
    const home = await homeRows(createElement("a", { href: "/comp" }, "Quick Comp"));
    try {
      const foryou = home.text();
      assert.equal(foryou.includes("Quick Comp"), false, "For you");
      assert.equal(foryou.includes("Moving today slot"), false, "For you");
      assert.equal(document.querySelector('a[href="/comp"]'), null);
      await home.following();
      const following = home.text();
      assert.equal(following.includes("Quick Comp"), false, "Following");
      assert.equal(following.includes("Moving today slot"), false, "Following");
      assert.equal(document.querySelector('a[href="/comp"]'), null);
    } finally {
      home.done();
    }
  });

  it("draws nothing extra without an entry", async () => {
    const home = await homeRows(null);
    try {
      assert.equal(home.text().includes("Quick Comp"), false);
      await home.following();
      assert.equal(document.querySelector('a[href="/comp"]'), null);
    } finally {
      home.done();
    }
  });
});

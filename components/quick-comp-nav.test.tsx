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

const TODAY_BAR = ["Home", "Leaderboard", "Add card", "Collection", "Messages"];
const TODAY_DRAWER = ["Profile", "Collection", "Messages", "Add card", "Leaderboard", "Moving today", "Invite a collector"];

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

describe("Quick Comp nav with the flag on", () => {
  before(() => {
    process.env.NEXT_PUBLIC_QUICK_COMP = "1";
  });

  it("puts Quick Comp in Leaderboard's slot on the bar", () => {
    const links = bar("/");
    assert.deepEqual(links.map(tabLabel), ["Home", "Quick Comp", "Add card", "Collection", "Messages"]);
    assert.equal(links[1]?.getAttribute("href"), "/comp");
    assert.equal(links.some((link) => link.getAttribute("href") === "/leaderboard"), false);
    assert.equal(links[1]?.getAttribute("aria-current"), null);
  });

  it("lights Quick Comp on /comp with the plain tab colours", () => {
    const links = bar("/comp");
    const quick = links.find((link) => link.getAttribute("href") === "/comp");
    assert.ok(quick);
    assert.equal(quick.getAttribute("aria-current"), "page");
    assert.match(quick.className, /text-zinc-900 dark:text-white/);
    assert.doesNotMatch(quick.innerHTML, /7C3AED|A78BFA|violet/);
    assert.equal(links.filter((link) => link.getAttribute("aria-current") === "page").length, 1);
  });

  it("keeps the centre Add card button as it is", () => {
    const add = bar("/").find((link) => link.getAttribute("href") === "/cards/new");
    assert.ok(add);
    assert.equal(add.getAttribute("aria-label"), "Add card");
    assert.match(add.innerHTML, /bg-violet-600/);
  });

  it("lights no tab on /leaderboard", () => {
    const links = bar("/leaderboard");
    assert.equal(links.some((link) => link.getAttribute("aria-current") === "page"), false);
  });

  it("puts Quick Comp right above Add card in the drawer and keeps Leaderboard", async () => {
    const drawer = await drawerLabels("/comp");
    try {
      const quick = drawer.labels.indexOf("Quick Comp");
      assert.ok(quick >= 0, drawer.labels.join(", "));
      assert.equal(drawer.labels[quick + 1], "Add card");
      assert.ok(drawer.labels.includes("Leaderboard"));
      const link = drawer.links.find((node) => node.getAttribute("href") === "/comp");
      assert.equal(link?.getAttribute("aria-current"), "page");
    } finally {
      drawer.done();
    }
  });
});

describe("Quick Comp nav with the flag unset", () => {
  before(() => {
    delete process.env.NEXT_PUBLIC_QUICK_COMP;
  });

  it("draws today's bar with no /comp link", () => {
    for (const path of ["/", "/comp", "/leaderboard"]) {
      const links = bar(path);
      assert.deepEqual(links.map(tabLabel), TODAY_BAR, path);
      assert.equal(links.some((link) => link.getAttribute("href") === "/comp"), false, path);
    }
    assert.equal(bar("/leaderboard")[1]?.getAttribute("aria-current"), "page");
  });

  it("draws today's drawer with no /comp link", async () => {
    const drawer = await drawerLabels();
    try {
      assert.deepEqual(drawer.labels, TODAY_DRAWER);
      assert.equal(document.querySelector('a[href="/comp"]'), null);
    } finally {
      drawer.done();
    }
  });
});

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
    const { QuickCompHomeLink } = await import("@/components/quick-comp-home-link");
    const home = await homeRows(createElement(QuickCompHomeLink));
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

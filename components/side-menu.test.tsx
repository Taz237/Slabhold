import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { after, afterEach, before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, type ComponentType, type ReactNode } from "react";
import { SocialContext } from "@/components/social-provider";
import { BOTTOM_NAV } from "@/lib/ui/bottom-nav";
import {
  MENU_OPEN_HREF,
  SIDE_MENU_ADMIN,
  SIDE_MENU_ITEMS,
  SIDE_MENU_SETTINGS,
  dragOffset,
  menuItemActive,
  menuQueryOpens,
  swipeCloses,
  TAKE_TOUR_LABEL,
  TOUR_AFTER_CLOSE_MS,
} from "@/lib/ui/side-menu";
import type { Profile } from "@/lib/social/types";

const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require(
  "next/dist/shared/lib/app-router-context.shared-runtime",
) as {
  AppRouterContext: {
    Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode;
  };
};
const { PathnameContext, SearchParamsContext } = require(
  "next/dist/shared/lib/hooks-client-context.shared-runtime",
) as {
  PathnameContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
  SearchParamsContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};

const replaced: string[] = [];
const router = {
  back() {},
  forward() {},
  refresh() {},
  hmrRefresh() {},
  push() {},
  replace(href: string) {
    replaced.push(href);
  },
  prefetch() {},
};

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3000/",
  pretendToBeVisual: true,
});
const win = dom.window;

function expose(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

expose("window", win);
expose("self", win);
expose("document", win.document);
expose("navigator", win.navigator);
expose("HTMLElement", win.HTMLElement);
expose("Node", win.Node);
expose("Element", win.Element);
expose("KeyboardEvent", win.KeyboardEvent);
expose("localStorage", win.localStorage);
expose("sessionStorage", win.sessionStorage);
expose("requestAnimationFrame", win.requestAnimationFrame.bind(win));
expose("cancelAnimationFrame", win.cancelAnimationFrame.bind(win));
expose("fetch", async (url: unknown) => {
  if (String(url) === "/api/badges") {
    return new Response(
      JSON.stringify({
        available: true,
        earnedCount: 9,
        total: 42,
        pinned: ["collector:gold", "streak:silver"],
        showBadges: true,
        reveal: null,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(null, { status: 404 });
});
expose("IS_REACT_ACT_ENVIRONMENT", true);

const maya: Profile = {
  id: "user-maya",
  username: "maya",
  displayName: "Maya Hunt",
  bio: "",
  avatarDataUrl: null,
  accent: "#7c5cff",
  createdAt: "2026-01-01T00:00:00Z",
} as Profile;

type MenuProps = { user: Profile | null; showLogin: boolean };
let AccountMenu: ComponentType<MenuProps>;

function social(unreadMessageCount = 0) {
  return {
    ready: true,
    mode: "supabase" as const,
    user: maya,
    status: null,
    unreadMessageCount,
    signOut: async () => {},
    followerCount: () => 12,
    followingCount: () => 34,
  };
}

function Harness({
  children,
  pathname = "/",
  search = "",
  unread = 0,
}: {
  children?: ReactNode;
  pathname?: string;
  search?: string;
  unread?: number;
}) {
  return createElement(
    AppRouterContext.Provider,
    { value: router },
    createElement(
      PathnameContext.Provider,
      { value: pathname },
      createElement(
        SearchParamsContext.Provider,
        { value: new URLSearchParams(search) },
        createElement(SocialContext.Provider, { value: social(unread) as never }, children),
      ),
    ),
  );
}

async function mount(props: MenuProps, options: { search?: string; unread?: number; pathname?: string } = {}) {
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(Harness, options, createElement(AccountMenu, props)));
  });
  return {
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function menuButton(): HTMLButtonElement {
  const button = win.document.querySelector<HTMLButtonElement>('button[aria-label="Open menu"]');
  assert.ok(button, "avatar button");
  return button;
}

function dialog(): HTMLElement {
  const panel = win.document.querySelector<HTMLElement>('[role="dialog"]');
  assert.ok(panel, "menu panel");
  return panel;
}

function isOpen(): boolean {
  const panel = dialog();
  const layer = panel.parentElement;
  assert.ok(layer);
  return menuButton().getAttribute("aria-expanded") === "true" && !layer.hasAttribute("inert");
}

async function openMenu() {
  await act(async () => {
    menuButton().click();
  });
  assert.equal(isOpen(), true);
}

function menuLink(name: string): HTMLAnchorElement {
  const link = [...dialog().querySelectorAll<HTMLAnchorElement>("a")].find(
    (node) => node.textContent?.trim() === name,
  );
  assert.ok(link, `menu link ${name}`);
  return link;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("side menu", () => {
  before(async () => {
    ({ AccountMenu } = await import("@/components/side-menu"));
  });

  afterEach(() => {
    win.document.documentElement.style.overflow = "";
    replaced.length = 0;
  });

  after(() => {
    win.close();
  });

  it("shows Log in instead of an avatar to signed-out visitors", async () => {
    const view = await mount({ user: null, showLogin: true }, { pathname: "/leaderboard" });
    try {
      assert.equal(win.document.querySelector('button[aria-label="Open menu"]'), null);
      assert.equal(win.document.querySelector('[role="dialog"]'), null);
      const login = [...win.document.querySelectorAll("a")].find((a) => a.textContent === "Log in");
      assert.ok(login);
      assert.equal(login.getAttribute("href"), "/login?next=%2Fleaderboard");
    } finally {
      view.unmount();
    }
  });

  it("shows nothing at the top left while the session loads", async () => {
    const view = await mount({ user: null, showLogin: false });
    try {
      assert.equal(win.document.querySelector('button[aria-label="Open menu"]'), null);
      assert.equal([...win.document.querySelectorAll("a")].length, 0);
    } finally {
      view.unmount();
    }
  });

  it("opens from the avatar and closes on the backdrop", async () => {
    const view = await mount({ user: maya, showLogin: false });
    try {
      assert.equal(isOpen(), false);
      await openMenu();
      assert.equal(win.document.documentElement.style.overflow, "hidden");
      assert.ok(dialog().contains(win.document.activeElement));
      const backdrop = win.document.querySelector<HTMLElement>("[data-menu-backdrop]");
      assert.ok(backdrop);
      await act(async () => {
        backdrop.click();
      });
      assert.equal(isOpen(), false);
      assert.equal(win.document.documentElement.style.overflow, "");
      assert.equal(win.document.activeElement, menuButton());
    } finally {
      view.unmount();
    }
  });

  it("closes on Escape", async () => {
    const view = await mount({ user: maya, showLogin: false });
    try {
      await openMenu();
      await act(async () => {
        win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      assert.equal(isOpen(), false);
    } finally {
      view.unmount();
    }
  });

  it("closes after picking an item", async () => {
    const view = await mount({ user: maya, showLogin: false });
    try {
      await openMenu();
      await act(async () => {
        menuLink("Collection").dispatchEvent(
          new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
        );
      });
      assert.equal(isOpen(), false);
    } finally {
      view.unmount();
    }
  });

  it("replays the quick tour from Take the tour, after the menu closes", async () => {
    const store = await import("@/lib/onboarding/store");
    store.resetOnboarding();
    store.markTourSeen(maya.id);
    const view = await mount({ user: maya, showLogin: false });
    try {
      assert.equal(menuButton().getAttribute("data-tour"), "menu", "the tour's first stop");
      await openMenu();
      const replay = [...dialog().querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent?.trim() === TAKE_TOUR_LABEL,
      );
      assert.ok(replay, "Take the tour is in the menu");
      await act(async () => {
        replay.click();
      });
      assert.equal(isOpen(), false);
      assert.equal(store.onboardingState().tourIndex, null, "waits for the slide-out");
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, TOUR_AFTER_CLOSE_MS + 20));
      });
      assert.equal(store.onboardingState().tourIndex, 0, "starts even after it was seen");
    } finally {
      store.resetOnboarding();
      view.unmount();
    }
  });

  it("wraps Tab inside the menu", async () => {
    const view = await mount({ user: maya, showLogin: false });
    try {
      await openMenu();
      const focusables = [...dialog().querySelectorAll<HTMLElement>("a[href], button")];
      const last = focusables.at(-1);
      assert.ok(last);
      last.focus();
      await act(async () => {
        win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
      });
      assert.equal(win.document.activeElement, focusables[0]);
    } finally {
      view.unmount();
    }
  });

  it("has every old More link, the profile header, counts and pinned badges", async () => {
    const view = await mount({ user: maya, showLogin: false }, { unread: 3 });
    try {
      await openMenu();
      await settle();
      const panel = dialog();
      const hrefs = new Set([...panel.querySelectorAll("a")].map((a) => a.getAttribute("href")));
      // Everything More linked to, signed in on hosted accounts.
      for (const href of [
        "/achievements",
        "/profile",
        "/messages",
        "/cards/new",
        "/collection",
        "/settings/privacy",
        "/settings/collecting",
        "/privacy",
        "/about",
        "/terms",
      ]) {
        assert.ok(hrefs.has(href), `menu links ${href}`);
      }
      assert.ok(hrefs.has("/leaderboard"));
      assert.ok(hrefs.has("/profile/following"));
      assert.ok(hrefs.has("/profile/followers"));
      assert.ok([...panel.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Log out"));
      assert.match(panel.textContent ?? "", /Maya Hunt/);
      assert.match(panel.textContent ?? "", /@maya/);
      assert.match(panel.textContent ?? "", /34\s*Following/);
      assert.match(panel.textContent ?? "", /12\s*Followers/);
      assert.match(panel.textContent ?? "", /9 \/ 42/);
      assert.ok(panel.querySelector('a[aria-label="Achievements, 9 / 42 badges earned"]'));
      assert.ok(panel.querySelector('a[aria-label="Messages, 3 unread"]'));
      const pins = panel.querySelectorAll('[aria-label="Pinned badges"] a');
      assert.equal(pins.length, 2);
      assert.equal(pins[0]?.getAttribute("href"), "/u/maya/badges");
      // Admin rows wait on the admin check, which is false here.
      assert.equal(hrefs.has("/admin/reports"), false);
    } finally {
      view.unmount();
    }
  });

  it("opens from ?menu=open and drops the param", async () => {
    const view = await mount({ user: maya, showLogin: false }, { search: "menu=open" });
    try {
      assert.equal(isOpen(), true);
      assert.deepEqual(replaced, ["/"]);
    } finally {
      view.unmount();
    }
  });

  it("keeps admin links admin-only and the More list complete", () => {
    assert.deepEqual(
      SIDE_MENU_ADMIN.map((item) => item.href),
      ["/admin/reports", "/admin/comp-flags"],
    );
    assert.match(read("components/admin-nav-link.tsx"), /viewerIsAdmin\(\)/);
    assert.match(read("components/admin-nav-link.tsx"), /if \(!show\) return null/);
    assert.deepEqual(
      SIDE_MENU_ITEMS.map((item) => item.label),
      ["Profile", "Collection", "Achievements", "Messages", "Add card", "Leaderboard"],
    );
    assert.deepEqual(
      SIDE_MENU_SETTINGS.map((item) => item.href),
      ["/settings/privacy", "/settings/collecting", "/about", "/privacy", "/terms"],
    );
    // Delete account moved from More to Privacy & safety.
    assert.match(read("app/settings/privacy/page.tsx"), /<DeleteAccount \/>/);
  });

  it("closes on a sideways swipe left only", () => {
    assert.equal(swipeCloses(-80, 10), true);
    assert.equal(swipeCloses(-40, 0), false);
    assert.equal(swipeCloses(-80, 120), false);
    assert.equal(swipeCloses(80, 0), false);
    assert.equal(dragOffset(-30), -30);
    assert.equal(dragOffset(30), 0);
  });

  it("reads ?menu=open and marks the active item", () => {
    assert.equal(menuQueryOpens("menu=open"), true);
    assert.equal(menuQueryOpens("menu=closed"), false);
    assert.equal(menuQueryOpens(""), false);
    assert.equal(menuItemActive("/collection", "/collection", "maya"), true);
    assert.equal(menuItemActive("/settings/privacy", "/settings/privacy", "maya"), true);
    assert.equal(menuItemActive("/u/Maya", "/profile", "maya"), true);
    assert.equal(menuItemActive("/u/someone", "/profile", "maya"), false);
    assert.equal(menuItemActive("/", "/collection", "maya"), false);
  });
});

describe("/more", () => {
  it("redirects to home with the menu open", async () => {
    const { default: MorePage } = await import("@/app/more/page");
    assert.equal(MENU_OPEN_HREF, "/?menu=open");
    try {
      MorePage();
      assert.fail("expected a redirect");
    } catch (error) {
      const digest = String((error as { digest?: string }).digest ?? "");
      assert.match(digest, /^NEXT_REDIRECT;/);
      assert.match(digest, /;\/\?menu=open;/);
    }
  });

  it("is off the bottom bar", () => {
    assert.equal(BOTTOM_NAV.some((tab) => (tab.href as string) === "/more"), false);
    assert.equal(read("components/privacy-lists.tsx").includes('href="/more"'), false);
  });
});

import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { installDom } from "@/lib/test/dom";

const { win, state } = installDom();
for (const name of ["HTMLInputElement", "MutationObserver"] as const) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: win[name] });
}

const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};
const { PathnameContext } = require("next/dist/shared/lib/hooks-client-context.shared-runtime") as {
  PathnameContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};

const router = { back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch() {} };
const KEY = "slabhold.intro.seen.user-ada";

const ada = {
  id: "user-ada",
  username: "ada",
  displayName: "Ada",
  bio: "",
  avatarDataUrl: null,
  accent: "#7C3AED",
  createdAt: new Date().toISOString(),
};

function social() {
  return {
    ready: true,
    mode: "local",
    user: ada,
    blockedIds: [],
    suggestions: [],
    refreshSuggestions() {},
    followMany: async () => ({}),
    isFollowing: () => false,
    toggleFollow: async () => ({}),
    followingCount: () => 0,
  };
}

let unmounts: (() => void)[] = [];

async function render(node: ReactNode) {
  const { SocialContext } = await import("@/components/social-provider");
  const { CollectionContext } = await import("@/components/collection-provider");
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        AppRouterContext.Provider,
        { value: router },
        createElement(
          PathnameContext.Provider,
          { value: "/" },
          createElement(
            SocialContext.Provider,
            { value: social() as never },
            createElement(CollectionContext.Provider, { value: { ready: true, cards: [], syncError: null } as never }, node),
          ),
        ),
      ),
    );
  });
  // The intro is its own lazy chunk.
  for (let tries = 0; tries < 20; tries += 1) {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
    if (!win.document.querySelector("[data-intro-loading]")) break;
  }
  unmounts.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

async function mountIntro(onEnd: () => void = () => {}) {
  const { default: OnboardingIntro } = await import("@/components/onboarding/intro/intro");
  return render(createElement(OnboardingIntro, { userId: ada.id, onEnd }));
}

function intro() {
  return win.document.querySelector<HTMLElement>("[data-onboarding-intro]");
}

function setupHeading() {
  return win.document.querySelector("[data-first-run] h2")?.textContent ?? null;
}

function button(name: string) {
  const found = [...win.document.querySelectorAll<HTMLElement>("button")].find(
    (node) => node.getAttribute("aria-label") === name || node.textContent?.trim() === name,
  );
  assert.ok(found, `button ${name}`);
  return found;
}

async function click(name: string) {
  const target = button(name);
  await act(async () => target.click());
}

async function key(name: string) {
  await act(async () => {
    win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: name, bubbles: true }));
  });
}

beforeEach(async () => {
  const { resetOnboarding } = await import("@/lib/onboarding/store");
  resetOnboarding();
  win.localStorage.clear();
});

afterEach(() => {
  for (const unmount of unmounts) unmount();
  unmounts = [];
  state.reducedMotion = false;
});

describe("onboarding intro, in the setup", () => {
  it("shows once for a new account, then hands over to What do you collect?", async () => {
    const { FirstRunSetup } = await import("@/components/onboarding/first-run-setup");
    await render(createElement(FirstRunSetup));
    assert.ok(intro(), "the intro comes first");
    assert.equal(setupHeading(), null);
    assert.equal(intro()?.getAttribute("role"), "dialog");
    assert.equal(intro()?.getAttribute("aria-label"), "Slabhold intro");

    await click("Continue");
    await click("Skip");
    assert.equal(intro(), null);
    assert.equal(win.localStorage.getItem(KEY), "1");
    assert.equal(setupHeading(), "What do you collect?");

    for (const unmount of unmounts) unmount();
    unmounts = [];
    await render(createElement(FirstRunSetup));
    assert.equal(intro(), null, "never twice");
    assert.equal(setupHeading(), "What do you collect?");
  });

  it("never shows for an account whose setup is done", async () => {
    const { FirstRunSetup } = await import("@/components/onboarding/first-run-setup");
    win.localStorage.setItem("slabhold.setup.user-ada", "done");
    await render(createElement(FirstRunSetup));
    assert.equal(intro(), null);
    assert.equal(win.localStorage.getItem(KEY), null);
  });

  it("waits for setup steps past the first one", async () => {
    const { FirstRunSetup } = await import("@/components/onboarding/first-run-setup");
    win.localStorage.setItem("slabhold.setup.user-ada", "people");
    await render(createElement(FirstRunSetup));
    assert.equal(intro(), null);
  });
});

describe("onboarding intro", () => {
  it("tracks the step in five dots, with Back from screen 2", async () => {
    await mountIntro();
    const progress = () => intro()?.querySelector('[role="progressbar"]');
    assert.equal(progress()?.getAttribute("aria-label"), "Step 1 of 5");
    assert.equal(progress()?.querySelectorAll("span").length, 5);
    assert.equal([...(progress()?.children ?? [])].findIndex((dot) => dot.getAttribute("data-dot") === "current"), 0);
    assert.equal(win.document.activeElement?.textContent, "Continue", "focus starts on the main button");
    assert.equal(intro()?.querySelector('[aria-label="Back"]'), null);

    for (let step = 2; step <= 5; step += 1) {
      await click("Continue");
      assert.equal(progress()?.getAttribute("aria-label"), `Step ${step} of 5`);
      assert.equal([...(progress()?.children ?? [])].findIndex((dot) => dot.getAttribute("data-dot") === "current"), step - 1);
    }
    assert.match(intro()?.querySelector("h2")?.textContent ?? "", /Know when it matters/);
    await click("Back");
    assert.equal(progress()?.getAttribute("aria-label"), "Step 4 of 5");
  });

  for (const how of ["Skip", "Escape"] as const) {
    it(`ends from any screen with one ${how} and marks it seen`, async () => {
      for (let screen = 0; screen < 5; screen += 1) {
        win.localStorage.clear();
        let ended = 0;
        await mountIntro(() => (ended += 1));
        for (let step = 0; step < screen; step += 1) await click("Continue");
        assert.ok([...(intro()?.querySelectorAll("header button") ?? [])].some((node) => node.textContent === "Skip"), "Skip is always there");
        if (how === "Skip") await click("Skip");
        else await key("Escape");
        assert.equal(ended, 1, `screen ${screen + 1}`);
        assert.equal(win.localStorage.getItem(KEY), "1");
        for (const unmount of unmounts) unmount();
        unmounts = [];
      }
    });
  }

  for (const how of ["Turn on alerts", "Maybe later"] as const) {
    it(`${how} ends it without asking the browser for notifications`, async () => {
      let asked = 0;
      const realNotification = (globalThis as { Notification?: unknown }).Notification;
      Object.defineProperty(globalThis, "Notification", {
        configurable: true,
        writable: true,
        value: { permission: "default", requestPermission: async () => ((asked += 1), "granted") },
      });
      try {
        let ended = 0;
        await mountIntro(() => (ended += 1));
        for (let step = 0; step < 4; step += 1) await click("Continue");
        await click(how);
        await act(async () => new Promise((resolve) => setTimeout(resolve, 300)));
        assert.equal(ended, 1);
        assert.equal(win.localStorage.getItem(KEY), "1");
        assert.equal(asked, 0);
      } finally {
        Object.defineProperty(globalThis, "Notification", { configurable: true, writable: true, value: realNotification });
      }
    });
  }

  it("says the personas are sample accounts on screens 4 and 5", async () => {
    await mountIntro();
    for (let step = 0; step < 3; step += 1) await click("Continue");
    for (let screen = 4; screen <= 5; screen += 1) {
      const node = intro()!;
      assert.match(node.textContent ?? "", /Sample accounts/);
      assert.ok(node.querySelector('[aria-label="Sample accounts, not real collectors"]'), `screen ${screen}`);
      for (const link of node.querySelectorAll("a")) assert.doesNotMatch(link.getAttribute("href") ?? "", /\/u\//);
      if (screen === 4) await click("Continue");
    }
  });

  it("shows each screen's final frame with reduced motion: no dust, every alert in place", async () => {
    state.reducedMotion = true;
    await mountIntro();
    assert.equal(intro()?.querySelector(".overflow-hidden.pointer-events-none"), null, "no dust");
    for (let step = 0; step < 4; step += 1) await click("Continue");
    const banners = intro()?.querySelectorAll('[aria-label="Sample accounts, not real collectors"] li') ?? [];
    assert.equal(banners.length, 4);
    assert.match(intro()?.textContent ?? "", /paolo_lolocards followed you/);
  });
});

import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { installDom } from "@/lib/test/dom";

const { win } = installDom();
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

const pushed: string[] = [];
const router = {
  back() {},
  forward() {},
  refresh() {},
  hmrRefresh() {},
  push(href: string) {
    pushed.push(href);
  },
  replace() {},
  prefetch() {},
};

const ada = {
  id: "user-ada",
  username: "ada",
  displayName: "Ada",
  bio: "",
  avatarDataUrl: null,
  accent: "#7c5cff",
  createdAt: new Date().toISOString(),
};

function suggestion(id: string, username: string) {
  return { id, username, displayName: username, avatarDataUrl: null, accent: "#7c5cff", suggestionReason: null };
}

const followed: string[][] = [];

function social(mode: "local" | "supabase" = "local") {
  return {
    ready: true,
    mode,
    user: ada,
    blockedIds: [],
    suggestions: [
      suggestion("u-1", "wax_room"),
      suggestion("u-2", "qa_tester"),
      suggestion("u-3", "slabholdupdates"),
      suggestion("u-4", "hobby_pal"),
    ],
    refreshSuggestions() {},
    followMany: async (ids: string[]) => {
      followed.push([...ids]);
      return {};
    },
    isFollowing: () => false,
    toggleFollow: async () => ({}),
    followingCount: () => 0,
  };
}

function collection(cardCount = 0) {
  return { ready: true, cards: Array.from({ length: cardCount }, (_, i) => ({ id: `c${i}` })), syncError: null };
}

type Mounted = { host: HTMLElement; unmount: () => void };
let mounted: Mounted[] = [];

async function mount(
  node: ReactNode,
  options: { pathname?: string; cards?: number; mode?: "local" | "supabase" } = {},
): Promise<Mounted> {
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
          { value: options.pathname ?? "/" },
          createElement(
            SocialContext.Provider,
            { value: social(options.mode) as never },
            createElement(CollectionContext.Provider, { value: collection(options.cards) as never }, node),
          ),
        ),
      ),
    );
  });
  const result = {
    host,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
  mounted.push(result);
  return result;
}

async function click(name: string) {
  const button = [...win.document.querySelectorAll<HTMLElement>("button, a")].find(
    (node) => node.getAttribute("aria-label") === name || node.textContent?.trim() === name,
  );
  assert.ok(button, `button ${name}`);
  await act(async () => {
    button.click();
  });
}

async function wait(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

function setupHeading() {
  return win.document.querySelector("[data-first-run] h2")?.textContent ?? null;
}

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

beforeEach(async () => {
  const { resetOnboarding } = await import("@/lib/onboarding/store");
  resetOnboarding();
  win.localStorage.clear();
  pushed.length = 0;
  followed.length = 0;
});

afterEach(() => {
  for (const item of mounted) item.unmount();
  mounted = [];
});

describe("first-run setup", () => {
  it("walks what you collect, follow collectors, first card, with Skip on each", async () => {
    const { FirstRunSetup } = await import("@/components/onboarding/first-run-setup");
    const { onboardingState } = await import("@/lib/onboarding/store");
    await mount(createElement(FirstRunSetup));

    const dialog = win.document.querySelector("[data-first-run]");
    assert.equal(dialog?.getAttribute("role"), "dialog");
    assert.equal(setupHeading(), "What do you collect?");
    assert.equal(onboardingState().setupActive, true);
    assert.equal(win.document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuetext"), "Step 1 of 3");
    const football = win.document.querySelector<HTMLButtonElement>('[aria-label="Sports"] button');
    assert.ok(football && football.className.includes("min-h-14"), "big tappable chips");

    await click("Skip");
    assert.equal(setupHeading(), "Follow a few collectors");
    assert.equal(win.localStorage.getItem("slabhold.setup.user-ada"), "people");
    const names = [...win.document.querySelectorAll("[data-first-run] li")].map((li) => li.textContent ?? "");
    assert.equal(names.length, 2, "no test or official accounts");
    assert.match(names.join(" "), /wax_room/);
    assert.match(names.join(" "), /hobby_pal/);
    await click("Follow all");
    assert.deepEqual(followed, [["u-1", "u-4"]]);

    await click("Back");
    assert.equal(setupHeading(), "What do you collect?");
    await click("Continue");
    await click("Skip");
    assert.equal(setupHeading(), "Add your first card");

    await click("I'll do it later");
    assert.equal(setupHeading(), null);
    assert.equal(win.localStorage.getItem("slabhold.setup.user-ada"), "done");
    assert.deepEqual(pushed, ["/"]);
    assert.equal(onboardingState().setupActive, false);
    assert.equal(onboardingState().welcomePending, true);
  });

  it("goes straight into Add card from the last step", async () => {
    const { FirstRunSetup } = await import("@/components/onboarding/first-run-setup");
    win.localStorage.setItem("slabhold.setup.user-ada", "card");
    await mount(createElement(FirstRunSetup));
    assert.equal(setupHeading(), "Add your first card", "resumes the step after a reload");
    await click("Add a card");
    assert.deepEqual(pushed, ["/cards/new"]);
    assert.equal(win.localStorage.getItem("slabhold.setup.user-ada"), "done");
  });

  it("stays away once done, and skips the first-card step for collectors with cards", async () => {
    const { FirstRunSetup } = await import("@/components/onboarding/first-run-setup");
    win.localStorage.setItem("slabhold.setup.user-ada", "done");
    const first = await mount(createElement(FirstRunSetup));
    assert.equal(setupHeading(), null);
    first.unmount();
    mounted = [];

    win.localStorage.setItem("slabhold.setup.user-ada", "people");
    await mount(createElement(FirstRunSetup), { cards: 3, mode: "supabase" });
    await click("Skip");
    assert.equal(setupHeading(), null);
    assert.deepEqual(pushed, ["/"]);
  });
});

describe("old prompts", () => {
  it("wait while setup, You're in or the tour is up", async () => {
    const { useOnboardingBusy } = await import("@/components/onboarding/use-onboarding");
    const store = await import("@/lib/onboarding/store");
    function Probe() {
      return createElement("p", { id: "probe" }, useOnboardingBusy() ? "busy" : "free");
    }
    await mount(createElement(Probe));
    const probe = () => win.document.getElementById("probe")?.textContent;
    assert.equal(probe(), "free");
    await act(async () => store.setSetupActive(true));
    assert.equal(probe(), "busy");
    await act(async () => store.completeSetup());
    assert.equal(probe(), "busy", "welcome pending");
    await act(async () => store.startCelebration());
    assert.equal(probe(), "busy");
    await act(async () => store.endCelebration());
    assert.equal(probe(), "free");
    await act(async () => store.startTour());
    assert.equal(probe(), "busy");
    await act(async () => store.endTour());
    assert.equal(probe(), "free");
  });

  it("are gated in the shell and on Home", () => {
    const shell = read("components/app-shell.tsx");
    const feed = read("components/feed-view.tsx");
    assert.doesNotMatch(shell, /CollectPrompt/);
    assert.match(shell, /<FirstRunSetup \/>/);
    assert.match(shell, /!onboardingBusy \? \(\s*<BadgeRevealGate/);
    assert.match(feed, /started\.visible && !onboardingBusy \? \(\s*<GetStartedCard/);
    assert.match(feed, /const showAddToHome =\s*Boolean\(user\) &&\s*!onboardingBusy/);
    assert.match(feed, /const showWelcome =\s*Boolean\(user\) &&\s*!onboardingBusy/);
  });
});

/** Fake on-screen anchors for the five coach marks. */
function anchors(skip: string[] = []) {
  const holder = win.document.createElement("div");
  ["menu", "add-card", "leaderboard", "collection", "messages"].forEach((target, index) => {
    if (skip.includes(target)) return;
    const node = win.document.createElement("button");
    node.dataset.tour = target;
    node.textContent = target;
    node.getBoundingClientRect = () =>
      ({ top: index === 0 ? 10 : 700, left: 20 + index * 60, width: 44, height: 44, bottom: index === 0 ? 54 : 744, right: 64 + index * 60, x: 0, y: 0, toJSON() {} }) as DOMRect;
    holder.appendChild(node);
  });
  win.document.body.appendChild(holder);
  return () => holder.remove();
}

function bubble() {
  return win.document.querySelector<HTMLElement>("[data-coach-tour] [role='dialog']");
}

describe("quick tour", () => {
  it("follows You're in once, skips missing UI, and is stored as seen", async () => {
    const { YoureIn, YOURE_IN_MS } = await import("@/components/onboarding/youre-in");
    const { CoachTour } = await import("@/components/onboarding/coach-tour");
    const store = await import("@/lib/onboarding/store");
    const remove = anchors(["leaderboard"]);
    try {
      store.completeSetup();
      await mount(
        createElement("div", null, createElement(YoureIn, { userId: ada.id, username: ada.username }), createElement(CoachTour, { userId: ada.id })),
      );
      const status = win.document.querySelector('[role="status"]');
      assert.match(status?.textContent ?? "", /You're in\./);
      assert.equal(bubble(), null, "the tour waits for the moment to finish");

      await wait(YOURE_IN_MS + 60);
      assert.equal(win.document.querySelector('[role="status"]'), null);
      assert.equal(bubble()?.getAttribute("aria-modal"), "true");
      assert.match(bubble()?.textContent ?? "", /Your menu: profile, achievements, settings\./);
      assert.match(bubble()?.textContent ?? "", /1 of 5/);
      assert.equal(win.document.activeElement?.textContent, "Next", "focus moves into the bubble");
      assert.ok(bubble()?.getAttribute("aria-labelledby"));
      assert.ok(bubble()?.getAttribute("aria-describedby"));

      await click("Next");
      assert.match(bubble()?.textContent ?? "", /Add a card in seconds/);
      await click("Next");
      assert.match(bubble()?.textContent ?? "", /Your cards and their value\./, "leaderboard isn't on screen, so it's skipped");
      await click("Next");
      assert.match(bubble()?.textContent ?? "", /DM other collectors\./);
      await click("Done");
      assert.equal(bubble(), null);
      assert.equal(win.localStorage.getItem("slabhold.tour.seen.user-ada"), "1");

      // Another setup finish doesn't show it again.
      await act(async () => store.completeSetup());
      await wait(YOURE_IN_MS + 60);
      assert.equal(bubble(), null);
    } finally {
      remove();
    }
  });

  it("closes on Escape and can be replayed any time", async () => {
    const { CoachTour } = await import("@/components/onboarding/coach-tour");
    const store = await import("@/lib/onboarding/store");
    const remove = anchors();
    try {
      store.markTourSeen(ada.id);
      await mount(createElement(CoachTour, { userId: ada.id }));
      await act(async () => store.startTour());
      assert.match(bubble()?.textContent ?? "", /Your menu/);
      await act(async () => {
        win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      assert.equal(bubble(), null);
      assert.equal(store.onboardingState().tourIndex, null);
    } finally {
      remove();
    }
  });

  it("ends quietly when none of its targets are on screen", async () => {
    const { CoachTour } = await import("@/components/onboarding/coach-tour");
    const store = await import("@/lib/onboarding/store");
    await mount(createElement(CoachTour, { userId: ada.id }));
    await act(async () => store.startTour());
    assert.equal(bubble(), null);
    assert.equal(store.onboardingState().tourIndex, null);
  });

  it("anchors on the real avatar and tabs, and respects safe areas", () => {
    const shell = read("components/app-shell.tsx");
    const menu = read("components/side-menu.tsx");
    const tour = read("components/onboarding/coach-tour.tsx");
    assert.match(menu, /data-tour="menu"/);
    assert.match(shell, /data-tour=\{tab\.tour\}/);
    for (const target of ['"/leaderboard": "leaderboard"', '"/cards/new": "add-card"', '"/collection": "collection"', '"/messages": "messages"']) {
      assert.ok(shell.includes(target), target);
    }
    assert.match(tour, /env\(safe-area-inset-top\)/);
    assert.match(tour, /env\(safe-area-inset-bottom\)/);
  });
});

describe("reduced motion", () => {
  it("drops the slide, shine, confetti and spotlight motion", () => {
    const css = read("app/globals.css");
    const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    assert.match(reduced, /\.youre-in-pop,\s*\.youre-in-shine \{\s*animation: none;/);
    assert.match(reduced, /\.youre-in-confetti \{\s*display: none;/);
    for (const file of [
      "components/onboarding/coach-tour.tsx",
      "components/onboarding/first-run-setup.tsx",
      "components/auth-form.tsx",
    ]) {
      const source = read(file);
      assert.match(source, /motion-reduce:transition-none/, file);
      assert.doesNotMatch(source, /(?<!motion-safe:)animate-\[/, `${file} animates only with motion-safe`);
    }
  });
});

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

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const IPHONE_INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0.0 (iPhone15,2; iOS 17_5; en_US; en; scale=3.00; 1179x2556; 600000000)";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36";
const JSDOM_UA = win.navigator.userAgent;

function device(userAgent: string, options: { standalone?: boolean } = {}) {
  Object.defineProperty(win.navigator, "userAgent", { configurable: true, get: () => userAgent });
  Object.defineProperty(win.navigator, "platform", {
    configurable: true,
    get: () => (/iPhone/.test(userAgent) ? "iPhone" : /Android/.test(userAgent) ? "Linux armv8l" : "Linux x86_64"),
  });
  Object.defineProperty(win.navigator, "maxTouchPoints", {
    configurable: true,
    get: () => (/iPhone|Android/.test(userAgent) ? 5 : 0),
  });
  Object.defineProperty(win.navigator, "standalone", { configurable: true, get: () => options.standalone === true });
}

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
  email: "ada@example.com",
  username: "ada",
  displayName: "Ada",
  bio: "",
  avatarDataUrl: null,
  accent: "#7c5cff",
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

type Mounted = { host: HTMLElement; unmount: () => void };
let mounted: Mounted[] = [];

async function mount(node: ReactNode): Promise<Mounted> {
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
            createElement(
              CollectionContext.Provider,
              { value: { ready: true, cards: [], syncError: null } as never },
              node,
            ),
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

function buttonNamed(name: string) {
  return [...win.document.querySelectorAll<HTMLElement>("button, a")].find(
    (node) => node.getAttribute("aria-label") === name || node.textContent?.trim() === name,
  );
}

async function click(name: string) {
  const button = buttonNamed(name);
  assert.ok(button, `button ${name}`);
  await act(async () => {
    button.click();
  });
}

function installStep() {
  return win.document.querySelector<HTMLElement>("[data-install-step]");
}

function heading() {
  return installStep()?.querySelector("h2")?.textContent ?? null;
}

function setupHeading() {
  return win.document.querySelector("[data-first-run] h2")?.textContent ?? null;
}

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

async function setup() {
  const { FirstRunSetup } = await import("@/components/onboarding/first-run-setup");
  return mount(createElement(FirstRunSetup));
}

beforeEach(async () => {
  const { resetOnboarding } = await import("@/lib/onboarding/store");
  const { resetInstallPrompt } = await import("@/lib/pwa/install-prompt");
  resetOnboarding();
  resetInstallPrompt();
  win.localStorage.clear();
  win.document.cookie = "slabhold_email_hint=; Max-Age=0; Path=/";
  pushed.length = 0;
});

afterEach(() => {
  for (const item of mounted) item.unmount();
  mounted = [];
  device(JSDOM_UA);
});

describe("add to home screen step", () => {
  it("comes before setup on iPhone Safari, then hands over to it", async () => {
    device(IPHONE_SAFARI);
    const { onboardingState } = await import("@/lib/onboarding/store");
    await setup();
    const step = installStep();
    assert.equal(step?.getAttribute("role"), "dialog");
    assert.equal(step?.getAttribute("aria-modal"), "true");
    assert.equal(heading(), "Put Slabhold on your home screen");
    assert.equal(setupHeading(), null, "setup waits");
    assert.equal(onboardingState().setupActive, true, "older prompts keep waiting");
    const text = step?.textContent ?? "";
    assert.match(text, /Tap Share/);
    assert.match(text, /under ⋯/);
    assert.match(text, /Tap Add to Home Screen/);
    assert.match(text, /Tap Add\b/);
    assert.ok(step?.querySelector("[data-share-arrow]"), "points at Safari's Share button");
    assert.ok(step?.querySelector('svg[aria-label="Share icon"]') || step?.querySelector("[data-share-icon]"));
    assert.doesNotMatch(text, /\d+%|\d+x faster/i, "no made-up numbers");
    assert.match(win.document.cookie, /slabhold_email_hint=ada%40example\.com/, "email for the installed app");

    await click("I added it");
    assert.equal(installStep(), null);
    assert.equal(setupHeading(), "What do you collect?");
    assert.equal(win.localStorage.getItem("slabhold.install-step.user-ada"), "added");
    assert.equal(win.localStorage.getItem("slabhold.add-to-home.dismissed.user-ada"), "1", "old banner stays away");
  });

  it("can always be skipped, and only shows once", async () => {
    device(IPHONE_SAFARI);
    const first = await setup();
    await click("Maybe later");
    assert.equal(installStep(), null);
    assert.equal(setupHeading(), "What do you collect?");
    assert.equal(win.localStorage.getItem("slabhold.install-step.user-ada"), "later");
    first.unmount();
    mounted = [];

    const { resetOnboarding } = await import("@/lib/onboarding/store");
    resetOnboarding();
    await setup();
    assert.equal(installStep(), null, "remembered across a reload");
    assert.equal(setupHeading(), "What do you collect?");
  });

  it("closes on Escape like Maybe later", async () => {
    device(IPHONE_SAFARI);
    await setup();
    await act(async () => {
      win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    assert.equal(installStep(), null);
    assert.equal(win.localStorage.getItem("slabhold.install-step.user-ada"), "later");
  });

  it("uses Chrome's real install prompt on Android when it's offered", async () => {
    device(ANDROID_CHROME);
    const { listenForInstallPrompt } = await import("@/lib/pwa/install-prompt");
    listenForInstallPrompt(win);
    await setup();
    assert.equal(heading(), "Put Slabhold on your home screen");
    assert.match(installStep()?.textContent ?? "", /Tap ⋮/, "menu steps until the prompt arrives");
    assert.ok(buttonNamed("I added it"));
    assert.equal(installStep()?.querySelector("[data-share-arrow]"), null);

    let prompted = 0;
    const event = new win.Event("beforeinstallprompt", { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: string }>;
    };
    event.prompt = async () => {
      prompted += 1;
    };
    event.userChoice = Promise.resolve({ outcome: "accepted" });
    await act(async () => {
      win.dispatchEvent(event);
    });
    assert.ok(buttonNamed("Install Slabhold"));
    await click("Install Slabhold");
    assert.equal(prompted, 1);
    assert.equal(installStep(), null);
    assert.equal(win.localStorage.getItem("slabhold.install-step.user-ada"), "added");
    assert.equal(setupHeading(), "What do you collect?");
  });

  it("sends in-app browsers to Safari with a copy-link button", async () => {
    device(IPHONE_INSTAGRAM);
    const copied: string[] = [];
    Object.defineProperty(win.navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (value: string) => void copied.push(value) },
    });
    await setup();
    assert.equal(heading(), "Open Slabhold in Safari");
    assert.match(installStep()?.textContent ?? "", /Instagram/);
    await click("Copy link");
    assert.deepEqual(copied, ["http://localhost/"]);
    assert.ok(buttonNamed("Link copied"));
    await click("Maybe later");
    assert.equal(setupHeading(), "What do you collect?");
  });

  it("skips on a computer, in the installed app, and partway through setup", async () => {
    device(JSDOM_UA);
    const desktop = await setup();
    assert.equal(installStep(), null);
    assert.equal(setupHeading(), "What do you collect?");
    desktop.unmount();
    mounted = [];

    device(IPHONE_SAFARI, { standalone: true });
    const installed = await setup();
    assert.equal(installStep(), null);
    assert.equal(setupHeading(), "What do you collect?");
    installed.unmount();
    mounted = [];

    device(IPHONE_SAFARI);
    win.localStorage.setItem("slabhold.setup.user-ada", "people");
    await setup();
    assert.equal(installStep(), null);
    assert.equal(setupHeading(), "Follow a few collectors");
  });
});

describe("install step design", () => {
  it("animates only with motion-safe, respects safe areas, and uses the real logo", () => {
    const source = read("components/onboarding/install-step.tsx");
    assert.match(source, /motion-reduce:transition-none/);
    assert.doesNotMatch(source, /(?<!motion-safe:)animate-\[/);
    assert.match(source, /env\(safe-area-inset-top\)/);
    assert.match(source, /env\(safe-area-inset-bottom\)/);
    assert.match(source, /<Logo /);
    assert.match(source, /useReducedMotion\(\)/);
    assert.doesNotMatch(source, /Pokemon|Pokémon|TCG|eBay|mail day/i);
  });
});

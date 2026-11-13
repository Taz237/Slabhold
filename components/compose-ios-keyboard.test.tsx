import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, type ComponentType, type ReactNode } from "react";
import { CollectionContext } from "@/components/collection-provider";
import { SocialContext } from "@/components/social-provider";

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

const router = {
  back() {},
  forward() {},
  refresh() {},
  hmrRefresh() {},
  push() {},
  replace() {},
  prefetch() {},
};

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3000/compose",
  pretendToBeVisual: true,
});
const win = dom.window;
Object.defineProperty(win, "innerHeight", { configurable: true, value: 844 });
Object.defineProperty(win, "innerWidth", { configurable: true, value: 390 });
Object.defineProperty(win, "matchMedia", {
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }),
});

function expose(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

expose("window", win);
expose("document", win.document);
expose("navigator", win.navigator);
expose("HTMLElement", win.HTMLElement);
expose("HTMLInputElement", win.HTMLInputElement);
expose("HTMLTextAreaElement", win.HTMLTextAreaElement);
expose("HTMLFormElement", win.HTMLFormElement);
expose("Node", win.Node);
expose("Element", win.Element);
expose("localStorage", win.localStorage);
expose("sessionStorage", win.sessionStorage);
expose("requestAnimationFrame", win.requestAnimationFrame.bind(win));
expose("cancelAnimationFrame", win.cancelAnimationFrame.bind(win));
expose("fetch", async () => new win.Response(null, { status: 404 }));
expose("IS_REACT_ACT_ENVIRONMENT", true);

const fixtureUser = {
  id: "user-1",
  username: "fixturecollector",
  displayName: "Fixture Collector",
  accent: "#7C3AED",
  avatarDataUrl: null,
};

let ComposeView: ComponentType;

before(async () => {
  ({ ComposeView } = await import("@/components/compose-view"));
});

after(() => {
  win.close();
});

function Harness({ children }: { children?: ReactNode }) {
  const social = {
    ready: true,
    mode: "local" as const,
    user: fixtureUser,
    posts: [],
    profiles: [],
    blockedIds: [],
    followingOf: () => [],
    createPost: async () => ({ error: null, postId: "post-1" }),
    updatePost: async () => ({ error: null }),
  };
  const collection = { ready: true, loaded: true, cards: [], syncError: null };
  return createElement(
    AppRouterContext.Provider,
    { value: router },
    createElement(
      PathnameContext.Provider,
      { value: "/compose" },
      createElement(
        SearchParamsContext.Provider,
        { value: new URLSearchParams("") },
        createElement(
          SocialContext.Provider,
          { value: social as never },
          createElement(CollectionContext.Provider, { value: collection as never }, children),
        ),
      ),
    ),
  );
}

/** A pretend Safari keyboard: the visual viewport is `height` px shorter than the window. */
function fakeViewport(keyboard: number) {
  const viewport = Object.assign(new win.EventTarget(), { height: win.innerHeight - keyboard, offsetTop: 0 });
  Object.defineProperty(win, "visualViewport", { configurable: true, value: viewport });
  return viewport;
}

async function frames(count = 3) {
  for (let i = 0; i < count; i += 1) {
    await act(async () => {
      await new Promise((resolve) => win.requestAnimationFrame(() => resolve(null)));
    });
  }
}

async function waitFor(check: () => boolean, label: string) {
  for (let i = 0; i < 60; i += 1) {
    if (check()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  assert.fail(`timed out: ${label}`);
}

async function mount() {
  win.localStorage.clear();
  win.sessionStorage.clear();
  // A composer closed with text keeps its draft in module memory for the next one.
  const { clearComposeDraft } = await import("@/lib/social/compose-draft");
  clearComposeDraft();
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(Harness, null, createElement(ComposeView)));
  });
  await frames();
  return {
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function toolbar(): HTMLElement {
  const el = win.document.querySelector<HTMLElement>('[data-slot="compose-toolbar"]');
  assert.ok(el, "the toolbar is drawn");
  return el;
}

function field(): HTMLTextAreaElement {
  const el = win.document.querySelector<HTMLTextAreaElement>('[role="dialog"] textarea');
  assert.ok(el, "the text field is drawn");
  return el;
}

function postButton(): HTMLButtonElement {
  const el = [...win.document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button[type="submit"]')][0];
  assert.ok(el, "the Post pill is drawn");
  return el;
}

async function type(text: string) {
  const el = field();
  const setter = Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(el, text);
    el.setSelectionRange(text.length, text.length);
    el.dispatchEvent(new win.Event("input", { bubbles: true }));
  });
}

function ring(): HTMLElement | null {
  return toolbar().querySelector<HTMLElement>("[data-tone]");
}

describe("composer on iPhone: toolbar rides the keyboard", () => {
  it("pins the toolbar at bottom: 336px with a 336px keyboard (visualViewport)", async () => {
    const viewport = fakeViewport(0);
    const view = await mount();
    try {
      assert.equal(toolbar().dataset.keyboard, "closed");
      assert.equal(toolbar().style.bottom, "0px", "keyboard down: on the bottom edge, above the safe area");
      assert.match(toolbar().className, /pb-\[env\(safe-area-inset-bottom\)\]/);

      viewport.height = win.innerHeight - 336;
      await act(async () => {
        viewport.dispatchEvent(new win.Event("resize"));
      });
      await frames();
      await waitFor(() => toolbar().style.bottom === "336px", "toolbar on the keyboard");
      assert.equal(toolbar().dataset.keyboard, "open");
      assert.match(toolbar().className, /(^|\s)fixed(\s|$)/, "fixed to the viewport, like StepDock");
      assert.doesNotMatch(toolbar().className, /pb-\[env\(safe-area-inset-bottom\)\]/, "no safe-area gap over the keys");

      viewport.height = win.innerHeight;
      await act(async () => {
        viewport.dispatchEvent(new win.Event("resize"));
      });
      await frames();
      await waitFor(() => toolbar().style.bottom === "0px", "back to the bottom");
    } finally {
      view.unmount();
    }
  });

  it("pins the toolbar at bottom: 336px from the iOS app's keyboard event when the web view doesn't resize", async () => {
    fakeViewport(0);
    const view = await mount();
    try {
      await act(async () => {
        const event = new win.Event("keyboardWillShow");
        Object.assign(event, { keyboardHeight: 336 });
        win.dispatchEvent(event);
      });
      await frames();
      await waitFor(() => toolbar().style.bottom === "336px", "toolbar on the native keyboard");
      const sheet = win.document.querySelector<HTMLElement>("[data-compose-sheet]");
      assert.equal(sheet?.style.height, `${844 - 336}px`, "the sheet ends where the keyboard starts");

      await act(async () => {
        win.dispatchEvent(new win.Event("keyboardWillHide"));
      });
      await frames();
      await waitFor(() => toolbar().style.bottom === "0px", "back down with the keyboard");
    } finally {
      view.unmount();
    }
  });
});

describe("composer layout, like X", () => {
  it("focuses the field on open and when the empty area is tapped", async () => {
    fakeViewport(0);
    const view = await mount();
    try {
      assert.equal(win.document.activeElement === field(), true, "autofocus opens the keyboard");
      field().blur();
      const body = win.document.querySelector<HTMLElement>('[data-slot="compose-body"]');
      assert.ok(body);
      await act(async () => {
        body.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
      });
      assert.equal(win.document.activeElement === field(), true, "a tap on the empty body focuses the field");
      assert.match(field().className, /text-17/, "17px at the default text size: big, and no iOS zoom");
      assert.equal(field().getAttribute("placeholder"), "What's happening?");
    } finally {
      view.unmount();
    }
  });

  it("disables Post until there is text", async () => {
    fakeViewport(0);
    const view = await mount();
    try {
      assert.equal(postButton().disabled, true);
      await type("Pulled a Wemby rookie");
      assert.equal(postButton().disabled, false);
    } finally {
      view.unmount();
    }
  });

  it("only shows tools we have: photo library, camera, attach a card", async () => {
    fakeViewport(0);
    const view = await mount();
    try {
      const labels = [...toolbar().querySelectorAll("button")].map((button) => button.getAttribute("aria-label"));
      assert.deepEqual(labels, ["Photo library", "Camera", "Attach a card"]);
      const text = win.document.querySelector('[role="dialog"]')?.textContent ?? "";
      assert.doesNotMatch(text, /Everyone can reply/, "no reply setting exists, so no fake control");
      assert.doesNotMatch(text, /GIF|Poll/);
    } finally {
      view.unmount();
    }
  });

  it("counts down in the ring: amber at 20 left, red and negative over 280", async () => {
    fakeViewport(0);
    const view = await mount();
    try {
      assert.equal(ring() === null, true, "hidden while empty");
      await type("a".repeat(100));
      assert.equal(ring()?.dataset.tone, "normal");
      await type("a".repeat(260));
      assert.equal(ring()?.dataset.tone, "warn");
      assert.equal(ring()?.textContent, "20");
      await type("a".repeat(285));
      assert.equal(ring()?.dataset.tone, "over");
      assert.equal(ring()?.textContent, "-5");
      assert.match(ring()!.className, /text-rose-500/);
      assert.equal(postButton().disabled, true, "over the limit can't post");
      assert.equal(field().value.length, 285, "the text is never cut");
    } finally {
      view.unmount();
    }
  });
});

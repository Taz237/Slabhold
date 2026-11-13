import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, type ComponentType, type ReactNode } from "react";
import { CollectionContext } from "@/components/collection-provider";
import { SocialContext } from "@/components/social-provider";

const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require(
  "next/dist/shared/lib/app-router-context.shared-runtime",
) as {
  AppRouterContext: {
    Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode;
  };
};

const pushed: string[] = [];
const prefetched: string[] = [];
const router = {
  back() {},
  forward() {},
  refresh() {},
  hmrRefresh() {},
  push(href: string) {
    pushed.push(href);
  },
  replace() {},
  prefetch(href: string) {
    prefetched.push(href);
  },
};

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3000/cards/new",
  pretendToBeVisual: true,
});
const win = dom.window;
const reduceMotion = false;
Object.defineProperty(win, "matchMedia", {
  configurable: true,
  value: (query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reduceMotion : false,
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
expose("HTMLSelectElement", win.HTMLSelectElement);
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

type Saved = Record<string, unknown>;
type FormProps = {
  guided?: boolean;
  initialSport?: string;
  initialPrefill?: { player: string; year: string; set: string; number?: string; noNumber?: boolean } | null;
};
type Social = { user: { id: string; username: string } | null };
type PostResult = { error: string | null; postId: string | null };

const posts: Saved[] = [];
let postResult: () => Promise<PostResult> = async () => ({ error: null, postId: "post-1" });
let CardForm: ComponentType<FormProps>;

const fixtureUser: Social = { user: { id: "user-1", username: "fixturecollector" } };


before(async () => {
  ({ CardForm } = await import("@/components/card-form"));
});

after(() => {
  win.close();
});

describe("Add card speed: Older years", () => {
  it("a partial year is a filter: 199, 1990 and 90 never show the year error", async () => {
    const view = await mount({ guided: true });
    try {
      await pickPlayer("wemb", "Victor Wembanyama");
      const older = win.document.querySelector<HTMLButtonElement>('button[aria-label="Older years"]');
      assert.ok(older, "Older years opens a sheet");
      await clickButton(older);
      const search = sheetSearch();
      assert.notEqual(win.document.activeElement, search, "the keyboard does not open by itself");
      for (const typed of ["1", "19", "199", "1990", "90"]) {
        await act(async () => setNativeValue(search, typed));
        assert.equal(sheetText().includes("Use 2026 or 2023-24"), false, `no error for ${typed}`);
        assert.ok(sheetOptions().length > 0, `${typed} lists years`);
      }
      await act(async () => setNativeValue(search, "90"));
      assert.deepEqual(sheetOptions().slice(0, 2), ["1990-91", "1990"]);
      await act(async () => setNativeValue(search, "1990"));
      assert.deepEqual(sheetOptions().slice(0, 2), ["1990-91", "1990"]);
      await clickButton(sheetButton("1990-91"));
      await waitFor(() => textIncludes("Which set?"));
    } finally {
      view.unmount();
    }
  });

  it("checks the year only on submit", async () => {
    const view = await mount({ guided: true });
    try {
      await pickPlayer("wemb", "Victor Wembanyama");
      await clickButton(win.document.querySelector<HTMLButtonElement>('button[aria-label="Older years"]')!);
      const search = sheetSearch();
      await act(async () => setNativeValue(search, "19x"));
      assert.equal(sheetText().includes("2026 or 2023-24"), false, "typing never errors");
      await act(async () => {
        search.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      assert.ok(sheetText().includes("2026 or 2023-24"), "Return on a non-year explains the format");
      await act(async () => setNativeValue(search, "1990"));
      assert.equal(sheetText().includes("2026 or 2023-24"), false, "typing again clears it");
      await act(async () => {
        search.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      await waitFor(() => textIncludes("Which set?"));
    } finally {
      view.unmount();
    }
  });

  it("More sets does not open the keyboard by itself", async () => {
    const view = await mount({ guided: true });
    try {
      await pickPlayer("wemb", "Victor Wembanyama");
      await clickText("2023-24");
      await waitFor(() => textIncludes("Which set?"));
      await clickButton(win.document.querySelector<HTMLButtonElement>('button[aria-label="More sets"]')!);
      assert.notEqual(win.document.activeElement, sheetSearch());
    } finally {
      view.unmount();
    }
  });
});

describe("Add card speed: Parallel step", () => {
  it("Base is pre-selected and a Next button moves on, no re-tap needed", async () => {
    const view = await mount({ guided: true });
    try {
      await walkToParallel();
      const base = buttonByLabel("Base")!;
      assert.equal(base.getAttribute("aria-pressed"), "true");
      const next = [...win.document.querySelectorAll("button")].find((node) => node.textContent?.trim() === "Next");
      assert.ok(next, "a clear Next button");
      await clickButton(next);
      await waitFor(() => textIncludes("Look right?"));
    } finally {
      view.unmount();
    }
  });
});

describe("Add card speed: number fields with the keyboard up", () => {
  it("Card # keeps Next and a Done button pinned on top of the keyboard", async () => {
    const restore = keyboardUp(336);
    const view = await mount({ guided: true });
    try {
      await pickPlayer("wemb", "Victor Wembanyama");
      await clickText("2023-24");
      await clickText("Panini Prizm");
      await waitFor(() => textIncludes("What's the card number?"));
      await waitFor(() => Boolean(win.document.querySelector('[data-slot="step-dock"][data-keyboard="open"]')));
      const dock = win.document.querySelector<HTMLElement>('[data-slot="step-dock"][data-keyboard="open"]')!;
      assert.match(dock.className, /\bfixed\b/);
      assert.equal(dock.style.bottom, "336px", "sits right on the keyboard");
      const labels = [...dock.querySelectorAll("button")].map((node) => node.textContent?.trim());
      assert.deepEqual(labels, ["Done", "Next"]);
    } finally {
      view.unmount();
      restore();
    }
  });

  it("Review keeps Add to collection above the keyboard while the cert # is typed", async () => {
    const restore = keyboardUp(300);
    const view = await mount({ guided: true });
    try {
      await walkToReview();
      await clickText("PSA");
      const cert = win.document.querySelector<HTMLInputElement>('input[data-field="certNumber"]');
      assert.ok(cert, "PSA opens the cert field");
      assert.equal(cert.inputMode, "numeric");
      await waitFor(() => Boolean(win.document.querySelector('[data-slot="step-dock"][data-keyboard="open"]')));
      const dock = win.document.querySelector<HTMLElement>('[data-slot="step-dock"][data-keyboard="open"]')!;
      assert.equal(dock.style.bottom, "300px");
      const labels = [...dock.querySelectorAll("button")].map((node) => node.textContent?.trim());
      assert.deepEqual(labels, ["Done", "Add to collection"]);
    } finally {
      view.unmount();
      restore();
    }
  });
});

describe("Add card speed: Add to collection", () => {
  it("shows the reveal as soon as the card is saved; the feed post finishes in the background", async () => {
    const capture: Saved[] = [];
    posts.length = 0;
    let finishPost: (value: PostResult) => void = () => undefined;
    postResult = () => new Promise((resolve) => (finishPost = resolve));
    const view = await mount({ guided: true }, capture, fixtureUser);
    try {
      pushed.length = 0;
      await walkToReview();
      await rememberPublic("user-1");
      await clickButton(buttonWithText("Add to collection")!);
      await waitFor(() => pushed.some((href) => href.endsWith("?added=1")));
      assert.equal(capture.length, 1, "the card saved first");
      assert.equal(posts.length, 1, "the post started");
      const { pendingCardPost } = await import("@/lib/social/card-post-queue");
      const cardId = (capture[0].id as string | undefined) ?? "new-card";
      const pending = pendingCardPost(cardId);
      assert.ok(pending, "the post is still running after the reveal opened");
      finishPost({ error: null, postId: "post-7" });
      await act(async () => {
        await pending;
      });
      assert.match(win.sessionStorage.getItem("slabhold.card-posts") ?? "", /post-7/);
    } finally {
      postResult = async () => ({ error: null, postId: "post-1" });
      view.unmount();
    }
  });

  it("never waits on a value lookup after the insert", () => {
    const form = read("components/card-form.tsx");
    const submit = form.slice(form.indexOf("async function submit()"), form.indexOf("const headerNode"));
    const afterSave = submit.slice(submit.indexOf("await saved;"));
    assert.match(afterSave, /void queueCardPost\(card\.id/, "the guided post is queued, not awaited");
    assert.doesNotMatch(afterSave, /await [^;]*(?:comp|value|trawl)/i, "no comps or value lookup is awaited");
    const provider = read("components/collection-provider.tsx");
    assert.match(provider, /scheduleCardValueRefresh\(card\.id\)/);
    assert.doesNotMatch(provider, /await scheduleCardValueRefresh/);
  });

  it("a failed background post still keeps the card and is remembered for the reveal", async () => {
    const capture: Saved[] = [];
    postResult = async () => ({ error: "feed down", postId: null });
    const view = await mount({ guided: true }, capture, fixtureUser);
    try {
      pushed.length = 0;
      await walkToReview();
      await rememberPublic("user-1");
      await clickButton(buttonWithText("Add to collection")!);
      await waitFor(() => pushed.some((href) => href.endsWith("?added=1")));
      await waitFor(() => /new-card/.test(win.sessionStorage.getItem("slabhold.card-post-failed") ?? ""));
      assert.equal(capture.length, 1);
    } finally {
      postResult = async () => ({ error: null, postId: "post-1" });
      view.unmount();
    }
  });
});

/** A pretend iOS keyboard: the visual viewport is `height` px shorter than the window. */
function keyboardUp(height: number): () => void {
  const viewport = Object.assign(new win.EventTarget(), {
    height: win.innerHeight - height,
    offsetTop: 0,
  });
  Object.defineProperty(win, "visualViewport", { configurable: true, value: viewport });
  return () => {
    Object.defineProperty(win, "visualViewport", { configurable: true, value: undefined });
  };
}

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function sheet(): HTMLElement {
  const el = win.document.querySelector<HTMLElement>('[role="dialog"]');
  assert.ok(el, "sheet is open");
  return el;
}

function sheetSearch(): HTMLInputElement {
  const el = sheet().querySelector<HTMLInputElement>("input");
  assert.ok(el);
  return el;
}

function sheetText(): string {
  return sheet().textContent ?? "";
}

function sheetOptions(): string[] {
  return [...sheet().querySelectorAll("ul button")].map((node) => node.textContent?.trim() ?? "");
}

function sheetButton(label: string): HTMLButtonElement {
  const el = [...sheet().querySelectorAll<HTMLButtonElement>("ul button")].find((node) => node.textContent?.trim() === label);
  assert.ok(el, label);
  return el;
}

async function walkToParallel() {
  await pickPlayer("wemb", "Victor Wembanyama");
  await clickText("2023-24");
  await clickText("Panini Prizm");
  await waitFor(() => textIncludes("What's the card number?"));
  await act(async () => setNativeValue(active(), "136"));
  await clickText("Next");
  await waitFor(() => Boolean(buttonByLabel("Base")));
}

function active(): HTMLElement {
  const el = win.document.activeElement;
  assert.ok(el && el !== win.document.body, "something has focus");
  return el as HTMLElement;
}

async function walkToReview() {
  await pickPlayer("wemb", "Victor Wembanyama");
  await clickText("2023-24");
  await clickText("Panini Prizm");
  await waitFor(() => textIncludes("What's the card number?"));
  await act(async () => setNativeValue(active(), "136"));
  await clickText("Next");
  await waitFor(() => Boolean(buttonByLabel("Base")));
  await clickButton(buttonByLabel("Base")!);
  await waitFor(() => textIncludes("Look right?"));
}

async function pickPlayer(query: string, name: string) {
  await waitFor(() => textIncludes("What's on the card?"));
  await act(async () => setNativeValue(playerInput(), query));
  await waitFor(() => Boolean(buttonWithText(name)));
  await clickButton(buttonWithText(name)!);
  await waitFor(() => textIncludes("What year is it?"));
}

function playerInput(): HTMLInputElement {
  const el = win.document.querySelector<HTMLInputElement>('input[data-field="playerName"]');
  assert.ok(el);
  return el;
}

function textIncludes(value: string): boolean {
  return win.document.body.textContent?.includes(value) === true;
}

function buttonWithText(label: string): HTMLButtonElement | undefined {
  return [...win.document.querySelectorAll("button")].find((node) => node.textContent?.trim() === label) ??
    [...win.document.querySelectorAll("button")].find((node) => node.textContent?.includes(label));
}

function buttonByLabel(label: string): HTMLButtonElement | null {
  if (label === "Base") {
    return (
      [...win.document.querySelectorAll("button")].find((node) => node.textContent?.startsWith("BaseNo color")) ?? null
    );
  }
  return win.document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ??
    [...win.document.querySelectorAll("button")].find((node) => node.textContent?.trim() === label) ??
    null;
}

async function clickText(label: string) {
  const exact = [...win.document.querySelectorAll("button")].find((node) => node.textContent?.trim() === label);
  const el = exact ?? buttonWithText(label);
  assert.ok(el, `button ${label}`);
  await clickButton(el);
}

async function clickButton(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
  await settle();
}

function setNativeValue(el: object, value: string) {
  const proto =
    el instanceof win.HTMLTextAreaElement
      ? win.HTMLTextAreaElement.prototype
      : el instanceof win.HTMLSelectElement
        ? win.HTMLSelectElement.prototype
        : win.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  (el as EventTarget).dispatchEvent(new win.Event("input", { bubbles: true }));
  (el as EventTarget).dispatchEvent(new win.Event("change", { bubbles: true }));
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
}

async function waitFor(check: () => boolean, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (check()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error(win.document.body.textContent?.slice(0, 800) ?? "timed out");
}

function Harness({ children, capture, social }: { children?: ReactNode; capture: Saved[]; social: Social }) {
  const value = {
    ready: true,
    mode: social.user ? ("supabase" as const) : ("local" as const),
    user: social.user,
    createPost: (draft: Saved) => {
      posts.push(draft);
      return postResult();
    },
  };
  const collection = {
    ready: true,
    loaded: true,
    cards: [] as Saved[],
    syncError: null,
    getCard: () => undefined,
    addCard: (input: Saved) => {
      capture.push(input);
      const card = { ...input, id: (input.id as string) ?? "new-card", createdAt: "2026-11-10T00:00:00Z", updatedAt: "2026-11-10T00:00:00Z" };
      collection.cards = [card];
      return { card, saved: Promise.resolve() };
    },
    updateCard: (id: string, patch: Saved) => ({ card: { ...patch, id }, saved: Promise.resolve() }),
    removeCard() {},
    reload() {},
  };
  return createElement(
    AppRouterContext.Provider,
    { value: router },
    createElement(
      SocialContext.Provider,
      { value: value as never },
      createElement(CollectionContext.Provider, { value: collection as never }, children),
    ),
  );
}

async function mount(
  props: FormProps,
  capture: Saved[] = [],
  social: Social = { user: null },
) {
  win.localStorage.clear();
  win.sessionStorage.clear();
  const { clearNewCardDraft } = await import("@/lib/cards/new-card-draft");
  const { clearFlowPosition } = await import("@/lib/cards/add-flow");
  const { clearDoorQuery } = await import("@/lib/cards/add-door");
  clearNewCardDraft();
  clearFlowPosition();
  clearDoorQuery();
  const { createRoot } = await import("react-dom/client");
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(Harness, { capture, social }, createElement(CardForm, props)));
  });
  return {
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

/** Public / Private moved to the Added screen; a remembered Public (from the last add) is how a new card starts public. */
async function rememberPublic(userId: string) {
  const { writeBrowserVisibilityChoice } = await import("@/lib/cards/visibility-choice");
  await act(async () => writeBrowserVisibilityChoice(userId, true));
}

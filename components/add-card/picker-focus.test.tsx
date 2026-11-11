import assert from "node:assert/strict";
import { createRequire } from "node:module";
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
const postResult: () => Promise<PostResult> = async () => ({ error: null, postId: "post-1" });
let CardForm: ComponentType<FormProps>;



before(async () => {
  ({ CardForm } = await import("@/components/card-form"));
});

after(() => {
  win.close();
});

/** True when no text field has focus, so the iOS keyboard stays down. */
function keyboardDown(): boolean {
  const el = win.document.activeElement;
  if (!el || el === win.document.body) return true;
  const tag = el.tagName.toLowerCase();
  return tag !== "input" && tag !== "textarea" && tag !== "select" && !(el as HTMLElement).isContentEditable;
}

describe("Add card pickers open on their choices, never the keyboard", () => {
  it("player: the first screen lists players with nothing focused", async () => {
    const view = await mount({ guided: true });
    try {
      await waitFor(() => textIncludes("What's on the card?"));
      await settle();
      assert.ok(keyboardDown(), "the player search is not focused on open");
    } finally {
      view.unmount();
    }
  });

  it("player: coming back to the player step does not focus its search", async () => {
    const view = await mount({ guided: true });
    try {
      await pickPlayer("wemb", "Victor Wembanyama");
      const back = win.document.querySelector<HTMLButtonElement>('button[aria-label="Back"]');
      assert.ok(back, "a Back button");
      await clickButton(back);
      await waitFor(() => Boolean(win.document.querySelector('input[data-field="playerName"]')));
      assert.ok(keyboardDown());
    } finally {
      view.unmount();
    }
  });

  it("year: the year step and the Older years sheet open with nothing focused", async () => {
    const view = await mount({ guided: true });
    try {
      await pickPlayer("wemb", "Victor Wembanyama");
      assert.ok(keyboardDown(), "year step");
      await clickButton(win.document.querySelector<HTMLButtonElement>('button[aria-label="Older years"]')!);
      await settle();
      assert.ok(sheetOptions().length > 0, "the list is showing");
      assert.ok(keyboardDown(), "Older years sheet");
    } finally {
      view.unmount();
    }
  });

  it("set: the set step and the More sets sheet open with nothing focused", async () => {
    const view = await mount({ guided: true });
    try {
      await pickPlayer("wemb", "Victor Wembanyama");
      await clickText("2023-24");
      await waitFor(() => textIncludes("Which set?"));
      assert.ok(keyboardDown(), "set step");
      await clickButton(win.document.querySelector<HTMLButtonElement>('button[aria-label="More sets"]')!);
      await settle();
      assert.ok(sheetOptions().length > 0, "the list is showing");
      assert.ok(keyboardDown(), "More sets sheet");
    } finally {
      view.unmount();
    }
  });

  it("parallel: the parallel list opens with nothing typed into", async () => {
    const view = await mount({ guided: true });
    try {
      await walkToParallel();
      await settle();
      assert.ok(keyboardDown());
    } finally {
      view.unmount();
    }
  });

  it("grader: picking a grading company does not focus the cert # field", async () => {
    const view = await mount({ guided: true });
    try {
      await walkToReview();
      assert.ok(keyboardDown(), "Review opens on its choices");
      await clickText("PSA");
      await settle();
      assert.ok(win.document.querySelector('input[data-field="certNumber"]'), "cert # is offered");
      assert.ok(keyboardDown(), "but not focused");
    } finally {
      view.unmount();
    }
  });
});


/** A pretend iOS keyboard: the visual viewport is `height` px shorter than the window. */


function sheet(): HTMLElement {
  const el = win.document.querySelector<HTMLElement>('[role="dialog"]');
  assert.ok(el, "sheet is open");
  return el;
}



function sheetOptions(): string[] {
  return [...sheet().querySelectorAll("ul button")].map((node) => node.textContent?.trim() ?? "");
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

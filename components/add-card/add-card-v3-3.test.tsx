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
let CardForm: ComponentType<FormProps>;

const LAST_USED_KEY = "slabhold:add-last-used:user-1";
const fixtureUser: Social = { user: { id: "user-1", username: "fixturecollector" } };

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

before(async () => {
  ({ CardForm } = await import("@/components/card-form"));
});

after(() => {
  win.close();
});

describe("Add card v3 phase 3: forward focus", () => {
  it("puts focus on each step's field or pre-selected chip, and counts only the steps shown", async () => {
    const capture: Saved[] = [];
    const view = await mount({ guided: true }, capture);
    try {
      await pickPlayer("wemb", "Victor Wembanyama");
      // Year: the newest season is pre-selected and focused, still a tap to confirm.
      const year = active();
      assert.equal(year.tagName, "BUTTON");
      assert.equal(year.getAttribute("aria-pressed"), "true");
      assert.match(year.textContent ?? "", /^\d{4}-\d{2}$/);
      assert.equal(counter(), "Step 2 of 5");
      assert.equal(liveQuestion(), "What year is it?");
      await clickText("2023-24");

      await waitFor(() => textIncludes("Which set?"));
      const set = active();
      assert.equal(set.tagName, "BUTTON");
      assert.ok(set.closest("ul"), "a set chip");
      assert.equal(counter(), "Step 3 of 5");
      await clickText("Panini Prizm");

      await waitFor(() => textIncludes("What's the card number?"));
      assert.equal(active().getAttribute("data-field"), "cardNumber", "the keyboard opens on Card #");
      assert.equal(active().getAttribute("enterkeyhint"), "next");
      await act(async () => setNativeValue(active(), "136"));
      // Return is Next.
      await act(async () => {
        active().dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      await settle();

      await waitFor(() => textIncludes("Which parallel or insert?"));
      assert.match(active().textContent ?? "", /^Base/, "Base is pre-selected and focused");
      assert.equal(active().getAttribute("aria-pressed"), "true");
      assert.equal(counter(), "Step 5 of 5");
      await waitFor(() => Boolean(buttonByLabel("Red, numbered to 299")));
      await clickButton(active());

      // Base has no run: no Numbered?, no Grade screen.
      await waitFor(() => textIncludes("Look right?"));
      assert.equal(counter(), "Review");
      assert.equal(active().textContent, "Raw", "Condition starts on Raw");
      assert.equal(active().closest('[data-slot="condition"]') != null, true);
      assert.equal(textIncludes("Is it numbered?"), false);
      assert.equal(textIncludes("Graded or raw?"), false);
      await waitFor(() => prefetched.includes("/cards/new"));
      assert.ok(prefetched.some((href) => /^\/cards\/[^/]+$/.test(href) && href !== "/cards/new"));

      await clickButton(buttonWithText("Add to collection")!);
      await waitFor(() => capture.length === 1);
      assert.equal(capture[0].grade, "Raw");
      assert.equal(capture[0].serialRun, null);
    } finally {
      view.unmount();
    }
  });

  it("Add another opens with focus on Card #; Copy this card on Base", async () => {
    let view = await mount({
      guided: true,
      initialSport: "Basketball",
      initialPrefill: { player: "Tyrese Maxey", year: "2024-25", set: "Donruss Optic" },
    });
    try {
      await waitFor(() => textIncludes("What's the card number?"));
      assert.equal(active().getAttribute("data-field"), "cardNumber");
    } finally {
      view.unmount();
    }
    view = await mount({
      guided: true,
      initialSport: "Basketball",
      initialPrefill: { player: "Tyrese Maxey", year: "2024-25", set: "Donruss Optic", number: "7", noNumber: false },
    });
    try {
      await waitFor(() => textIncludes("Which parallel or insert?"));
      assert.match(active().textContent ?? "", /^Base/);
    } finally {
      view.unmount();
    }
  });

  it("a numbered Base card is still set from Review, and comes straight back", async () => {
    const capture: Saved[] = [];
    const view = await mount({ guided: true }, capture);
    try {
      await walkToReview();
      await clickButton(buttonByLabel("Numbered? Set a print run")!);
      await waitFor(() => textIncludes("Is it numbered?"));
      assert.equal(active().textContent, "Not numbered", "the pre-selected chip has focus");
      await clickText("/99");
      assert.equal(active().getAttribute("aria-label"), "Your number, out of 99");
      await act(async () => setNativeValue(active(), "12"));
      await clickText("Next");
      await waitFor(() => textIncludes("Look right?"));
      assert.ok(textIncludes("Base 12/99"));
      await clickButton(buttonWithText("Add to collection")!);
      await waitFor(() => capture.length === 1);
      assert.equal(capture[0].serialRun, 99);
      assert.equal(capture[0].serialNo, 12);
    } finally {
      view.unmount();
    }
  });
});

describe("Add card v3 phase 3: Condition on Review", () => {
  it("PSA opens its grades and the cert field; Add with no grade focuses the grades in place", async () => {
    const capture: Saved[] = [];
    const view = await mount({ guided: true }, capture);
    try {
      await walkToReview();
      await clickText("PSA");
      const grades = win.document.querySelector('[data-slot="condition"] [role="group"][aria-label="PSA grade"]');
      assert.ok(grades, "PSA grade chips open inline");
      const cert = win.document.querySelector<HTMLInputElement>('[data-slot="condition"] input[data-field="certNumber"]');
      assert.ok(cert, "cert number sits in the Condition row");
      assert.equal(cert.getAttribute("enterkeyhint"), "done");
      const add = buttonWithText("Add to collection")!;
      assert.equal(add.getAttribute("aria-disabled"), "true", "looks unavailable");
      assert.equal(add.disabled, false, "but still tappable");
      await clickButton(add);
      assert.equal(capture.length, 0);
      assert.ok(textIncludes("Look right?"), "no bounce to an old step");
      assert.ok(grades.contains(active()), "focus lands on the grade chips");
      assert.ok(textIncludes("Pick the grade on the label"));
      await clickText("10");
      await act(async () => setNativeValue(cert, "81234567"));
      // Moved, not copied: More details has no second cert field.
      const details = win.document.querySelector("details")!;
      assert.equal(/Cert/i.test(details.textContent ?? ""), false);
      assert.equal(details.querySelectorAll('input[inputmode="numeric"]').length, 0);
      await clickButton(buttonWithText("Add to collection")!);
      await waitFor(() => capture.length === 1);
      assert.equal(capture[0].grade, "PSA 10");
      assert.equal(capture[0].conditionType, "graded");
      assert.equal(capture[0].certNumber, "81234567");
    } finally {
      view.unmount();
    }
  });

  it("Raw again drops the grade, and the cert is not saved on a raw card", async () => {
    const capture: Saved[] = [];
    const view = await mount({ guided: true }, capture);
    try {
      await walkToReview();
      await clickText("SGC");
      await clickText("9.5");
      const cert = win.document.querySelector<HTMLInputElement>('input[data-field="certNumber"]')!;
      await act(async () => setNativeValue(cert, "555"));
      await clickText("Raw");
      assert.equal(win.document.querySelector('input[data-field="certNumber"]'), null);
      await clickButton(buttonWithText("Add to collection")!);
      await waitFor(() => capture.length === 1);
      assert.equal(capture[0].grade, "Raw");
      assert.equal(capture[0].certNumber, "");
    } finally {
      view.unmount();
    }
  });

  it("never shows a grader name or a dollar figure on Review without real sales", async () => {
    const view = await mount({ guided: true });
    try {
      await walkToReview();
      await clickText("BGS");
      assert.doesNotMatch(win.document.querySelector('[data-slot="review-value"]')?.textContent ?? "", /\$0/);
      assert.doesNotMatch(win.document.body.textContent ?? "", /\$0\.00/);
    } finally {
      view.unmount();
    }
  });
});

describe("Add card v3 phase 3: last-used answers", () => {
  it("pre-selects the last sport, year, set and grader, and writes them only after a save", async () => {
    const capture: Saved[] = [];
    const view = await mount({ guided: true }, capture, fixtureUser, {
      sport: "Baseball",
      year: "2024",
      set: "Topps Chrome",
      grader: "PSA",
    });
    try {
      await waitFor(() => textIncludes("What's on the card?"));
      await act(async () => setNativeValue(playerInput(), "Someone Brandnew"));
      const typed = await waitForButton(/Someone Brandnew/);
      await clickButton(typed);
      await waitFor(() => textIncludes("What year is it?"));
      assert.equal(active().textContent, "2024", "last-used year, pre-selected and focused");
      assert.equal(active().getAttribute("aria-pressed"), "true");
      await clickButton(active());
      await waitFor(() => textIncludes("Which set?"));
      const first = win.document.querySelector<HTMLButtonElement>("ul button")!;
      assert.match(first.textContent ?? "", /Last used/);
      assert.match(first.textContent ?? "", /Topps Chrome/);
      assert.equal(active(), first);
      await clickButton(first);
      await waitFor(() => textIncludes("What's the card number?"));
      await act(async () => setNativeValue(active(), "44"));
      await clickText("Next");
      await waitFor(() => textIncludes("Which parallel or insert?"));
      await clickButton(buttonByLabel("Base")!);
      await waitFor(() => textIncludes("Look right?"));
      assert.equal(active().textContent, "PSA", "the last card was graded, so PSA is pre-selected");
      assert.equal(win.localStorage.getItem(LAST_USED_KEY), JSON.stringify({ sport: "Baseball", year: "2024", set: "Topps Chrome", grader: "PSA" }), "unchanged before the save");
      await clickText("Raw");
      await clickButton(buttonWithText("Add to collection")!);
      await waitFor(() => capture.length === 1);
      assert.equal(capture[0].sport, "Baseball", "last-used sport, not Basketball");
      await waitFor(() => (win.localStorage.getItem(LAST_USED_KEY) ?? "").includes('"grader":""'));
      assert.deepEqual(JSON.parse(win.localStorage.getItem(LAST_USED_KEY)!), {
        sport: "Baseball",
        year: "2024",
        set: "Topps Chrome",
        grader: "",
      });
    } finally {
      view.unmount();
    }
  });

  it("starts Raw on Review when the last card was raw", async () => {
    const view = await mount({ guided: true }, [], fixtureUser, {
      sport: "Basketball",
      year: "2023-24",
      set: "Panini Prizm",
      grader: "",
    });
    try {
      await walkToReview();
      assert.equal(active().textContent, "Raw");
    } finally {
      view.unmount();
    }
  });

  it("signed out keeps nothing, and the classic and Edit form never read it", async () => {
    const capture: Saved[] = [];
    const view = await mount({ guided: true }, capture);
    try {
      await walkToReview();
      await clickButton(buttonWithText("Add to collection")!);
      await waitFor(() => capture.length === 1);
      assert.equal(win.localStorage.length, keysWithout("slabhold:add-last-used").length);
    } finally {
      view.unmount();
    }
    const form = read("components/card-form.tsx");
    assert.match(form, /const guidedAdd = guided && !existing;/);
    assert.match(form, /guidedAdd \? readAddLastUsed\(browserStorage\(\), userId\) : null/);
    assert.match(form, /if \(guidedAdd && user\?\.id\) \{\s*writeAddLastUsed/);
  });
});

describe("Add card v3 phase 3: motion", () => {
  it("steps stay at 220ms or less, fade-only under reduced motion, and never trap taps", () => {
    const flow = read("components/add-card/add-card-flow.tsx");
    for (const match of flow.matchAll(/animate-\[add-(?:step-in|step-back|fade)_(\d+)ms/g)) {
      assert.ok(Number(match[1]) <= 220, match[0]);
    }
    const fade = flow.match(/motion-reduce:animate-\[add-fade_(\d+)ms/);
    assert.ok(fade && Number(fade[1]) <= 150);
    assert.doesNotMatch(flow, /pointer-events-none[^"]*animate|animate[^"]*pointer-events-none/);
  });

  it("has no slab glide from Review: the Added scene's flip is the one reveal", () => {
    assert.doesNotMatch(read("components/add-card/add-card-flow.tsx"), /data-slab-morph/);
    assert.doesNotMatch(read("components/card-form.tsx"), /SlabMorph|slab-morph/);
    assert.doesNotMatch(read("components/card-added-panel.tsx"), /SlabMorph|slab-morph/);
  });
});

function keysWithout(prefix: string): string[] {
  const keys: string[] = [];
  for (let index = 0; index < win.localStorage.length; index += 1) {
    const key = win.localStorage.key(index);
    if (key && !key.startsWith(prefix)) keys.push(key);
  }
  return keys;
}

function active(): HTMLElement {
  const el = win.document.activeElement;
  assert.ok(el && el !== win.document.body, "something has focus");
  return el as HTMLElement;
}

function counter(): string {
  return win.document.querySelector("section span.font-mono")?.textContent?.trim() ?? "";
}

function liveQuestion(): string {
  return win.document.querySelector("section p.sr-only[aria-live]")?.textContent?.trim() ?? "";
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

async function waitForButton(pattern: RegExp): Promise<HTMLButtonElement> {
  let found: HTMLButtonElement | undefined;
  await waitFor(() => {
    found = [...win.document.querySelectorAll("button")].find((node) => pattern.test(node.textContent ?? ""));
    return Boolean(found);
  });
  return found!;
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
    createPost: async () => ({ error: null, postId: null }),
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
  lastUsed: Record<string, string> | null = null,
) {
  win.localStorage.clear();
  win.sessionStorage.clear();
  if (lastUsed) win.localStorage.setItem(LAST_USED_KEY, JSON.stringify(lastUsed));
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

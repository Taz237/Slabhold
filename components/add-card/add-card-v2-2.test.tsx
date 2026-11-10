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

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3000/cards/new",
  pretendToBeVisual: true,
});
const win = dom.window;

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
const quickComp: string[] = [];
let quickCompAnswer: () => Response = () => new Response(null, { status: 503 });
expose("fetch", async (input: unknown) => {
  const url = String(input);
  if (url.startsWith("/api/quick-comp")) {
    quickComp.push(url);
    return quickCompAnswer();
  }
  return new Response(null, { status: 404 });
});
// Quick Comp on, as in production when the flag is set. Read at render time.
process.env.NEXT_PUBLIC_QUICK_COMP = "1";

function trawlPayload(median: number | null, prices: number[]) {
  return {
    comps: prices.map((price, index) => ({
      id: `sale-${index}`,
      itemId: `sale-${index}`,
      title: "Fixture sale",
      soldPrice: price,
      soldDate: `2026-10-${String(10 + index).padStart(2, "0")}`,
      platform: "eBay",
      condition: "Raw",
      shipping: null,
      url: "",
    })),
    history: [],
    median,
    p25: null,
    p75: null,
    count: prices.length,
    source: "trawl",
    cached: true,
    fetchedAt: "2026-11-01T00:00:00.000Z",
    query: "fixture",
    lowConfidence: false,
    sample: false,
    photo: null,
  };
}

function answerWith(body: unknown, status = 200) {
  quickCompAnswer = () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
expose("IS_REACT_ACT_ENVIRONMENT", true);

type Saved = Record<string, unknown>;
type FormProps = {
  guided?: boolean;
  initialSport?: string;
  initialPrefill?: { player: string; year: string; set: string; number?: string; noNumber?: boolean } | null;
};
type Social = {
  user: { id: string; username: string } | null;
  postError: string | null;
  posts: Saved[];
};
let CardForm: ComponentType<FormProps>;

describe("Add card v2 phase 2", () => {
  before(async () => {
    ({ CardForm } = await import("@/components/card-form"));
  });

  after(() => {
    win.close();
  });

  it("Copy this card opens on Parallel or insert with player, year, set and number filled, Base selected", async () => {
    const view = await mount({
      guided: true,
      initialSport: "Basketball",
      initialPrefill: { player: "Tyrese Maxey", year: "2024-25", set: "Donruss Optic", number: "7", noNumber: false },
    });
    try {
      await waitFor(() => textIncludes("Which parallel or insert?"));
      const preview = win.document.querySelector('[aria-label="Card preview"]')?.textContent ?? "";
      assert.match(preview, /Tyrese Maxey/);
      assert.match(preview, /2024-25 · Donruss Optic · #7/);
      assert.match(preview, /Base/);
      assert.ok(buttonByLabel("Color Blast"), "Color Blast chip on Donruss Optic");
      assert.ok(buttonByLabel("Downtown"));
      assert.ok(buttonByLabel("Kaboom"));
      await clickText("Start a different card");
      await waitFor(() => textIncludes("What's on the card?"));
      assert.equal(playerInput().value, "");
      assert.equal(win.document.querySelector('[aria-label="Card preview"]'), null);
    } finally {
      view.unmount();
    }
  });

  it("Copy this card with no number still opens on Parallel or insert", async () => {
    const view = await mount({
      guided: true,
      initialSport: "Basketball",
      initialPrefill: { player: "Tyrese Maxey", year: "2024-25", set: "Donruss Optic", number: "", noNumber: true },
    });
    try {
      await waitFor(() => textIncludes("Which parallel or insert?"));
    } finally {
      view.unmount();
    }
  });

  it("Review shows Worth about once, and caption or Public do not look up again", async () => {
    quickComp.length = 0;
    answerWith(trawlPayload(125, [120, 140, 130, 110]));
    const social: Social = { user: { id: "user-1", username: "fixturecollector" }, postError: null, posts: [] };
    const capture: Saved[] = [];
    const view = await mount(
      {
        guided: true,
        initialSport: "Basketball",
        initialPrefill: { player: "Tyrese Maxey", year: "2024-25", set: "Donruss Optic", number: "7", noNumber: false },
      },
      capture,
      social,
    );
    try {
      await waitFor(() => textIncludes("Which parallel or insert?"));
      await clickButton(buttonByLabel("Downtown")!);
      await waitFor(() => textIncludes("Is it numbered?"));
      await clickText("Not numbered");
      await clickText("Raw");
      await waitFor(() => textIncludes("Look right?"));
      assert.ok(textIncludes("Finding recent sales…"), "calm loading line first");
      assert.equal(quickComp.length, 0, "debounced: nothing before 400ms");
      await waitFor(() => textIncludes("Worth about $125.00 based on 4 recent sales."));
      assert.equal(quickComp.length, 1);
      const url = new URL(quickComp[0], "https://slabhold.app");
      assert.equal(url.searchParams.get("player"), "Tyrese Maxey");
      assert.equal(url.searchParams.get("number"), "7");
      assert.equal(url.searchParams.get("parallel"), "Downtown");
      assert.equal(url.searchParams.get("grade"), "Raw");
      assert.ok(textIncludes("Recent sold prices via Trawl"));
      assert.equal(textIncludes("eBay data"), false);
      const block = win.document.querySelector('[data-slot="review-value"]')!;
      const photo = win.document.querySelector('input[type="file"]');
      if (photo) {
        assert.ok(block.compareDocumentPosition(photo) & win.Node.DOCUMENT_POSITION_FOLLOWING, "value sits above the photo well");
      }
      // Visibility and caption are not part of the card: no second lookup.
      await clickText("Public");
      await waitFor(() => checkboxByLabel("Also post to my feed").checked);
      const caption = win.document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Post caption"]')!;
      await act(async () => setNativeValue(caption, "Maxey!"));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
      });
      assert.equal(quickComp.length, 1);
      await clickButton(buttonWithText("Add to collection")!);
      await waitFor(() => capture.length === 1);
      assert.equal(capture[0].cardNumber, "7");
      assert.equal(capture[0].parallel, "Downtown");
    } finally {
      view.unmount();
    }
  });

  it("a failed or limited lookup never shows $0, and the card still saves", async () => {
    quickComp.length = 0;
    answerWith({ error: "limited", reason: "daily", resetAt: null }, 429);
    const capture: Saved[] = [];
    const view = await mount(
      {
        guided: true,
        initialSport: "Basketball",
        initialPrefill: { player: "Tyrese Maxey", year: "2024-25", set: "Donruss Optic", number: "8", noNumber: false },
      },
      capture,
    );
    try {
      await waitFor(() => textIncludes("Which parallel or insert?"));
      await clickButton(buttonByLabel("Kaboom")!);
      await waitFor(() => textIncludes("Is it numbered?"));
      await clickText("Not numbered");
      await clickText("Raw");
      await waitFor(() => textIncludes("Value unavailable right now"));
      const block = win.document.querySelector('[data-slot="review-value"]')?.textContent ?? "";
      assert.doesNotMatch(block, /\$/);
      await clickButton(buttonWithText("Add to collection")!);
      await waitFor(() => capture.length === 1);
    } finally {
      view.unmount();
    }
  });

  it("no number: Review never calls Trawl", async () => {
    quickComp.length = 0;
    answerWith(trawlPayload(125, [120]));
    const view = await mount({
      guided: true,
      initialSport: "Basketball",
      initialPrefill: { player: "Tyrese Maxey", year: "2024-25", set: "Donruss Optic", number: "", noNumber: true },
    });
    try {
      await waitFor(() => textIncludes("Which parallel or insert?"));
      await clickButton(buttonByLabel("Base")!);
      await clickText("Not numbered");
      await clickText("Raw");
      await waitFor(() => textIncludes("Look right?"));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
      });
      assert.equal(quickComp.length, 0);
      assert.equal(win.document.querySelector('[data-slot="review-value"]'), null);
    } finally {
      view.unmount();
    }
  });
});




function checkboxByLabel(text: string): HTMLInputElement {
  const label = [...win.document.querySelectorAll("label")].find((el) => el.textContent?.includes(text));
  const input = label?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  assert.ok(input, text);
  return input;
}



function playerInput(): HTMLInputElement {
  const el = win.document.querySelector<HTMLInputElement>('input[data-field="playerName"]');
  assert.ok(el);
  return el;
}




/** Tailwind classes that give 44px or more, on the element or a wrapping hit area. */

function textIncludes(value: string): boolean {
  return win.document.body.textContent?.includes(value) === true;
}

function buttonWithText(label: string): HTMLButtonElement | undefined {
  return [...win.document.querySelectorAll("button")].find((node) => node.textContent?.trim() === label) ??
    [...win.document.querySelectorAll("button")].find((node) => node.textContent?.includes(label));
}

function buttonByLabel(label: string): HTMLButtonElement | null {
  if (label === "Base") {
    // The big Base button has a subtitle under its name.
    return (
      [...win.document.querySelectorAll("button")].find((node) =>
        node.textContent?.startsWith("BaseNo color"),
      ) ?? null
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


function fire(el: object, event: object) {
  (el as { dispatchEvent(ev: object): void }).dispatchEvent(event);
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
  fire(el, new win.Event("input", { bubbles: true }));
  fire(el, new win.Event("change", { bubbles: true }));
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
    mode: "supabase" as const,
    user: social.user,
    createPost: async (draft: Saved) => {
      if (social.postError) return { error: social.postError, postId: null };
      social.posts.push(draft);
      return { error: null, postId: `post-${social.posts.length}` };
    },
  };
  let stored: Saved[] = [];
  const collection = {
    ready: true,
    loaded: true,
    cards: stored,
    syncError: null,
    getCard: () => undefined,
    addCard: (input: Saved) => {
      capture.push(input);
      const card = { ...input, id: (input.id as string) ?? "new-card", createdAt: "2026-11-10T00:00:00Z", updatedAt: "2026-11-10T00:00:00Z" };
      stored = [card];
      collection.cards = stored;
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
  social: Social = { user: null, postError: null, posts: [] },
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

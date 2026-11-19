import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDom } from "@/lib/test/dom";
import { CollectionContext } from "@/components/collection-provider";
import { LONG_PRESS_MS } from "@/components/collection-grid";
import { Dashboard } from "@/components/dashboard";
import { SocialContext } from "@/components/social-provider";
import { mergeCategories } from "@/lib/card-category";
import { mapCardRow as cardFromRow, type CardRow } from "@/lib/social/cards";
import type { SportsCard } from "@/lib/types";
import { pressTick } from "@/lib/ui/press-tick";
import type { CardValueResult } from "@/lib/value/types";

// Registered before installDom's own teardown: lets the screen's idle timers
// and value reads settle while the window is still there.
after(() => new Promise((resolve) => setTimeout(resolve, 2500)));
const { win, state } = installDom();

const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};
const { PathnameContext, SearchParamsContext } = require("next/dist/shared/lib/hooks-client-context.shared-runtime") as {
  PathnameContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
  SearchParamsContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};
const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };
const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

const OWNER = "owner-fixture";

function row(id: string, partial: Partial<CardRow> = {}): CardRow {
  return {
    id,
    user_id: OWNER,
    player: `Player ${id}`,
    year: 2020,
    set: "Prizm",
    grade: "PSA 10",
    parallel: "Base",
    paid_price: null,
    estimated_value: 0,
    image_url: null,
    card_number: "1",
    sport: "Basketball",
    purchase_date: null,
    sell_price: null,
    sell_date: null,
    notes: null,
    accent: null,
    is_public: true,
    category: "pc",
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: null,
    year_label: "2020",
    sold_at: null,
    ...partial,
  };
}

/** Six cards: a, b, c are Personal, d, e, f are Flipping. Newest last. Values fall from a ($105) to f ($100). */
const rows = ["a", "b", "c", "d", "e", "f"].map((id, index) =>
  row(id, {
    category: index < 3 ? "pc" : "flipping",
    created_at: `2026-10-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
  }),
);
const cards = () => mergeCategories(rows.map(cardFromRow)).cards;
const values: Record<string, CardValueResult> = Object.fromEntries(
  rows.map((item, index) => [
    item.id,
    { status: "ok", median: 105 - index, low: 90, high: 120, nSales: 3, matchedAt: "2026-11-01T00:00:00.000Z" },
  ]),
);

let root: Root | null = null;
let host: HTMLElement;
let updates: { id: string; patch: Partial<SportsCard> }[] = [];

beforeEach(() => {
  win.localStorage.clear();
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  updates = [];
  state.reducedMotion = false;
  (globalThis as { fetch?: unknown }).fetch = async () =>
    new Response(JSON.stringify({ values }), { status: 200, headers: { "content-type": "application/json" } });
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
});

function screen(list: SportsCard[]) {
  const collection = {
    ready: true,
    loaded: true,
    loadFailed: false,
    cards: list,
    syncError: null,
    getCard: (id: string) => list.find((card) => card.id === id),
    reload: async () => list,
    updateCard: (id: string, patch: Partial<SportsCard>) => {
      updates.push({ id, patch });
      return { card: list.find((card) => card.id === id), saved: Promise.resolve() };
    },
    removeCard: () => {},
    addCard: () => ({}),
  };
  const social = { ready: true, mode: "supabase", user: { id: OWNER, username: "owner" }, profiles: [], posts: [] };
  return createElement(
    AppRouterContext.Provider,
    { value: router },
    createElement(
      PathnameContext.Provider,
      { value: "/collection" },
      createElement(
        SearchParamsContext.Provider,
        { value: new URLSearchParams() },
        createElement(
          SocialContext.Provider,
          { value: social as never },
          createElement(CollectionContext.Provider, { value: collection as never }, createElement(Dashboard)),
        ),
      ),
    ),
  );
}

async function mount(list = cards()) {
  await act(async () => root!.render(screen(list)));
  // The values read lands.
  await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
}

const sheet = () => document.querySelector<HTMLElement>("[data-collection-sheet] [role='dialog']");
const sheetTitle = () => sheet()?.querySelector("h2")?.textContent ?? null;
const tileIds = () =>
  [...host.querySelectorAll('ul[aria-label="Your cards"] [data-tile]')].map((node) => node.getAttribute("data-tile"));

function named(scope: ParentNode, name: RegExp): HTMLElement {
  const found = [...scope.querySelectorAll<HTMLElement>("button, a")].find((node) =>
    name.test(node.getAttribute("aria-label") ?? node.textContent ?? ""),
  );
  assert.ok(found, String(name));
  return found;
}

async function click(node: HTMLElement) {
  await act(async () => node.click());
}

function key(name: string, target: EventTarget = document, shift = false) {
  act(() => {
    target.dispatchEvent(new win.KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, shiftKey: shift }));
  });
}

function pointer(node: Element, type: string, x = 10, y = 10, pointerType = "touch") {
  act(() => {
    const event = new win.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
    Object.defineProperty(event, "pointerType", { value: pointerType });
    Object.defineProperty(event, "pointerId", { value: 1 });
    node.dispatchEvent(event);
  });
}

const wait = (ms: number) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));

describe("Collection redesign: what is on the page", () => {
  it("goes hero, stat strip, tools, grid, with no opt-in block and no share card in the scroll", async () => {
    await mount();
    const order = ['section[aria-label="Collection value"]', '[data-slot="collection-stats"]', '[data-slot="collection-tools"]', 'ul[aria-label="Your cards"]'].map(
      (selector) => host.querySelector(selector),
    );
    for (const node of order) assert.ok(node);
    for (let i = 1; i < order.length; i++) {
      assert.ok(order[i - 1]!.compareDocumentPosition(order[i]!) & win.Node.DOCUMENT_POSITION_FOLLOWING, `block ${i} follows block ${i - 1}`);
    }
    assert.equal(host.querySelector("#show-on-leaderboards"), null);
    assert.equal(host.querySelector("[data-share-collection]"), null);
    const words = host.textContent ?? "";
    for (const gone of [
      "Show me on leaderboards",
      "Your public cards can appear",
      "trusted cards worth",
      "Share my collection",
      "Save for Stories",
      "public cards",
      "Price moves only",
      "Your most valuable",
      "Market price change, past 7 days",
      "No price moves this week yet",
    ]) {
      assert.equal(words.includes(gone), false, gone);
    }
    assert.equal(host.querySelectorAll("h1").length, 1);
  });

  it("keeps Geist weights at 600 and under, and brand purple only, in every file it touches", () => {
    for (const file of [
      "components/dashboard.tsx",
      "components/portfolio-hero.tsx",
      "components/collection-movers.tsx",
      "components/collection-actions.tsx",
      "components/collection-share-sheet-view.tsx",
      "components/collection-leaderboard-sheet-view.tsx",
      "components/collection-sheet.tsx",
      "components/collection-tile-actions.tsx",
      "components/collection-grid.tsx",
    ]) {
      const source = read(file);
      assert.doesNotMatch(source, /font-(bold|extrabold|black)\b/, file);
      assert.doesNotMatch(source, /\b(teal|cyan|emerald)-\d/, file);
      assert.doesNotMatch(source, /transition-all/, file);
    }
  });

  it("draws the purple light behind the hero in layers, and stills every new motion for Reduce Motion", () => {
    const css = read("app/globals.css");
    const bloom = css.slice(css.indexOf(".collection-hero::before"), css.indexOf(".hero-chart [data-chart-line]"));
    assert.ok((bloom.match(/radial-gradient\(/g) ?? []).length >= 4, "two lights, light and dark");
    assert.match(bloom, /124 58 237/);
    assert.doesNotMatch(bloom, /teal|20 184 166|13 148 136/);
    assert.match(css, /\.hero-chart \[data-chart-line\] \{\s*filter: drop-shadow\(/);
    const still = css.slice(css.indexOf(".lane-scroll {"));
    const reduced = still.slice(still.indexOf("@media (prefers-reduced-motion: reduce)"), still.indexOf("/* Quick Comp's manual"));
    assert.match(reduced, /\.lane-in-a,\s*\.lane-in-b \{\s*animation: none;/);
    assert.match(reduced, /\.collection-grid \[data-tile\] > a \{\s*transition: none;/);
    // Tile prices are Geist Mono, on Collection only.
    assert.match(css, /\.collection-grid \[data-price\] \{\s*font-family: var\(--font-geist-mono\)/);
  });
});

describe("Collection redesign: one share control", () => {
  it("opens Share, Post on X and Save for Stories in a sheet that holds focus and gives it back", async () => {
    await mount();
    const open = named(host, /^Share my collection$/);
    assert.equal(open.getAttribute("aria-haspopup"), "dialog");
    assert.equal(sheet(), null);
    open.focus();
    await click(open);
    const dialog = sheet();
    assert.ok(dialog);
    assert.equal(dialog.getAttribute("aria-modal"), "true");
    assert.equal(sheetTitle(), "Share my collection");
    assert.equal(document.getElementById(dialog.getAttribute("aria-labelledby") ?? "")?.textContent, "Share my collection");
    named(dialog, /^Share$/);
    assert.equal(named(dialog, /^Share to X$/).tagName, "A");
    named(dialog, /^Save for Stories$/);
    assert.ok(dialog.querySelector('img[alt="Preview of your collection link"]'), "the share image, as before");
    // Focus is inside, and Tab from the last control comes back round to the first.
    assert.ok(dialog.contains(document.activeElement));
    const stops = [...dialog.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]")];
    stops[stops.length - 1].focus();
    key("Tab");
    assert.ok(document.activeElement === stops[0]);
    key("Tab", document, true);
    assert.ok(document.activeElement === stops[stops.length - 1]);
    key("Escape");
    assert.equal(sheet(), null);
    assert.ok(document.activeElement === open, "focus is back on the share control");
  });
});

describe("Collection redesign: tools bar", () => {
  it("sorts and filters from one sheet, and marks the icon when either is on", async () => {
    await mount();
    assert.deepEqual(tileIds(), ["a", "b", "c", "d", "e", "f"], "by value");
    const open = named(host, /^Sort and filter\. Sorted by Value\.$/);
    assert.equal(host.querySelector('[data-slot="tools-dot"]'), null);
    open.focus();
    await click(open);
    assert.equal(sheetTitle(), "Sort and filter");
    const dialog = sheet()!;
    const sorts = [...dialog.querySelectorAll<HTMLElement>("[data-sort]")];
    // No card has a price paid: Gain is not offered.
    assert.deepEqual(sorts.map((node) => node.textContent), ["Value", "Recently added"]);
    assert.equal(sorts[0].getAttribute("aria-pressed"), "true");
    await click(sorts[1]);
    assert.deepEqual(tileIds(), ["f", "e", "d", "c", "b", "a"], "newest first");
    assert.ok(host.querySelector('[data-slot="tools-dot"]'));
    assert.match(open.getAttribute("aria-label") ?? "", /^Sort and filter\. Sorted by Recently added\.$/);
    await click(named(dialog, /^Held$/));
    assert.match(open.getAttribute("aria-label") ?? "", /Sorted by Recently added, showing Held\.$/);
    for (const node of dialog.querySelectorAll<HTMLElement>("button")) {
      assert.match(node.className, /\bh-11\b|\bhit-44\b/, node.textContent ?? "");
    }
    key("Escape");
    assert.equal(sheet(), null);
    assert.ok(document.activeElement === open);
  });

  it("opens search over the lanes from its icon, and closes it empty", async () => {
    await mount();
    assert.equal(host.querySelector('input[type="search"]'), null);
    await click(named(host, /^Search your cards$/));
    const input = host.querySelector<HTMLInputElement>('input[type="search"]');
    assert.ok(input);
    assert.ok(document.activeElement === input);
    assert.equal(host.querySelector('[role="tablist"]'), null, "the search takes the lanes' row");
    await click(named(host, /^Close search$/));
    assert.equal(host.querySelector('input[type="search"]'), null);
    assert.ok(host.querySelector('[role="tablist"]'));
  });

  it("keeps the lane tabs, their panel and the arrow keys in step", async () => {
    await mount();
    const tabs = () => [...host.querySelectorAll<HTMLElement>('[role="tab"]')];
    const panel = () => host.querySelector<HTMLElement>('[role="tabpanel"]')!;
    assert.deepEqual(tabs().map((tab) => tab.textContent), ["All", "Flipping", "Personal", "Want list"]);
    assert.equal(panel().getAttribute("aria-label"), "All");
    assert.equal(panel().id, tabs()[0].getAttribute("aria-controls"));
    assert.doesNotMatch(panel().className, /lane-in/, "no fade on first load: the tiles stagger in instead");
    tabs()[0].focus();
    key("ArrowRight", tabs()[0]);
    assert.equal(tabs()[1].getAttribute("aria-selected"), "true");
    assert.equal(tabs()[1].tabIndex, 0);
    assert.equal(tabs()[0].tabIndex, -1);
    assert.ok(document.activeElement === tabs()[1]);
    assert.equal(panel().getAttribute("aria-label"), "Flipping");
    assert.deepEqual(tileIds(), ["d", "e", "f"]);
    assert.match(panel().className, /lane-in-a/);
    await click(tabs()[2]);
    assert.equal(panel().getAttribute("aria-label"), "Personal");
    assert.match(panel().className, /lane-in-b/, "the fade runs again, on the same tiles");
    key("ArrowLeft", tabs()[2]);
    key("ArrowLeft", tabs()[1]);
    assert.equal(tabs()[0].getAttribute("aria-selected"), "true");
    assert.deepEqual(tileIds(), ["a", "b", "c", "d", "e", "f"]);
  });
});

describe("Collection redesign: a tile's quick actions", () => {
  const link = (id: string) => host.querySelector<HTMLElement>(`[data-tile="${id}"] > a`)!;

  it("opens on a long press, never on a tap or a scroll, and the press does not open the card", async () => {
    await mount();
    pointer(link("d"), "pointerdown");
    await wait(LONG_PRESS_MS / 2);
    pointer(link("d"), "pointerup");
    await wait(LONG_PRESS_MS);
    assert.equal(sheet(), null, "a tap");

    pointer(link("d"), "pointerdown", 10, 10);
    pointer(link("d"), "pointermove", 10, 40);
    await wait(LONG_PRESS_MS + 60);
    assert.equal(sheet(), null, "a scroll");

    pointer(link("d"), "pointerdown", 10, 10, "mouse");
    await wait(LONG_PRESS_MS + 60);
    assert.equal(sheet(), null, "a held mouse button: right click is the mouse's way in");

    pointer(link("d"), "pointerdown");
    await wait(LONG_PRESS_MS + 60);
    assert.equal(sheetTitle(), "Player d");
    // The click that ends the press is swallowed, once.
    const first = new win.MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => void link("d").dispatchEvent(first));
    assert.equal(first.defaultPrevented, true);
    const second = new win.MouseEvent("click", { bubbles: true, cancelable: true });
    link("d").addEventListener("click", (event) => event.preventDefault(), { once: true });
    act(() => void link("d").dispatchEvent(second));
    assert.equal(sheetTitle(), "Player d");
  });

  it("shares the card, moves it between Flipping and Personal, or edits it: the card page's own actions", async () => {
    await mount();
    pointer(link("d"), "pointerdown");
    await wait(LONG_PRESS_MS + 60);
    const dialog = sheet()!;
    named(dialog, /^Share card$/);
    assert.equal(named(dialog, /^Edit card$/).getAttribute("href"), "/cards/d/edit");
    await click(named(dialog, /^Move to Personal$/));
    assert.deepEqual(updates, [{ id: "d", patch: { category: "pc" } }]);
    assert.equal(sheet(), null);
  });

  it("offers the same sheet from a right click and from a button that shows on keyboard focus", async () => {
    await mount();
    const menu = new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    act(() => void link("a").dispatchEvent(menu));
    assert.equal(menu.defaultPrevented, true);
    assert.equal(sheetTitle(), "Player a");
    named(sheet()!, /^Move to Flipping$/);
    key("Escape");

    const more = named(host.querySelector('[data-tile="b"]')!, /^More actions for Player b$/);
    assert.match(more.className, /\bsr-only\b/);
    assert.match(more.className, /focus:not-sr-only/);
    more.focus();
    await click(more);
    assert.equal(sheetTitle(), "Player b");
    key("Escape");
    assert.ok(document.activeElement === more);
  });
});

describe("Collection redesign: press haptics", () => {
  function withVibrate(run: (calls: number[]) => void) {
    const calls: number[] = [];
    Object.defineProperty(win.navigator, "vibrate", { configurable: true, value: (ms: number) => (calls.push(ms), true) });
    try {
      run(calls);
    } finally {
      delete (win.navigator as { vibrate?: unknown }).vibrate;
    }
  }

  it("ticks where the browser can vibrate, and does nothing where it cannot", () => {
    assert.doesNotThrow(() => pressTick());
    withVibrate((calls) => {
      pressTick();
      pressTick(10);
      assert.deepEqual(calls, [8, 10]);
    });
  });

  it("never vibrates with Reduce Motion on", () => {
    state.reducedMotion = true;
    withVibrate((calls) => {
      pressTick();
      assert.deepEqual(calls, []);
    });
  });

  it("ticks on a lane switch, not on the lane already open", async () => {
    await mount();
    withVibrate((calls) => {
      const tabs = [...host.querySelectorAll<HTMLElement>('[role="tab"]')];
      act(() => tabs[0].click());
      assert.deepEqual(calls, []);
      act(() => tabs[1].click());
      assert.deepEqual(calls, [8]);
    });
  });
});

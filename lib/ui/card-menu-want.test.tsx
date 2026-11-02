import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { act, createElement, type ComponentType, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { installDom } from "@/lib/test/dom";
import { CardDetail } from "@/components/card-detail";
import { CollectionContext } from "@/components/collection-provider";
import { MenuWantButton, WantButtonPending, menuWantButton } from "@/components/menu-want-button";
import { SocialContext, type SocialContextValue } from "@/components/social-provider";
import { mapCardRow, type CardRow } from "@/lib/social/cards";
import { LAZY_PART_RETRY_MS } from "@/lib/ui/lazy-part";

installDom();
// jsdom has no scrolling; the menu scrolls itself into view when it opens.
Element.prototype.scrollIntoView ??= function () {};

const require = createRequire(process.cwd() + "/package.json");
type ProviderType = { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: ProviderType;
};
const { PathnameContext } = require("next/dist/shared/lib/hooks-client-context.shared-runtime") as {
  PathnameContext: ProviderType;
};

const CARD_ID = "22222222-2222-4222-8222-222222222222";
// Fake fixture card only.
const card = mapCardRow({
  id: CARD_ID,
  user_id: "u1",
  player: "Fixture Player",
  year: 2020,
  set: "Prizm",
  grade: "Raw",
  parallel: "Base",
  paid_price: 50,
  estimated_value: 120,
  image_url: null,
  card_number: "100",
  sport: "Basketball",
  purchase_date: "2026-01-01",
  sell_price: null,
  sell_date: null,
  notes: null,
  accent: "#7c5cff",
  is_public: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: null,
} as CardRow);

const pushed: string[] = [];
const removed: string[] = [];
const router = { back() {}, forward() {}, refresh() {}, hmrRefresh() {}, prefetch() {}, replace() {}, push: (href: string) => pushed.push(href) };
const social = {
  user: { id: "u1", username: "tester" },
  homePosts: [],
  profiles: [],
  publicCards: [],
  ready: true,
} as unknown as SocialContextValue;
const collection = {
  ready: true,
  loaded: true,
  loadFailed: false,
  cards: [card],
  syncError: null,
  getCard: (id: string) => (id === CARD_ID ? card : undefined),
  addCard: () => ({ card, saved: Promise.resolve() }),
  updateCard: () => ({ card, saved: Promise.resolve() }),
  removeCard: (id: string) => removed.push(id),
  reload: async () => [card],
};

function page() {
  return createElement(
    AppRouterContext.Provider,
    { value: router },
    createElement(
      PathnameContext.Provider,
      { value: `/cards/${CARD_ID}` },
      createElement(
        SocialContext.Provider,
        { value: social },
        createElement(CollectionContext.Provider, { value: collection }, createElement(CardDetail, { id: CARD_ID })),
      ),
    ),
  );
}

let host: HTMLElement;
let root: Root | null;
const realFetch = globalThis.fetch;

beforeEach(() => {
  // The page's own reads (values, sold prices) answer "unavailable": no network.
  globalThis.fetch = (async () => new Response("{}", { status: 503 })) as typeof fetch;
  host = document.createElement("div");
  document.body.append(host);
  root = null;
  pushed.length = 0;
  removed.length = 0;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host.remove();
  globalThis.fetch = realFetch;
  mock.timers.reset();
});

const menu = () => host.querySelector<HTMLElement>("#card-actions");
const button = (name: string | RegExp) =>
  [...host.querySelectorAll<HTMLButtonElement>("button")].find((node) =>
    typeof name === "string" ? node.textContent?.trim() === name || node.getAttribute("aria-label") === name : name.test(node.textContent ?? ""),
  );

describe("the ⋯ menu with the Want control's chunk not in yet", () => {
  it("opens at once: Est. sell, Edit, Delete and Share are there and work; the Want slot is a disabled placeholder", () => {
    // Nothing awaited between the tap and the checks: the deferred chunk can't have landed.
    root = createRoot(host);
    act(() => root!.render(page()));
    const actions = button("Card actions")!;
    act(() => actions.click());
    const open = menu();
    assert.ok(open, "the menu opened in the same tap");
    assert.match(open!.textContent ?? "", /Est\. sell/);
    assert.ok(open!.querySelector('button[aria-label^="Share"], button[aria-label*="share" i]') || /Share/.test(open!.textContent ?? ""), "share row");

    const want = open!.querySelector<HTMLButtonElement>('button[aria-label="Add to want list"]');
    assert.ok(want, "placeholder in the Want slot");
    assert.equal(want!.disabled, true);
    assert.equal(want!.getAttribute("aria-disabled"), "true");
    assert.match(want!.className, /min-h-11/);

    // Delete works now: it asks first, and removes on yes.
    const confirm = window.confirm;
    window.confirm = () => true;
    act(() => button("Delete")!.click());
    window.confirm = confirm;
    assert.deepEqual(removed, [CARD_ID]);
    assert.deepEqual(pushed, ["/"]);
  });

  it("Edit card works at once from the open menu", () => {
    root = createRoot(host);
    act(() => root!.render(page()));
    act(() => button("Card actions")!.click());
    assert.ok(menu());
    act(() => button(/Edit card/)!.click());
    assert.equal(menu(), null, "Edit closes the menu and opens the editor");
    assert.ok(host.querySelector('[aria-busy="true"]') || host.querySelector("form"), "the editor is on its way");
  });
});

describe("the Want slot", () => {
  const Real: ComponentType<{ card: { id: string } }> = () =>
    createElement("button", { type: "button", "aria-label": "Add to want list", "data-real": "" }, "Add to want list");

  it("swaps the real control in when its chunk resolves", async () => {
    let land!: (component: ComponentType<never>) => void;
    const Slot = menuWantButton(() => new Promise((resolve) => (land = resolve as never)));
    root = createRoot(host);
    act(() => root!.render(createElement(Slot, { card })));
    assert.ok(host.querySelector("button[disabled][aria-disabled='true']"));
    await act(async () => {
      land(Real as never);
      await Promise.resolve();
    });
    assert.ok(host.querySelector("button[data-real]"));
    assert.equal(host.querySelector("button[disabled]"), null);
  });

  it("shows the usual Try again when the chunk fails, after its one retry", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const warn = console.warn;
    console.warn = () => {};
    const Slot = menuWantButton(() => Promise.reject(new Error("ChunkLoadError")));
    root = createRoot(host);
    act(() => root!.render(createElement(Slot, { card })));
    await act(async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });
    await act(async () => {
      mock.timers.tick(LAZY_PART_RETRY_MS);
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });
    console.warn = warn;
    assert.match(host.textContent ?? "", /Couldn.t load this\./);
    assert.ok(button("Try again"));
  });

  it("draws the placeholder on the server and hydrates it with no mismatch", () => {
    // The server never has the chunk; on the client it is held, so this is the first client render.
    const Held = menuWantButton(() => new Promise(() => {}));
    assert.equal(renderToString(createElement(MenuWantButton, { card })), renderToString(createElement(WantButtonPending)));
    const slot = () => createElement(SocialContext.Provider, { value: social }, createElement(Held, { card }));
    const html = renderToString(slot());
    assert.equal(html, renderToString(createElement(WantButtonPending)));
    host.innerHTML = html;
    const before = host.innerHTML;
    const errors: unknown[] = [];
    act(() => {
      root = hydrateRoot(host, slot(), {
        onRecoverableError: (error) => errors.push(error),
      });
    });
    assert.deepEqual(errors, []);
    assert.equal(host.innerHTML, before);
  });

  it("looks like the loaded chip: same classes as WantButton's not-saved state, minus hover", () => {
    const real = readFileSync(join(process.cwd(), "components/want-button.tsx"), "utf8");
    const pending = renderToString(createElement(WantButtonPending));
    for (const cls of ["inline-flex", "min-h-11", "max-w-[12rem]", "rounded-full", "px-3", "py-1.5", "text-sm", "font-semibold", "leading-5", "bg-zinc-100", "text-zinc-700", "dark:bg-white/10", "dark:text-zinc-200"]) {
      assert.ok(real.includes(cls), `WantButton uses ${cls}`);
      assert.ok(pending.includes(cls), `placeholder uses ${cls}`);
    }
    assert.match(pending, /^<div class="relative"><button type="button" disabled=""/);
  });

  it("card-detail opens the menu straight away and loads Want from its own chunk", () => {
    const detail = readFileSync(join(process.cwd(), "components/card-detail.tsx"), "utf8");
    assert.match(detail, /setMenuOpen\(\(open\) => !open\)/);
    assert.doesNotMatch(detail, /from "@\/components\/want-button"/);
    assert.match(readFileSync(join(process.cwd(), "components/menu-want-button.tsx"), "utf8"), /import\("@\/components\/want-button"\)/);
  });
});

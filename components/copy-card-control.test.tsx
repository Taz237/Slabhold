import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDom } from "@/lib/test/dom";
import { CardDetail } from "@/components/card-detail";
import { CollectionContext } from "@/components/collection-provider";
import { SocialContext, type SocialContextValue } from "@/components/social-provider";
import { mapCardRow, type CardRow } from "@/lib/social/cards";

installDom();
Element.prototype.scrollIntoView ??= function () {};

const require = createRequire(process.cwd() + "/package.json");
type ProviderType = { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: ProviderType;
};
const { PathnameContext } = require("next/dist/shared/lib/hooks-client-context.shared-runtime") as {
  PathnameContext: ProviderType;
};

const CARD_ID = "33333333-3333-4333-8333-333333333333";
// Fake fixture card only.
const card = mapCardRow({
  id: CARD_ID,
  user_id: "u1",
  player: "Fixture Guard",
  year: 2024,
  year_label: "2024-25",
  set: "Donruss Optic",
  grade: "PSA 10",
  parallel: "Downtown",
  paid_price: 50,
  estimated_value: null,
  image_url: null,
  card_number: "7",
  sport: "Basketball",
  purchase_date: "2026-01-01",
  sell_price: null,
  sell_date: null,
  notes: "fixture note",
  accent: "#7c5cff",
  is_public: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: null,
} as CardRow);

const router = { back() {}, forward() {}, refresh() {}, hmrRefresh() {}, prefetch() {}, replace() {}, push() {} };
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
  removeCard() {},
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
  globalThis.fetch = (async () => new Response("{}", { status: 503 })) as typeof fetch;
  host = document.createElement("div");
  document.body.append(host);
  root = null;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host.remove();
  globalThis.fetch = realFetch;
});

describe("card page: Copy this card for the owner", () => {
  it("shows a visible 44px Copy this card link with player, year, set and number only", () => {
    root = createRoot(host);
    act(() => root!.render(page()));
    const link = host.querySelector<HTMLAnchorElement>('a[data-slot="copy-card"]');
    assert.ok(link, "visible on the page, not only in the menu");
    assert.equal(link.textContent?.trim(), "Copy this card");
    assert.match(link.getAttribute("aria-label") ?? "", /^Copy this card/);
    assert.match(link.className, /min-h-11/);
    const url = new URL(link.getAttribute("href") ?? "", "https://slabhold.app");
    assert.equal(url.pathname, "/cards/new");
    assert.deepEqual([...url.searchParams.keys()].sort(), ["num", "player", "set", "sport", "year"]);
    assert.equal(url.searchParams.get("num"), "7");
    assert.equal(url.searchParams.get("year"), "2024-25");
    assert.doesNotMatch(link.getAttribute("href") ?? "", /Downtown|PSA|grade|parallel|price|notes|cert/);
  });

  it("puts the same Copy this card href in the ⋯ menu", () => {
    root = createRoot(host);
    act(() => root!.render(page()));
    const underHero = host.querySelector<HTMLAnchorElement>('a[data-slot="copy-card"]');
    assert.ok(underHero);
    const actions = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (node) => node.getAttribute("aria-label") === "Card actions",
    );
    assert.ok(actions, "the ⋯ menu button");
    act(() => actions.click());
    const menu = host.querySelector<HTMLElement>("#card-actions");
    assert.ok(menu, "the menu opened");
    const inMenu = menu.querySelector<HTMLAnchorElement>('a[data-slot="copy-card-menu"]');
    assert.ok(inMenu, "Copy this card is in the menu");
    assert.equal(inMenu.textContent?.trim(), "Copy this card");
    assert.match(inMenu.getAttribute("aria-label") ?? "", /^Copy this card/);
    assert.match(inMenu.className, /min-h-11/);
    assert.equal(inMenu.getAttribute("href"), underHero.getAttribute("href"));
  });
});

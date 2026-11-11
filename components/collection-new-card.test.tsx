import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDom } from "@/lib/test/dom";
import { CollectionContext } from "@/components/collection-provider";
import { SocialContext } from "@/components/social-provider";
import { Dashboard, firstScreenTiles, SEEDED_TILES } from "@/components/dashboard";
import { SeededViewer } from "@/components/viewer-seed";
import { mergeCategories } from "@/lib/card-category";
import { sortGridCards } from "@/lib/collection/grid";
import { cardValuesKey, type CollectionSeed } from "@/lib/collection/viewer-seed";
import { loadUserCards, type CardRow } from "@/lib/social/cards";
import type { SportsCard } from "@/lib/types";
import type { CardValueResult } from "@/lib/value/types";
import { profileCardsTab } from "@/lib/social/profile-tabs";

// Registered before installDom's own teardown: lets the screen's idle timers
// and value reads settle while the window is still there.
after(() => new Promise((resolve) => setTimeout(resolve, 2500)));
installDom();

const require = createRequire(process.cwd() + "/package.json");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};
const { PathnameContext, SearchParamsContext } = require("next/dist/shared/lib/hooks-client-context.shared-runtime") as {
  PathnameContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
  SearchParamsContext: { Provider: (props: { value: unknown; children?: ReactNode }) => ReactNode };
};
const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };

const OWNER = "owner-fixture";
const NEW_ID = "new-card-fixture";

/** A cards row like a guided add saves it: 1990, PSA 6, estimate 0.00, public, Personal. */
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

const older = Array.from({ length: 12 }, (_, index) =>
  row(`old-${index}`, { created_at: `2026-10-${String(index + 1).padStart(2, "0")}T00:00:00.000Z` }),
);
const added = row(NEW_ID, {
  player: "Michael Jordan",
  year: 1990,
  year_label: "1990",
  set: "Skybox",
  card_number: "41",
  grade: "PSA 6",
  grader: "PSA",
  condition_type: "graded",
  // PostgREST returns numeric columns as text.
  estimated_value: "0.00" as unknown as number,
  image_url: "https://example.com/jordan.jpg",
  created_at: "2026-11-11T02:26:00.000Z",
});

/** Every older card has a recent sold value; the new one has none yet. */
const values: Record<string, CardValueResult> = Object.fromEntries(
  older.map((item, index) => [
    item.id,
    { status: "ok", median: 100 + index, low: 90, high: 120, nSales: 3, matchedAt: "2026-11-01T00:00:00.000Z" },
  ]),
);

/** A fake Supabase: `from("cards").select().eq().order()` answers with these rows. */
function fakeSupabase(rows: CardRow[]) {
  const query = {
    select: () => query,
    eq: () => query,
    order: async () => ({ data: rows, error: null }),
  };
  return { from: () => query } as never;
}

let root: Root | null = null;
let host: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  (globalThis as { fetch?: unknown }).fetch = async () =>
    new Response(JSON.stringify({ values }), { status: 200, headers: { "content-type": "application/json" } });
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
});

function social() {
  return { ready: true, mode: "supabase", user: { id: OWNER, username: "owner" }, profiles: [], posts: [] } as never;
}

function collection(cards: SportsCard[]) {
  return {
    ready: true,
    loaded: true,
    loadFailed: false,
    cards,
    syncError: null,
    getCard: (id: string) => cards.find((card) => card.id === id),
    reload: async () => cards,
    updateCard: () => ({}),
    removeCard: () => {},
    addCard: () => ({}),
  } as never;
}

function screen(children: ReactNode, cards: SportsCard[]) {
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
          { value: social() },
          createElement(CollectionContext.Provider, { value: collection(cards) }, children),
        ),
      ),
    ),
  );
}

function tileIds(): string[] {
  return [...host.querySelectorAll('ul[aria-label="Your cards"] a[href^="/cards/"]')]
    .map((link) => link.getAttribute("href") ?? "")
    .filter((href) => /^\/cards\/[^/]+$/.test(href))
    .map((href) => href.slice("/cards/".length));
}

describe("a just-added card in Collection", () => {
  it("reads back from the cards table with its 0.00 estimate, 1990 year and Personal lane", async () => {
    const cards = mergeCategories(await loadUserCards(fakeSupabase([added, ...older]), OWNER)).cards;
    assert.equal(cards.length, 13);
    const jordan = cards.find((card) => card.id === NEW_ID)!;
    assert.equal(jordan.estimatedSellPrice, 0);
    assert.equal(jordan.year, 1990);
    assert.equal(jordan.category, "pc");
    assert.equal(jordan.soldAt, null);
  });

  it("sorts 13th by Value: no sold value yet puts it after the 12 priced cards", async () => {
    const cards = await loadUserCards(fakeSupabase([added, ...older]), OWNER);
    const sorted = sortGridCards(cards, "value", new Map(Object.entries(values)));
    assert.equal(sorted.at(-1)?.id, NEW_ID);
  });

  it("shows right away after Add card, inside the app", async () => {
    const cards = mergeCategories(await loadUserCards(fakeSupabase([added, ...older]), OWNER)).cards;
    act(() => root!.render(screen(createElement(Dashboard), cards)));
    assert.equal(tileIds().length, 13);
    assert.ok(tileIds().includes(NEW_ID));
  });

  it("draws only the server's first screen in HTML, never a capped grid on the client", () => {
    assert.equal(firstScreenTiles(true), SEEDED_TILES);
    assert.equal(firstScreenTiles(false), Number.POSITIVE_INFINITY);
  });

  it("shows after a reload (a server-drawn Collection), in the first commit, with no idle wait", async () => {
    const cards = mergeCategories(await loadUserCards(fakeSupabase([added, ...older]), OWNER)).cards;
    const seed: CollectionSeed = {
      viewer: { id: OWNER, username: "owner" } as never,
      cards,
      values,
      snapshots: [],
      cardHistory: [],
    };
    assert.equal(cardValuesKey(cards.map((card) => card.id)).split(",").length, 13);
    act(() =>
      root!.render(
        screen(
          createElement(SeededViewer, { seed }, createElement(Dashboard, { seed } as never)),
          cards,
        ),
      ),
    );
    // No timers run: the 13th tile is there without waiting for an idle moment.
    assert.equal(tileIds().length, 13);
    assert.ok(tileIds().includes(NEW_ID), "the new card is on the grid");
  });
});

describe("a just-added card on the owner's profile", () => {
  it("keeps two copies of the same card (same year, player and number)", () => {
    const base = { playerName: "Michael Jordan", year: 1990, setBrand: "Skybox", cardNumber: "41", ownerId: OWNER, isPublic: true };
    const shown = profileCardsTab({
      ownerId: OWNER,
      viewerId: OWNER,
      publicCards: [{ ...base, id: "older-copy", grade: "Raw" } as never],
      ownBook: [{ ...base, id: NEW_ID, grade: "PSA 6" } as never],
    });
    assert.deepEqual(shown.map((card) => card.id), ["older-copy", NEW_ID]);
  });
});

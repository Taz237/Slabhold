import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { installDom } from "@/lib/test/dom";
import { CATALOG_PAGE_SIZE, type CatalogPage, type CatalogTile } from "@/lib/public-catalog/query";
import type { MovingTodayPayload, MovingTodaySale } from "@/lib/moving-today/types";

const { win } = installDom();
Object.defineProperty(globalThis, "HTMLInputElement", { configurable: true, writable: true, value: win.HTMLInputElement });

// react-dom reads the DOM when it loads, so it and the components load after installDom.
let createRoot: typeof import("react-dom/client").createRoot;
let CatalogView: typeof import("@/components/catalog-page").CatalogView;
let CardOwnerRow: typeof import("@/components/public-card-view").CardOwnerRow;
before(async () => {
  ({ createRoot } = await import("react-dom/client"));
  ({ CatalogView } = await import("@/components/catalog-page"));
  ({ CardOwnerRow } = await import("@/components/public-card-view"));
});

const router = { push() {}, replace() {}, refresh() {}, prefetch() {}, back() {}, forward() {} };

function wrap(element: ReactNode) {
  return createElement(
    AppRouterContext.Provider,
    { value: router as never },
    createElement(PathnameContext.Provider, { value: "/catalog" }, element),
  );
}

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function tile(n: number, partial: Partial<CatalogTile> = {}): CatalogTile {
  return {
    id: id(n),
    href: `/u/ada/cards/${id(n)}`,
    player: `Player ${n}`,
    yearLabel: "2023-24",
    setName: "Prizm",
    grade: "",
    grader: "",
    conditionType: "raw",
    isRookie: false,
    imageUrl: null,
    accent: "#7c5cff",
    sport: "basketball",
    priceLabel: "",
    ...partial,
  };
}

function page(from: number, count: number, nextOffset: number | null): CatalogPage {
  return { tiles: Array.from({ length: count }, (_, i) => tile(from + i)), nextOffset };
}

function mover(n: number, kind: "mover" | "card" = "mover"): MovingTodaySale {
  return {
    kind,
    cardId: id(500 + n),
    href: `/u/ada/cards/${id(500 + n)}`,
    player: `Mover ${n}`,
    detail: "2023-24 · Prizm",
    yearLabel: "2023-24",
    setBrand: "Prizm",
    grade: "",
    grader: "",
    conditionType: "raw",
    isRookie: false,
    imageUrl: null,
    accent: "#7c5cff",
    priceCents: kind === "mover" ? 20000 : null,
    priceLabel: kind === "mover" ? "$200.00" : "",
    soldLabel: kind === "mover" ? "Oct 22" : undefined,
    percent: kind === "mover" ? 40 : null,
    percentLabel: kind === "mover" ? "+40%" : null,
  };
}

function movers(sales: MovingTodaySale[]): MovingTodayPayload {
  return {
    title: "Moving this week",
    date: "2026-11-16",
    dateLabel: "Nov 10 – Nov 16",
    window: "week",
    sales,
    moverCount: sales.filter((s) => s.kind === "mover").length,
    totalCount: sales.length,
  };
}

let root: Root | null = null;
let host: HTMLElement;
const fetched: string[] = [];
let respond: (url: string) => CatalogPage = () => page(0, 0, null);
let observers: { cb: IntersectionObserverCallback; node: Element | null }[] = [];

beforeEach(() => {
  window.history.replaceState(null, "", "/catalog");
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  fetched.length = 0;
  observers = [];
  respond = () => page(0, 0, null);
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    fetched.push(url);
    return new Response(JSON.stringify(respond(url)), { status: 200 });
  }) as typeof fetch;
  class Observer {
    entry: { cb: IntersectionObserverCallback; node: Element | null };
    constructor(cb: IntersectionObserverCallback) {
      this.entry = { cb, node: null };
      observers.push(this.entry);
    }
    observe(node: Element) {
      this.entry.node = node;
    }
    unobserve() {}
    disconnect() {
      observers = observers.filter((o) => o !== this.entry);
    }
    takeRecords() {
      return [];
    }
  }
  Object.defineProperty(globalThis, "IntersectionObserver", { configurable: true, writable: true, value: Observer });
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
});

function mount(element: ReactNode) {
  act(() => root!.render(wrap(element)));
}

async function flush(ms = 0) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Catalog grid", () => {
  it("shows public cards in a 2-column grid with player, year and set, and no No value yet", () => {
    mount(createElement(CatalogView, { initial: { tiles: [tile(1), tile(2, { priceLabel: "$35.00" })], nextOffset: null } }));
    const grid = host.querySelector("[data-catalog-grid]");
    assert.ok(grid);
    assert.match(grid.className, /grid-cols-2/);
    assert.equal(grid.querySelectorAll("[data-tile]").length, 2);
    const text = grid.textContent ?? "";
    assert.match(text, /Player 1/);
    assert.match(text, /2023-24/);
    assert.match(text, /Prizm/);
    assert.match(text, /\$35\.00/);
    assert.doesNotMatch(text, /No value yet/);
    assert.equal(host.querySelector(`a[href="/u/ada/cards/${id(1)}"]`)?.tagName, "A");
    assert.equal(host.querySelector("h1")?.textContent, "Catalog");
    assert.equal(fetched.length, 0, "the server's first page is used as is");
  });

  it("offers All plus every sport, Newest / Most liked / Graded only, and a search box", () => {
    mount(createElement(CatalogView, { initial: page(1, 2, null) }));
    const sports = [...host.querySelectorAll("[data-sport]")].map((b) => b.textContent);
    assert.deepEqual(sports, ["All", "Baseball", "Basketball", "Football", "Hockey", "Soccer"]);
    const sorts = [...host.querySelectorAll("[data-sort]")].map((b) => b.textContent);
    assert.deepEqual(sorts, ["Newest", "Most liked", "Graded only"]);
    assert.equal(host.querySelector('[data-sort="newest"]')?.getAttribute("aria-checked"), "true");
    assert.ok(host.querySelector('input[type="search"][aria-label="Search by player or set"]'));
  });

  it("reads the next page before the end and appends it without repeats", async () => {
    mount(createElement(CatalogView, { initial: page(1, CATALOG_PAGE_SIZE, CATALOG_PAGE_SIZE) }));
    respond = () => page(CATALOG_PAGE_SIZE, 10, null);
    const watcher = observers.find((o) => o.node?.hasAttribute("data-catalog-more"));
    assert.ok(watcher, "a sentinel waits under the grid");
    await act(async () => {
      watcher.cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    await flush();
    assert.deepEqual(fetched, [`/api/catalog?offset=${CATALOG_PAGE_SIZE}`]);
    assert.equal(host.querySelectorAll("[data-catalog-grid] [data-tile]").length, CATALOG_PAGE_SIZE + 9);
    assert.equal(host.querySelector("[data-catalog-more]"), null, "no sentinel at the end");
  });

  it("switches sort and sport in the URL, with skeletons while the new page loads", async () => {
    mount(createElement(CatalogView, { initial: page(1, 4, null) }));
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetched.push(String(input));
      await gate;
      return new Response(JSON.stringify(page(100, 2, null)), { status: 200 });
    }) as typeof fetch;
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-sort="liked"]')!.click();
    });
    assert.equal(window.location.search, "?sort=liked");
    assert.ok(host.querySelector("[data-catalog-skeleton]"), "skeletons, not a spinner");
    assert.equal(host.querySelector("[data-catalog-grid]"), null);
    release();
    await flush();
    assert.deepEqual(fetched, ["/api/catalog?sort=liked"]);
    assert.equal(host.querySelectorAll("[data-catalog-grid] [data-tile]").length, 2);

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-sport="football"]')!.click();
    });
    await flush();
    assert.equal(window.location.search, "?sport=football&sort=liked");
    assert.equal(fetched.at(-1), "/api/catalog?sport=football&sort=liked");
  });

  it("searches by player or set after typing settles", async () => {
    mount(createElement(CatalogView, { initial: page(1, 4, null) }));
    const input = host.querySelector<HTMLInputElement>('input[type="search"]')!;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(input, "Topps");
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    assert.equal(input.value, "Topps");
    assert.ok(host.querySelector('button[aria-label="Clear search"]'), "typed");
    assert.equal(fetched.length, 0, "no read on every keystroke");
    await flush(350);
    await flush();
    assert.deepEqual(fetched, ["/api/catalog?q=Topps"]);
    assert.equal(window.location.search, "?q=Topps");
    assert.match(host.querySelector("[data-catalog-no-match]")?.textContent ?? "", /No cards match "Topps"/);
  });

  it("shows a designed empty state with no public cards at all", () => {
    mount(createElement(CatalogView, { initial: { tiles: [], nextOffset: null }, signedIn: true }));
    assert.ok(host.querySelector("[data-catalog-empty]"));
    assert.equal(host.querySelector('[data-catalog-empty] a')?.getAttribute("href"), "/cards/new");
  });
});

describe("Moving this week row", () => {
  it("shows only movers, in a small row at the top, with no See all", () => {
    mount(
      createElement(CatalogView, {
        initial: page(1, 2, null),
        movers: movers([mover(1), mover(2), mover(3, "card")]),
      }),
    );
    const row = host.querySelector("[data-catalog-movers]");
    assert.ok(row);
    assert.equal(row.getAttribute("aria-label"), "Moving this week");
    assert.equal(row.querySelectorAll("[data-tile]").length, 2);
    assert.doesNotMatch(row.textContent ?? "", /Mover 3|See all/);
    const order = [...host.querySelectorAll("[data-catalog-movers], [data-catalog-grid]")].map((n) =>
      n.hasAttribute("data-catalog-movers") ? "movers" : "grid",
    );
    assert.deepEqual(order, ["movers", "grid"]);
  });

  it("is hidden when nothing is moving", () => {
    mount(createElement(CatalogView, { initial: page(1, 2, null), movers: movers([mover(1, "card")]) }));
    assert.equal(host.querySelector("[data-catalog-movers]"), null);
    act(() => root!.render(wrap(createElement(CatalogView, { initial: page(1, 2, null), movers: null }))));
    assert.equal(host.querySelector("[data-catalog-movers]"), null);
    assert.doesNotMatch(host.textContent ?? "", /Prices are quiet/);
  });
});

describe("Card page owner", () => {
  it("shows the owner's avatar and @handle linked to their profile, holding Follow's room until ready", () => {
    mount(
      createElement(CardOwnerRow, {
        owner: { id: id(900), username: "ada", displayName: "Ada", avatarUrl: null },
        followReady: false,
      }),
    );
    const link = host.querySelector<HTMLAnchorElement>("[data-card-owner] a");
    assert.equal(link?.getAttribute("href"), "/u/ada");
    assert.match(link?.textContent ?? "", /@ada/);
    assert.equal(link?.getAttribute("aria-label"), "Ada, @ada");
  });

  it("draws Follow on the public card page once the viewer is known", () => {
    const view = read("components/public-card-view.tsx");
    assert.match(view, /<CardOwnerRow owner=\{owner\} followReady=\{followReady\} \/>/);
    assert.match(view, /<FollowButton userId=\{owner\.id\} \/>/);
    assert.match(view, /followReady\n/);
  });
});

describe("Catalog route", () => {
  it("replaces Moving today: /moving-today sends readers to /catalog", () => {
    const old = read("app/(app)/moving-today/page.tsx");
    assert.match(old, /redirect\(/);
    assert.match(old, /CATALOG_PATH/);
    const page = read("app/(app)/catalog/page.tsx");
    assert.match(page, /readCatalogPage\(filters, 0\)/);
    assert.match(page, /getMovingToday\(\)/);
  });
});

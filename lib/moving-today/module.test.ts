import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, it } from "node:test";
import { join } from "node:path";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { installDom } from "@/lib/test/dom";
import {
  MovingQuiet,
  MovingToday,
  MovingTodayPanel,
  MovingTodaySkeleton,
  RAIL_FIRST_TILES,
} from "@/components/moving-today";
import { MovingTodayAll } from "@/components/moving-today-page";
import {
  createTtlCache,
  MOVING_TODAY_CACHE_SECONDS,
  MOVING_TODAY_ERROR_CACHE_MS,
  movingTodayCacheControl,
} from "./cache";
import {
  compactRangeLabel,
  countUpText,
  defaultDirection,
  directionCounts,
  directionTiles,
  filtersFromSearch,
  moveBadgeText,
  moverFreshness,
  moverGain,
  MOVING_RAIL_COUNT,
  movingQuery,
  noMatchText,
  parseDirection,
  parseSport,
  sportChips,
} from "./rail";
import type { MovingTodayPayload, MovingTodaySale } from "./types";

const { state } = installDom();

const prefetched: string[] = [];
const pushed: string[] = [];
const router = {
  push: (href: string) => {
    pushed.push(href);
  },
  replace: () => {},
  refresh: () => {},
  prefetch: (href: string) => {
    prefetched.push(href);
  },
  back: () => {},
  forward: () => {},
};

function withRouter(element: ReactNode) {
  return createElement(AppRouterContext.Provider, { value: router as never }, element);
}

function html(element: ReactNode) {
  return renderToStaticMarkup(withRouter(element));
}

let root: Root | null = null;
let host: HTMLElement;

beforeEach(() => {
  // Each test starts on a URL with no filters, like a fresh visit.
  window.history.replaceState(null, "", "/");
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  state.reducedMotion = false;
  prefetched.length = 0;
  pushed.length = 0;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
});

function mount(element: ReactNode) {
  act(() => root!.render(withRouter(element)));
}

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function id(n: number) {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function sale(n: number, partial: Partial<MovingTodaySale> = {}): MovingTodaySale {
  return {
    kind: "mover",
    cardId: id(n),
    href: `/u/ada/cards/${id(n)}`,
    player: `Player ${n}`,
    detail: "2023-24 · Prizm · PSA 10",
    yearLabel: "2023-24",
    setBrand: "Prizm",
    grade: "PSA 10",
    grader: "PSA",
    conditionType: "graded",
    isRookie: false,
    imageUrl: null,
    accent: "#7c5cff",
    priceCents: 20000,
    priceLabel: "$200.00",
    soldOn: "2026-10-22",
    soldLabel: "Oct 22",
    percent: 40,
    percentLabel: "+40%",
    ...partial,
  };
}

function payload(count: number, partial: Partial<MovingTodayPayload> = {}): MovingTodayPayload {
  return {
    title: "Moving this week",
    date: "2026-10-29",
    dateLabel: "Oct 23 – Oct 29",
    window: "week",
    updatedAt: "2026-10-29T13:30:00.000Z",
    sales: Array.from({ length: count }, (_, n) => {
      const percent = n % 3 === 2 ? -(60 - n) : 120 - n;
      return sale(n + 1, { percent, percentLabel: `${percent > 0 ? "+" : "−"}${Math.abs(percent)}%` });
    }),
    moverCount: count,
    totalCount: count,
    ...partial,
  };
}

/** A plain public card: no percent, ever. */
function cardTile(n: number, partial: Partial<MovingTodaySale> = {}): MovingTodaySale {
  return sale(n, {
    kind: "card",
    percent: null,
    percentLabel: null,
    soldOn: undefined,
    soldLabel: undefined,
    priceCents: null,
    priceLabel: "",
    ...partial,
  });
}

/** Movers first, then cards, as the server builds it. */
function mixed(movers: number, cards: number, partial: Partial<MovingTodayPayload> = {}): MovingTodayPayload {
  const base = payload(movers);
  const sales = [
    ...base.sales,
    ...Array.from({ length: cards }, (_, n) => cardTile(100 + n, n % 2 === 0 ? { isNew: true } : { priceCents: 1250, priceLabel: "$12.50" })),
  ];
  return { ...base, sales, moverCount: movers, totalCount: sales.length, ...partial };
}

function classOf(markup: string, attr: string): string {
  const match = new RegExp(`<[^>]*${attr}[^>]*class="([^"]*)"|<[^>]*class="([^"]*)"[^>]*${attr}`).exec(markup);
  return match?.[1] ?? match?.[2] ?? "";
}

describe("Movers rail", () => {
  it("renders shared CardTiles, biggest move first, then See all N", async () => {
    const out = html(createElement(MovingTodayPanel, { payload: payload(15) }));
    // The first paint hydrates the tiles near the screen. The rest follow at idle.
    assert.equal((out.match(/data-tile="/g) ?? []).length, RAIL_FIRST_TILES);
    mount(createElement(MovingTodayPanel, { payload: payload(15) }));
    // First mount in this file: the tiles on screen fade in, staggered.
    const entering = [...host.querySelectorAll<HTMLElement>("[data-tile]")].filter((tile) =>
      tile.className.includes("animate-[tile-in_240ms"),
    );
    assert.deepEqual(
      entering.map((tile) => tile.style.animationDelay),
      ["0ms", "35ms", "70ms"],
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    assert.equal(host.querySelectorAll("[data-tile]").length, MOVING_RAIL_COUNT);
    assert.equal(host.querySelector("[data-mover-rail] > li:last-child [data-see-all-tile]")?.textContent, "See all 15");
    assert.match(out, /data-density="compact"/);
    assert.match(out, /data-gain="up"[^>]*class="[^"]*emerald/);
    assert.match(out, /data-gain="down"[^>]*class="[^"]*rose/);
    assert.match(out, /data-kind="slab"/);
    assert.match(out, /See all 15/);
    assert.match(out, /aria-label="See all 15 cards"/);
    assert.match(out, /href="\/moving-today"/);
    assert.match(out, /data-no-pull=""/);
    assert.match(out, /snap-x snap-mandatory scroll-px-4/);
    assert.match(out, /\[scrollbar-width:none\]/);
    assert.ok(out.indexOf("Player 1<") < out.indexOf("Player 2<"));
    // The sold date is left off the rail to save a line.
    assert.doesNotMatch(out, /Sold Oct 22/);
  });

  it("keeps the header to one line with no share button", () => {
    const out = html(createElement(MovingTodayPanel, { payload: payload(5) }));
    assert.match(out, /<h2[^>]*text-\[15px\][^>]*>Moving this week<\/h2>/);
    assert.match(out, /font-mono">· Oct 23–29/);
    assert.doesNotMatch(out, /aria-label="Share"/);
    assert.doesNotMatch(out, /Oct 23 – Oct 29/);
    assert.match(out, /text-\[#7C3AED\] dark:text-\[#A78BFA\]/);
    assert.match(out, /class="py-3"/);
    assert.doesNotMatch(classOf(out, "data-moving-today"), /border/);
  });

  it("sizes tiles at 120px and the top mover at 132px with its badge and glow", () => {
    const out = html(createElement(MovingTodayPanel, { payload: payload(4) }));
    const first = classOf(out, `data-tile="${id(1)}"`);
    const second = classOf(out, `data-tile="${id(2)}"`);
    assert.match(first, /w-\[132px\]/);
    assert.match(first, /drop-shadow-\[0_10px_22px_rgba\(124,58,237/);
    assert.match(second, /w-\[120px\]/);
    assert.doesNotMatch(second, /rgba\(124,58,237/);
    assert.match(out, /data-top-badge=""[^>]*>Up 120%</);
    // Past the third tile, the rail skips layout and paint until swiped near.
    assert.doesNotMatch(classOf(out, `data-tile="${id(3)}"`), /content-visibility/);
    assert.match(classOf(out, `data-tile="${id(4)}"`), /\[content-visibility:auto\]/);
    assert.equal((out.match(/data-top-badge/g) ?? []).length, 1);
  });

  it("shows the quiet row only with zero public cards", () => {
    const out = html(createElement(MovingTodayPanel, { payload: payload(0) }));
    assert.doesNotMatch(out, /data-tile=/);
    assert.match(out, /data-moving-today="quiet"/);
    assert.match(out, /Prices are quiet this week\./);
    assert.match(out, /Add a card to see its comps/);
    assert.match(out, /href="\/cards\/new"/);
    for (const count of [1, 2, 3]) {
      assert.match(html(createElement(MovingTodayPanel, { payload: payload(count) })), /data-tile=/);
    }
    // No movers, only cards: still a full rail, never the quiet row.
    const fresh = html(createElement(MovingTodayPanel, { payload: mixed(0, 5, { title: "Fresh on Slabhold", window: "fresh", dateLabel: "" }) }));
    assert.match(fresh, /data-tile=/);
    assert.doesNotMatch(fresh, /quiet/);
    assert.equal(html(createElement(MovingQuiet)).includes("$0"), false);
  });

  it("shows plain cards after movers with a New chip or their value, never a percent", () => {
    const out = html(createElement(MovingTodayPanel, { payload: mixed(2, 2) }));
    const tiles = out.split("data-tile=").slice(1);
    assert.equal(tiles.length, 4);
    assert.match(tiles[0]!, /data-gain="up"/);
    assert.doesNotMatch(tiles[2]!, /data-gain=/);
    assert.match(tiles[2]!, /data-new-chip=""[^>]*>New</);
    assert.doesNotMatch(tiles[3]!, /data-gain=|data-new-chip/);
    assert.match(tiles[3]!, /\$12\.50/);
    assert.equal((out.match(/data-gain-text/g) ?? []).length, 2);
  });

  it("gives a card in first place no glow and no Up badge, at the same width", () => {
    const out = html(createElement(MovingTodayPanel, { payload: mixed(0, 4, { window: "fresh", title: "Fresh on Slabhold", dateLabel: "" }) }));
    const first = classOf(out, `data-tile="${id(100)}"`);
    assert.match(first, /w-\[132px\]/);
    assert.doesNotMatch(first, /rgba\(124,58,237/);
    assert.doesNotMatch(out, /data-top-badge/);
    assert.match(out, /<h2[^>]*>Fresh on Slabhold<\/h2>/);
    assert.match(out, /data-live-dot="week"[^>]*class="[^"]*bg-zinc-400/);
  });

  it("shows at most 12 tiles, and the See all N end tile only past 12", async () => {
    mount(createElement(MovingTodayPanel, { payload: mixed(2, 18) }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    assert.equal(host.querySelectorAll("[data-tile]").length, 12);
    assert.equal(host.querySelector("[data-see-all-tile]")?.textContent, "See all 20");
    act(() => root!.render(withRouter(null)));
    mount(createElement(MovingTodayPanel, { payload: mixed(2, 10) }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    assert.equal(host.querySelectorAll("[data-tile]").length, 12);
    assert.equal(host.querySelector("[data-see-all-tile]"), null);
    // The header link always leads to See all.
    assert.ok(host.querySelector('a[aria-label="See all 12 cards"]'));
  });

  it("gates every animation on motion-safe", () => {
    const out = html(createElement(MovingTodayPanel, { payload: payload(8, { window: "day", title: "Moving today" }) }));
    const classes = [...out.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/));
    const animated = classes.filter((name) => /animate-/.test(name));
    assert.ok(animated.length > 0);
    for (const name of animated) assert.match(name, /^motion-safe:/, name);
    const skeleton = html(createElement(MovingTodaySkeleton));
    assert.doesNotMatch(skeleton, /animate-/);
    const css = read("app/globals.css");
    assert.match(css, /@keyframes live-dot/);
    assert.match(css, /prefers-reduced-motion[\s\S]*skeleton-shimmer|skeleton-shimmer[\s\S]*prefers-reduced-motion/);
  });

  it("fades in on first paint only, not when the lane comes back", () => {
    // The first test above mounted the rail once already.
    mount(createElement(MovingTodayPanel, { payload: payload(6) }));
    assert.doesNotMatch(host.innerHTML, /animate-\[tile-in/);
    // The chips keep their real numbers when there is no entrance to ride on.
    assert.match(host.innerHTML, /data-gain-text="">\+120%</);
  });

  it("shows freshness only on the client, from the real updatedAt", () => {
    const server = html(createElement(MovingTodayPanel, { payload: payload(4) }));
    assert.doesNotMatch(server, /Updated/);
    mount(createElement(MovingTodayPanel, { payload: payload(4, { updatedAt: new Date(Date.now() - 12 * 60_000).toISOString() }) }));
    assert.match(host.textContent ?? "", /Updated 12m ago/);
    assert.match(host.innerHTML, /max-\[399px\]:hidden">Updated <\/span>12m ago/);
    assert.doesNotMatch(host.textContent ?? "", /Live/);
    act(() => root!.render(withRouter(null)));
    mount(
      createElement(MovingTodayPanel, {
        payload: payload(6, {
          title: "Moving today",
          window: "day",
          dateLabel: "Oct 29",
          updatedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
        }),
      }),
    );
    assert.match(host.textContent ?? "", /Live · Updated 5m ago/);
    assert.match(host.innerHTML, /data-live-dot="day"[^>]*class="[^"]*emerald/);
    act(() => root!.render(withRouter(null)));
    mount(createElement(MovingTodayPanel, { payload: payload(4, { updatedAt: undefined }) }));
    assert.doesNotMatch(host.textContent ?? "", /Updated|Live/);
  });

  it("never prefetches on pointerdown; only the tiles on screen prefetch", () => {
    mount(createElement(MovingTodayPanel, { payload: payload(8) }));
    for (const link of host.querySelectorAll("a")) {
      act(() => {
        link.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }));
      });
    }
    assert.deepEqual(prefetched, []);
    const source = read("components/moving-today.tsx");
    assert.doesNotMatch(source, /useWarmOnPointerDown|router\.prefetch|onPointerDown=/);
    assert.match(source, /prefetch=\{index < RAIL_PREFETCH_TILES\}/);
    assert.match(source, /export const RAIL_PREFETCH_TILES = RAIL_PAINTED_TILES;/);
    assert.match(source, /const RAIL_PAINTED_TILES = 3;/);
    // Full prefetch: the auto prefetch of an ISR route with new params only fetches the route tree.
    assert.match(source, /prefetch=\{prefetch\}/);
    const page = read("components/moving-today-page.tsx");
    assert.doesNotMatch(page, /useWarmOnPointerDown|onPointerDown=/);
    assert.match(page, /prefetch=\{index < PAINTED_TILES\}/);
    assert.match(source, /href=\{MOVING_TODAY_PATH\}\s+prefetch=\{false\}/);
    assert.doesNotMatch(source, /CardThumb|max-md:pr-20|w-\[38%\]/);
  });

  it("opens a tile after a tiny drift the scroller took, and never after a swipe", () => {
    mount(createElement(MovingTodayPanel, { payload: payload(4) }));
    const rail = host.querySelector("[data-mover-rail]")!;
    const link = rail.querySelector<HTMLAnchorElement>("a[href^='/u/']")!;
    const href = link.getAttribute("href");
    const touch = (start: [number, number], end: [number, number], cancel: boolean) => {
      act(() => {
        link.dispatchEvent(
          new window.PointerEvent("pointerdown", {
            bubbles: true,
            pointerType: "touch",
            isPrimary: true,
            clientX: start[0],
            clientY: start[1],
          }),
        );
        if (cancel) link.dispatchEvent(new window.PointerEvent("pointercancel", { bubbles: true }));
        const end_ = new window.Event("touchend", { bubbles: true });
        Object.defineProperty(end_, "changedTouches", { value: [{ clientX: end[0], clientY: end[1] }] });
        link.dispatchEvent(end_);
      });
    };
    touch([50, 100], [55, 102], true);
    assert.deepEqual(pushed, [href], "a 5px drift the scroller claimed still opens the card");
    touch([50, 100], [90, 100], true);
    assert.deepEqual(pushed, [href], "a swipe does not navigate");
    touch([50, 100], [51, 100], false);
    assert.deepEqual(pushed, [href], "a normal tap is left to the link's own click");
  });

  it("tile links answer a tap at once on iOS", () => {
    const tile = read("components/card-tile.tsx");
    assert.match(tile, /touch-manipulation/);
    assert.match(tile, /\[-webkit-tap-highlight-color:transparent\]/);
    assert.match(tile, /motion-safe:active:scale-\[0\.97\]/);
  });
});

describe("Movers skeleton", () => {
  it("matches the rail: header row and four tiles at the final widths", () => {
    const skeleton = html(createElement(MovingTodaySkeleton));
    const rail = html(createElement(MovingTodayPanel, { payload: payload(6) }));
    assert.match(skeleton, /aria-busy="true"/);
    const widths = [...skeleton.matchAll(/data-skeleton-tile=""|class="(w-\[132px\]|w-\[120px\]) shrink-0"/g)]
      .map((m) => m[1])
      .filter(Boolean);
    assert.deepEqual(widths, ["w-[132px]", "w-[120px]", "w-[120px]", "w-[120px]"]);
    for (const shared of ["py-3", "flex h-6 items-center gap-1.5 px-4", "aspect-[3/5]", "mt-1.5 px-0.5"]) {
      assert.ok(skeleton.includes(shared), shared);
      assert.ok(rail.includes(shared), shared);
    }
    // The top badge sits on the art, so no tile grows a line under it.
    assert.match(rail, /data-top-badge=""[^>]*absolute/);
  });

  it("holds the spot while the client fetch runs", () => {
    const loading = html(createElement(MovingToday));
    assert.match(loading, /data-moving-today="skeleton"/);
  });

  it("keeps the skeleton's box when the client fetch finds nothing, then fades in", async () => {
    const realFetch = globalThis.fetch;
    const height = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(window.HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 332 });
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(payload(0)), { status: 200 })) as typeof fetch;
    try {
      mount(createElement(MovingToday));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      const hold = host.querySelector<HTMLElement>("[data-moving-hold]");
      assert.equal(hold?.style.minHeight, "332px");
      assert.ok(hold?.querySelector('[data-moving-today="quiet"]'));
      assert.match(hold?.innerHTML ?? "", /motion-safe:animate-\[lightbox-fade/);
    } finally {
      globalThis.fetch = realFetch;
      if (height) Object.defineProperty(window.HTMLElement.prototype, "offsetHeight", height);
      else delete (window.HTMLElement.prototype as { offsetHeight?: number }).offsetHeight;
    }
  });

  it("swaps the skeleton for a full rail with no held box", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(mixed(2, 6, { date: "", window: "week" })), { status: 200 })) as typeof fetch;
    try {
      mount(createElement(MovingToday));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      assert.equal(host.querySelector("[data-moving-hold]"), null);
      assert.ok(host.querySelector("[data-mover-rail]"));
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("Movers helpers", () => {
  it("formats the chip, badge, range, and count-up honestly", () => {
    assert.deepEqual(moverGain({ percent: 40, percentLabel: "+40%" }), { tone: "up", pctText: "+40%" });
    assert.deepEqual(moverGain({ percent: -12, percentLabel: "−12%" }), { tone: "down", pctText: "−12%" });
    assert.equal(moverGain({ percent: null, percentLabel: null }), null);
    assert.equal(moverGain({ percent: 0, percentLabel: "0%" }), null);
    assert.equal(moveBadgeText(115), "Up 115%");
    assert.equal(moveBadgeText(-40), "Down 40%");
    assert.equal(moveBadgeText(null), "");
    assert.equal(compactRangeLabel("Oct 23 – Oct 29"), "Oct 23–29");
    assert.equal(compactRangeLabel("Oct 30 – Nov 5"), "Oct 30 – Nov 5");
    assert.equal(countUpText("+115%", 0), "0%");
    assert.equal(countUpText("+115%", 0.5), "+58%");
    assert.equal(countUpText("−40%", 0.5), "−20%");
    assert.equal(countUpText("−40%", 1), "−40%");
  });

  it("says LIVE only for a day list under an hour old", () => {
    const at = Date.parse("2026-10-29T14:00:00.000Z");
    assert.deepEqual(moverFreshness("2026-10-29T13:48:00.000Z", "day", at), {
      live: true,
      label: "Updated 12m ago",
    });
    assert.equal(moverFreshness("2026-10-29T13:48:00.000Z", "week", at)?.live, false);
    assert.equal(moverFreshness("2026-10-29T12:59:00.000Z", "day", at)?.live, false);
    assert.match(moverFreshness("2026-10-29T12:30:00.000Z", "day", at)?.label ?? "", /^Updated \d{1,2}:30 [AP]M$/);
    assert.equal(moverFreshness("2026-10-29T13:59:40.000Z", "day", at)?.label, "Updated just now");
    assert.equal(moverFreshness(undefined, "day", at), null);
    assert.equal(moverFreshness("not a date", "day", at), null);
  });

  it("reads ?dir= and ?sport=, and defaults to All while movers are under a row", () => {
    assert.equal(parseDirection("down"), "down");
    assert.equal(parseDirection("all"), "all");
    assert.equal(parseDirection(["up", "down"]), "up");
    assert.equal(parseDirection("sideways"), null);
    assert.equal(parseDirection(undefined), null);
    assert.equal(defaultDirection({ moverCount: 0 }), "all");
    assert.equal(defaultDirection({ moverCount: 5 }), "all");
    assert.equal(defaultDirection({ moverCount: 6 }), "up");
    assert.equal(parseSport("football"), "football");
    assert.equal(parseSport("FootBall"), "football");
    assert.equal(parseSport([" Hockey "]), "hockey");
    assert.equal(parseSport("pokemon"), null);
    assert.equal(parseSport(undefined), null);
    assert.equal(movingQuery("down", "hockey"), "?dir=down&sport=hockey");
    assert.equal(movingQuery("all", null), "?dir=all");
    assert.equal(noMatchText("down", "hockey"), "No hockey cards moving down");
    assert.equal(noMatchText("up", null), "No cards moving up");
  });

  it("filters by direction and sport, and shows only sports that are present", () => {
    const sales = [
      sale(1, { percent: 30, sport: "football" }),
      sale(2, { percent: -10, sport: "basketball" }),
      sale(3, { percent: 80, sport: "basketball" }),
      cardTile(4, { sport: "football" }),
      cardTile(5, { sport: "Baseball" }),
      cardTile(6, { sport: "" }),
    ];
    assert.deepEqual(directionTiles(sales, "up").map((row) => row.percent), [80, 30]);
    assert.deepEqual(directionTiles(sales, "down").map((row) => row.percent), [-10]);
    assert.deepEqual(directionTiles(sales, "all").map((row) => row.cardId), sales.map((row) => row.cardId));
    assert.deepEqual(directionTiles(sales, "all", "football").map((row) => row.cardId), [id(1), id(4)]);
    assert.deepEqual(directionCounts(sales), { up: 2, down: 1, all: 6 });
    assert.deepEqual(directionCounts(sales, "basketball"), { up: 1, down: 1, all: 2 });
    assert.deepEqual(
      sportChips(sales).map((chip) => [chip.id, chip.count]),
      [
        ["baseball", 1],
        ["basketball", 2],
        ["football", 2],
      ],
    );
    assert.deepEqual(sportChips([sale(1, { sport: "football" }), cardTile(2, { sport: "football" })]), []);
    assert.deepEqual(sportChips([cardTile(2, { sport: "" })]), []);
  });
});

describe("See all", () => {
  function setVibrate(log: number[]) {
    Object.defineProperty(window.navigator, "vibrate", {
      configurable: true,
      value: (ms: number) => {
        log.push(ms);
        return true;
      },
    });
  }

  it("toggles Up, Down and All in ?dir=, with counts, in a 2-column grid of shared tiles", () => {
    const vibrations: number[] = [];
    setVibrate(vibrations);
    const data = payload(9);
    mount(createElement(MovingTodayAll, { payload: data, initialDirection: "up" }));
    const grid = () => host.querySelector("[data-mover-grid]");
    assert.equal(grid()?.getAttribute("data-mover-grid"), "up");
    assert.match(grid()?.className ?? "", /grid-cols-2/);
    assert.match(grid()?.className ?? "", /sm:grid-cols-3/);
    const upPercents = [...host.querySelectorAll("[data-mover-grid] [data-gain-text]")].map((node) => node.textContent);
    assert.deepEqual(upPercents, ["+120%", "+119%", "+117%", "+116%", "+114%", "+113%"]);
    assert.match(grid()?.textContent ?? "", /Sold Oct 22/);
    const tab = (dir: string) => host.querySelector<HTMLButtonElement>(`[data-direction=${dir}]`);
    assert.equal(tab("up")?.getAttribute("aria-selected"), "true");
    assert.equal(tab("up")?.getAttribute("role"), "tab");
    assert.ok(host.querySelector('[role="tablist"][aria-label="Direction"]'));
    assert.ok(host.querySelector('[aria-label="Share"]'));
    assert.ok(host.querySelector('a[aria-label="Back to Home"][data-nav-back]'));

    act(() => {
      tab("down")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    assert.equal(window.location.search, "?dir=down");
    assert.equal(tab("down")?.getAttribute("aria-selected"), "true");
    assert.equal(grid()?.getAttribute("data-mover-grid"), "down");
    const downPercents = [...host.querySelectorAll("[data-mover-grid] [data-gain-text]")].map((node) => node.textContent);
    assert.deepEqual(downPercents, ["−58%", "−55%", "−52%"]);
    assert.deepEqual(vibrations, [8]);
    // The pill slides by transform only.
    assert.equal(host.querySelector<HTMLElement>("[data-segment-pill]")?.style.transform, "translateX(100%)");
    assert.match(host.querySelector("[data-segment-pill]")?.className ?? "", /bg-violet-600/);
    assert.match(host.textContent ?? "", /Up6/);
    assert.match(host.textContent ?? "", /Down3/);
    assert.match(host.textContent ?? "", /All9/);

    // Arrow keys move between segments.
    act(() => {
      host.querySelector('[role="tablist"]')?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    assert.equal(tab("all")?.getAttribute("aria-selected"), "true");
    assert.equal(window.location.search, "?dir=all");
  });

  it("lists movers then the newest cards under All, with New or a value and never a percent", () => {
    mount(createElement(MovingTodayAll, { payload: mixed(2, 4), initialDirection: "all" }));
    const tiles = [...host.querySelectorAll("[data-mover-grid] > [data-tile]")];
    assert.equal(tiles.length, 6);
    assert.deepEqual(
      tiles.map((tile) => tile.getAttribute("data-tile")),
      [id(1), id(2), id(100), id(101), id(102), id(103)],
    );
    for (const tile of tiles.slice(2)) {
      assert.equal(tile.querySelector("[data-gain]"), null);
      assert.doesNotMatch(tile.textContent ?? "", /Sold|%/);
    }
    assert.equal(tiles[2]?.querySelector("[data-new-chip]")?.textContent, "New");
    assert.match(tiles[3]?.textContent ?? "", /\$12\.50/);
    // Two rows paint at once. The rest skip layout until scrolled near.
    assert.doesNotMatch(tiles[3]?.className ?? "", /content-visibility/);
    assert.match(tiles[4]?.className ?? "", /\[content-visibility:auto\]/);
  });

  it("disables an empty segment and shows its 0", () => {
    const allUp = payload(3, { sales: [sale(1), sale(2), sale(3)] });
    mount(createElement(MovingTodayAll, { payload: allUp, initialDirection: "up" }));
    const down = host.querySelector<HTMLButtonElement>("[data-direction=down]");
    assert.equal(down?.disabled, true);
    assert.match(down?.textContent ?? "", /Down0/);
  });

  it("features the top mover in the hero, and only a mover", () => {
    mount(createElement(MovingTodayAll, { payload: mixed(2, 3), initialDirection: "all" }));
    const hero = host.querySelector("[data-moving-hero]");
    assert.match(hero?.querySelector("h1")?.textContent ?? "", /Moving this week/);
    assert.match(hero?.textContent ?? "", /5 cards · 2 moving/);
    const featured = hero?.querySelector("[data-featured]");
    assert.equal(featured?.getAttribute("data-featured"), id(1));
    assert.match(featured?.querySelector("[data-tile]")?.className ?? "", /w-\[172px\]/);
    assert.match(featured?.querySelector("[data-tile]")?.className ?? "", /rgba\(124,58,237/);
    assert.equal(featured?.querySelector("[data-gain-text]")?.textContent, "+120%");
    assert.match(featured?.querySelector("a")?.getAttribute("href") ?? "", /^\/u\/ada\/cards\//);
    act(() => {
      featured?.querySelector("a")?.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }));
    });
    assert.deepEqual(prefetched, [], "the featured tile prefetches on screen, not on press");
    assert.ok(host.querySelector("[data-moving-backdrop]"));

    act(() => root!.render(withRouter(null)));
    mount(
      createElement(MovingTodayAll, {
        payload: mixed(0, 3, { title: "Fresh on Slabhold", window: "fresh", dateLabel: "" }),
        initialDirection: "all",
      }),
    );
    assert.equal(host.querySelector("[data-featured]"), null);
    assert.match(host.textContent ?? "", /The newest cards on Slabhold/);
    assert.match(host.textContent ?? "", /3 cards · 0 moving/);
  });

  it("filters by sport chip in ?sport=, hides absent sports, and offers Show all on no match", () => {
    const data = mixed(0, 0);
    data.sales = [
      sale(1, { percent: 40, sport: "football" }),
      sale(2, { percent: -20, sport: "basketball" }),
      cardTile(3, { sport: "football" }),
      cardTile(4, { sport: "basketball" }),
    ];
    data.moverCount = 2;
    data.totalCount = 4;
    mount(createElement(MovingTodayAll, { payload: data, initialDirection: "down", initialSport: "football" }));
    const chips = [...host.querySelectorAll("[data-sport-chips] [data-sport]")].map((chip) => chip.getAttribute("data-sport"));
    assert.deepEqual(chips, ["all", "basketball", "football"]);
    assert.ok(host.querySelector("[data-sport-chips][data-no-pull]"));
    assert.equal(host.querySelector("[data-sport=football]")?.getAttribute("aria-pressed"), "true");
    assert.equal(host.querySelector("[data-moving-no-match]")?.textContent, "No football cards moving down");
    // Counts follow the sport.
    assert.match(host.textContent ?? "", /Up1/);
    assert.match(host.textContent ?? "", /All2/);

    const showAll = [...host.querySelectorAll("button")].find((button) => button.textContent === "Show all");
    act(() => {
      showAll?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    assert.equal(window.location.search, "?dir=all");
    assert.equal(host.querySelectorAll("[data-mover-grid] > [data-tile]").length, 4);

    act(() => {
      host.querySelector("[data-sport=basketball]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    assert.equal(window.location.search, "?dir=all&sport=basketball");
    assert.equal(host.querySelectorAll("[data-mover-grid] > [data-tile]").length, 2);
  });

  it("reads the filters from the URL, which wins over stale props", () => {
    const fallback = { direction: "up", sport: null } as const;
    assert.deepEqual(filtersFromSearch("", fallback), fallback);
    assert.deepEqual(filtersFromSearch("?x=1", { direction: "all", sport: "football" }), {
      direction: "all",
      sport: "football",
    });
    assert.deepEqual(filtersFromSearch("?dir=all&sport=Basketball", fallback), { direction: "all", sport: "basketball" });
    // A tab switch always writes dir; no sport there means every sport.
    assert.deepEqual(filtersFromSearch("?dir=down", { direction: "up", sport: "football" }), {
      direction: "down",
      sport: null,
    });
    assert.deepEqual(filtersFromSearch("?dir=sideways&sport=curling", fallback), { direction: "up", sport: null });
  });

  it("shows the URL's sport and tab on Back, though the cached props have neither", () => {
    const data = mixed(0, 0);
    data.sales = [
      sale(1, { percent: 40, sport: "football" }),
      sale(2, { percent: -20, sport: "basketball" }),
      cardTile(3, { sport: "football" }),
      cardTile(4, { sport: "basketball" }),
    ];
    data.moverCount = 2;
    data.totalCount = 4;
    // The router redraws the page from props fetched before the switch.
    window.history.replaceState(null, "", "/moving-today?dir=all&sport=basketball");
    mount(createElement(MovingTodayAll, { payload: data, initialDirection: "up" }));
    assert.equal(host.querySelector("[data-mover-grid]")?.getAttribute("data-mover-grid"), "all");
    assert.equal(host.querySelector("[data-sport=basketball]")?.getAttribute("aria-pressed"), "true");
    assert.equal(host.querySelectorAll("[data-mover-grid] > [data-tile]").length, 2);
    // Read in the state initializer: the first client render is already filtered,
    // before NavMotion's scroll restore measures the page.
    assert.match(read("components/moving-today-page.tsx"), /useState<MovingFilters>\(\(\) =>\s*filtersNow\(/);

    // A popstate to a different query follows it too.
    act(() => {
      window.history.replaceState(null, "", "/moving-today?dir=all&sport=football");
      window.dispatchEvent(new window.PopStateEvent("popstate"));
    });
    assert.equal(host.querySelector("[data-sport=football]")?.getAttribute("aria-pressed"), "true");
    assert.equal(host.querySelectorAll("[data-mover-grid] > [data-tile]").length, 2);
  });

  it("staggers the first 12 tiles once, then crossfades on a switch", () => {
    mount(createElement(MovingTodayAll, { payload: mixed(8, 10), initialDirection: "all" }));
    const delays = [...host.querySelectorAll<HTMLElement>("[data-mover-grid] > [data-tile]")]
      .filter((tile) => tile.className.includes("animate-[tile-in"))
      .map((tile) => tile.style.animationDelay);
    assert.equal(delays.length, 12);
    assert.deepEqual(delays.slice(0, 3), ["0ms", "30ms", "60ms"]);
    act(() => {
      host.querySelector("[data-direction=up]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    assert.doesNotMatch(host.querySelector("[data-mover-grid]")?.innerHTML ?? "", /animate-\[tile-in/);
    assert.match(host.querySelector("[data-mover-grid]")?.className ?? "", /motion-safe:animate-\[lightbox-fade/);
  });

  it("has no animation classes with reduced motion", () => {
    state.reducedMotion = true;
    mount(
      createElement(MovingTodayAll, {
        payload: mixed(8, 4, { window: "day", title: "Moving today" }),
        initialDirection: "all",
      }),
    );
    assert.doesNotMatch(host.innerHTML, /animate-/);
    assert.doesNotMatch(host.querySelector("[data-segment-pill]")?.className ?? "", /transition-transform/);
    act(() => {
      host.querySelector("[data-direction=up]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    assert.doesNotMatch(host.innerHTML, /animate-/);
  });

  it("shows a designed empty state with no cards, not a redirect", () => {
    mount(createElement(MovingTodayAll, { payload: payload(0), initialDirection: "all", signedIn: true }));
    assert.match(host.textContent ?? "", /No cards on Slabhold yet/);
    assert.equal(
      [...host.querySelectorAll("a")].find((a) => a.textContent === "Add a card")?.getAttribute("href"),
      "/cards/new",
    );
    assert.equal(host.querySelector("[data-mover-grid]"), null);
    act(() => root!.render(withRouter(null)));
    mount(createElement(MovingTodayAll, { payload: payload(0), initialDirection: "all", signedIn: false }));
    assert.equal(
      [...host.querySelectorAll("a")].find((a) => a.textContent === "Join Slabhold")?.getAttribute("href"),
      "/signup",
    );
    assert.doesNotMatch(host.textContent ?? "", /Add a card/);
  });

  it("keeps the URL, reads ?dir= and ?sport=, never redirects when empty, and keeps the OG images", () => {
    const page = read("app/(app)/moving-today/page.tsx");
    assert.match(page, /searchParams/);
    assert.match(page, /parseDirection\(params\.dir\)/);
    assert.match(page, /parseSport\(params\.sport\)/);
    assert.match(page, /defaultDirection\(payload\)/);
    assert.doesNotMatch(page, /if \(!shouldShowMovingToday\(payload\.sales\)\) redirect/);
    assert.match(page, /MovingTodayAll/);
    assert.match(page, /force-dynamic/);
    assert.match(read("app/(app)/moving-today/opengraph-image.tsx"), /renderMovingTodayOg/);
    assert.match(read("app/(app)/moving-today/twitter-image.tsx"), /opengraph-image/);
    const component = read("components/moving-today-page.tsx");
    assert.match(component, /sticky top-\[var\(--app-header-h\)\]/);
    assert.match(component, /bg-\[var\(--chrome-bg\)\] backdrop-blur-xl/);
    assert.match(component, /radial-gradient\(ellipse_at_top,rgba\(124,58,237,0\.18\),transparent_60%\)/);
    assert.doesNotMatch(component, /recharts|chart/i);
  });
});

describe("Moving today cache", () => {
  it("keeps a value for 30 minutes, shares one miss, and retries a failure", async () => {
    assert.equal(MOVING_TODAY_CACHE_SECONDS, 1800);
    assert.match(movingTodayCacheControl(), /s-maxage=1800/);
    assert.match(movingTodayCacheControl(), /max-age=0/);

    let now = 1_000;
    let loads = 0;
    const cache = createTtlCache<string>(MOVING_TODAY_CACHE_SECONDS * 1000, () => now);
    const first = cache.read(async () => {
      loads += 1;
      return "sales";
    });
    const second = cache.read(async () => {
      loads += 1;
      return "other";
    });
    assert.equal(await first, "sales");
    assert.equal(await second, "sales");
    assert.equal(loads, 1);

    now += MOVING_TODAY_CACHE_SECONDS * 1000 - 1;
    assert.equal(await cache.read(async () => "fresh"), "sales");
    now += 1;
    assert.equal(await cache.read(async () => "fresh"), "fresh");

    const flaky = createTtlCache<string>(MOVING_TODAY_CACHE_SECONDS * 1000, () => 0);
    await assert.rejects(flaky.read(async () => Promise.reject(new Error("db"))));
    assert.equal(await flaky.read(async () => "recovered"), "recovered");
  });

  it("retries a failed read after 60 seconds and keeps a success", async () => {
    assert.equal(MOVING_TODAY_ERROR_CACHE_MS, 60_000);
    let now = 5_000;
    let calls = 0;
    const cache = createTtlCache<string>(
      MOVING_TODAY_CACHE_SECONDS * 1000,
      () => now,
      MOVING_TODAY_ERROR_CACHE_MS,
    );
    await assert.rejects(
      cache.read(async () => {
        calls += 1;
        throw new Error("db");
      }),
    );
    assert.equal(calls, 1);
    now += MOVING_TODAY_ERROR_CACHE_MS - 1;
    await assert.rejects(
      cache.read(async () => {
        calls += 1;
        throw new Error("again");
      }),
    );
    assert.equal(calls, 1);
    now += 1;
    await assert.rejects(
      cache.read(async () => {
        calls += 1;
        throw new Error("still");
      }),
    );
    assert.equal(calls, 2);
    await assert.rejects(
      cache.read(async () => {
        calls += 1;
        return "";
      }),
    );
    assert.equal(calls, 2);

    now += MOVING_TODAY_ERROR_CACHE_MS;
    assert.equal(
      await cache.read(async () => {
        calls += 1;
        return "";
      }),
      "",
    );
    assert.equal(calls, 3);
    now += MOVING_TODAY_CACHE_SECONDS * 1000 - 1;
    assert.equal(
      await cache.read(async () => {
        calls += 1;
        return "fresh";
      }),
      "",
    );
    assert.equal(calls, 3);
  });

  it("caches the server read for 30 minutes and does not cache a failed response", () => {
    const load = read("lib/moving-today/load.ts");
    const route = read("app/api/moving-today/route.ts");
    assert.match(load, /unstable_cache/);
    assert.match(load, /revalidate: MOVING_TODAY_CACHE_SECONDS/);
    assert.match(load, /memoryCache\.read/);
    assert.match(route, /getMovingToday/);
    assert.match(route, /movingTodayCacheControl/);
    assert.match(route, /private, no-store/);
    const home = read("app/(app)/page.tsx");
    // Home renders per request now (the signed-in first screen); the movers
    // row keeps its own shared cache, and nothing per viewer is cached.
    assert.doesNotMatch(home, /export const revalidate|use cache|force-static/);
    assert.doesNotMatch(home, /cookies\(|no-store|connection\(/);
    assert.match(load, /freshenMovingToday/);
    assert.match(load, /MOVING_TODAY_ERROR_CACHE_MS/);
    const cachedCall = load.indexOf("unstable_cache(");
    const freshenCall = load.indexOf("return freshenMovingToday");
    assert.ok(cachedCall > 0 && freshenCall > cachedCall);
    // Home reads the movers with the page and hands them to the timeline as data.
    assert.match(home, /getMovingToday\(\)/);
    const slot = read("components/home-feed.tsx");
    assert.doesNotMatch(slot, /connection\(/);
    assert.match(slot, /<MovingToday \/>/);
    assert.match(slot, /MovingTodayCached payload=\{movers\}/);
    assert.doesNotMatch(read("app/(app)/page.tsx"), /export const revalidate/);
    assert.match(load, /sold_comps_cache/);
    assert.match(load, /\["moving-today-v3"\]/);
    assert.doesNotMatch(load, /moving-today-v2/);
    assert.match(load, /from\("public_cards"\)\s*\.select\(NEWEST_COLUMNS\)\s*\.order\("created_at", \{ ascending: false \}\)\s*\.limit\(limit\)/);
    assert.match(load, /created_at, estimated_value/);
    assert.match(load, /MOVING_MONTH_DAYS/);
    assert.match(load, /readNewestPublicCards\(admin, MOVING_PUBLIC_CAP\)/);
    assert.match(load, /updatedAt/);
    const page = read("app/(app)/moving-today/page.tsx");
    assert.match(page, /generateMetadata/);
    assert.match(page, /payload\.title/);
    assert.doesNotMatch(page, /export const metadata/);
    assert.match(load, /T00:00:00Z/);
    assert.match(load, /comp_flags/);
    assert.match(load, /\.order\("sold_at", \{ ascending: false \}\)/);
    const historyQuery = load.slice(load.indexOf("const historyStart"));
    const historyOrder = historyQuery.indexOf('.order("sold_at", { ascending: false })');
    const historyLimit = historyQuery.indexOf(".limit(HISTORY_LIMIT)");
    assert.ok(historyOrder > 0 && historyOrder < historyLimit);
  });
});

describe("For You placement", () => {
  it("sits on For You, under the tabs, with Your collection today gone", () => {
    const feed = read("components/feed-view.tsx");
    const moving = feed.indexOf('lane === "foryou" ? movingToday ?? <MovingToday />');
    const tabs = feed.indexOf("<LaneTabs");
    const grouping = feed.indexOf("presentForYouFeed(visible");
    const notes = feed.indexOf("<WhatsNewCard");
    const map = feed.indexOf("shownEntries.map");
    assert.ok(moving > tabs && tabs > 0);
    assert.ok(grouping > 0 && grouping < map);
    assert.ok(notes > map);
    assert.ok(moving < map);
    assert.match(feed, /<NewPostsPill/);
    assert.match(feed, /showWelcome \? <HomeFirstCardPrompt \/> : null/);
    assert.doesNotMatch(feed, /CollectionToday|collection-today/);
    assert.doesNotMatch(feed, /card_value_history|shouldShowYourCardsSinceYesterday/);
    assert.doesNotMatch(read("components/home-feed.tsx"), /CollectionToday/);
    const ui = read("components/timeline-ui.tsx");
    assert.match(ui, /For You/);
    assert.match(ui, /New posts/);
    assert.match(ui, /h-\[2px\]/);
    assert.match(ui, /rounded-full bg-gradient-to-r from-\[#7C3AED\] to-\[#A78BFA\]/);
  });

  it("keeps lib/collection/today.ts and the Collection value history", () => {
    const today = read("lib/collection/today.ts");
    assert.match(today, /collectionDayChange/);
    assert.match(today, /collectionTodayDismissKey/);
    assert.ok(read("components/charts/value-chart.tsx").length > 0);
    assert.match(read("components/portfolio-hero.tsx"), /<ValueChart/);
  });
});

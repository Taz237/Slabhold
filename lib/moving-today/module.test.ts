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
  MovingTodayAll,
  MovingTodayPanel,
  MovingTodaySkeleton,
} from "@/components/moving-today";
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
  moveBadgeText,
  moverFreshness,
  moverGain,
  MOVING_RAIL_COUNT,
  parseDirection,
} from "./rail";
import type { MovingTodayPayload, MovingTodaySale } from "./types";

const { state } = installDom();

const prefetched: string[] = [];
const router = {
  push: () => {},
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
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  state.reducedMotion = false;
  prefetched.length = 0;
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
    ...partial,
  };
}

function classOf(markup: string, attr: string): string {
  const match = new RegExp(`<[^>]*${attr}[^>]*class="([^"]*)"|<[^>]*class="([^"]*)"[^>]*${attr}`).exec(markup);
  return match?.[1] ?? match?.[2] ?? "";
}

describe("Movers rail", () => {
  it("renders shared CardTiles, biggest move first, then See all N", () => {
    const out = html(createElement(MovingTodayPanel, { payload: payload(15) }));
    const tiles = out.match(/data-tile="/g) ?? [];
    assert.equal(tiles.length, MOVING_RAIL_COUNT);
    assert.match(out, /data-density="compact"/);
    assert.match(out, /data-gain="up"[^>]*class="[^"]*emerald/);
    assert.match(out, /data-gain="down"[^>]*class="[^"]*rose/);
    assert.match(out, /data-kind="slab"/);
    assert.match(out, /See all 15/);
    assert.match(out, /aria-label="See all 15 movers"/);
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
    assert.match(out, /· Oct 23–29/);
    assert.doesNotMatch(out, /aria-label="Share"/);
    assert.doesNotMatch(out, /Oct 23 – Oct 29/);
    assert.match(out, /text-\[#7C3AED\] dark:text-\[#A78BFA\]/);
    assert.match(out, /class="py-3"/);
    assert.doesNotMatch(classOf(out, "data-moving-today"), /border/);
  });

  it("sizes tiles at 112px and the top mover at 132px with its badge and glow", () => {
    const out = html(createElement(MovingTodayPanel, { payload: payload(4) }));
    const first = classOf(out, `data-tile="${id(1)}"`);
    const second = classOf(out, `data-tile="${id(2)}"`);
    assert.match(first, /w-\[132px\]/);
    assert.match(first, /rgba\(124,58,237/);
    assert.match(second, /\bw-28\b/);
    assert.doesNotMatch(second, /rgba\(124,58,237/);
    assert.match(out, /data-top-badge=""[^>]*>Up 120%</);
    assert.equal((out.match(/data-top-badge/g) ?? []).length, 1);
  });

  it("never shows a one- or two-tile rail: thin weeks get the quiet row", () => {
    for (const count of [0, 1, 2]) {
      const out = html(createElement(MovingTodayPanel, { payload: payload(count) }));
      assert.doesNotMatch(out, /data-tile=/);
      assert.match(out, /data-moving-today="quiet"/);
      assert.match(out, /Prices are quiet this week\./);
      assert.match(out, /Add a card to see its comps/);
      assert.match(out, /href="\/cards\/new"/);
    }
    assert.match(html(createElement(MovingTodayPanel, { payload: payload(3) })), /data-tile=/);
    assert.equal(html(createElement(MovingQuiet)).includes("$0"), false);
  });

  it("gates every animation on motion-safe", () => {
    const out = html(createElement(MovingTodayPanel, { payload: payload(8) }));
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
    mount(createElement(MovingTodayPanel, { payload: payload(6) }));
    assert.match(host.innerHTML, /animate-\[tile-in_240ms/);
    act(() => root!.render(withRouter(null)));
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

  it("warms a tile or See all on pointerdown, and links do not prefetch", () => {
    mount(createElement(MovingTodayPanel, { payload: payload(4) }));
    const seeAll = host.querySelector("[data-see-all-tile]");
    act(() => {
      seeAll?.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }));
    });
    assert.deepEqual(prefetched, ["/moving-today"]);
    const source = read("components/moving-today.tsx");
    assert.match(source, /prefetch=\{false\}/);
    assert.doesNotMatch(source, /CardThumb|max-md:pr-20|w-\[38%\]/);
  });
});

describe("Movers skeleton", () => {
  it("matches the rail: header row and four tiles at the final widths", () => {
    const skeleton = html(createElement(MovingTodaySkeleton));
    const rail = html(createElement(MovingTodayPanel, { payload: payload(6) }));
    assert.match(skeleton, /aria-busy="true"/);
    const widths = [...skeleton.matchAll(/data-skeleton-tile=""|class="(w-\[132px\]|w-28) shrink-0"/g)]
      .map((m) => m[1])
      .filter(Boolean);
    assert.deepEqual(widths, ["w-[132px]", "w-28", "w-28", "w-28"]);
    for (const shared of ["py-3", "flex h-6 items-center gap-2 px-4", "aspect-[3/5]", "mt-1.5 px-0.5"]) {
      assert.ok(skeleton.includes(shared), shared);
      assert.ok(rail.includes(shared), shared);
    }
    assert.match(skeleton, /mb-1 h-5/);
    assert.match(rail, /mb-1 inline-flex h-5/);
  });

  it("holds the spot while the client fetch runs", () => {
    const loading = html(createElement(MovingToday));
    assert.match(loading, /data-moving-today="skeleton"/);
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

  it("reads ?dir= and defaults to the bigger side, Up on a tie", () => {
    assert.equal(parseDirection("down"), "down");
    assert.equal(parseDirection(["up", "down"]), "up");
    assert.equal(parseDirection("sideways"), null);
    assert.equal(parseDirection(undefined), null);
    assert.equal(defaultDirection([{ percent: 5 }, { percent: -5 }]), "up");
    assert.equal(defaultDirection([{ percent: 5 }, { percent: -5 }, { percent: -9 }]), "down");
  });
});

describe("See all movers", () => {
  it("toggles Up and Down in ?dir=, sorted by the move, in a 3-column tile grid", () => {
    const vibrations: number[] = [];
    Object.defineProperty(window.navigator, "vibrate", {
      configurable: true,
      value: (ms: number) => {
        vibrations.push(ms);
        return true;
      },
    });
    const data = payload(9);
    mount(createElement(MovingTodayAll, { payload: data, initialDirection: "up" }));
    const grid = () => host.querySelector("[data-mover-grid]");
    assert.equal(grid()?.getAttribute("data-mover-grid"), "up");
    assert.match(grid()?.className ?? "", /grid-cols-3/);
    const upPercents = [...host.querySelectorAll("[data-gain-text]")].map((node) => node.textContent);
    assert.deepEqual(upPercents, ["+120%", "+119%", "+117%", "+116%", "+114%", "+113%"]);
    assert.match(host.textContent ?? "", /Sold Oct 22/);
    assert.equal(host.querySelector("[data-direction=up]")?.getAttribute("aria-pressed"), "true");
    assert.ok(host.querySelector('[aria-label="Share"]'));
    assert.ok(host.querySelector('a[aria-label="Back to Home"][data-nav-back]'));

    const down = host.querySelector<HTMLButtonElement>("[data-direction=down]");
    act(() => {
      down?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    assert.equal(window.location.search, "?dir=down");
    assert.equal(down?.getAttribute("aria-pressed"), "true");
    assert.equal(grid()?.getAttribute("data-mover-grid"), "down");
    const downPercents = [...host.querySelectorAll("[data-gain-text]")].map((node) => node.textContent);
    assert.deepEqual(downPercents, ["−58%", "−55%", "−52%"]);
    assert.deepEqual(vibrations, [8]);
    assert.match(host.textContent ?? "", /Up6/);
    assert.match(host.textContent ?? "", /Down3/);
  });

  it("shows a designed empty side instead of a blank grid", () => {
    const allUp = payload(3, { sales: [sale(1), sale(2), sale(3)] });
    mount(createElement(MovingTodayAll, { payload: allUp, initialDirection: "down" }));
    assert.match(host.textContent ?? "", /No cards down this week yet\./);
  });

  it("keeps the URL, reads ?dir=, redirects when empty, and keeps the OG images", () => {
    const page = read("app/moving-today/page.tsx");
    assert.match(page, /searchParams/);
    assert.match(page, /parseDirection\(params\.dir\)/);
    assert.match(page, /defaultDirection\(payload\.sales\)/);
    assert.match(page, /if \(!shouldShowMovingToday\(payload\.sales\)\) redirect\("\/"\)/);
    assert.match(page, /MovingTodayAll/);
    assert.match(read("app/moving-today/opengraph-image.tsx"), /renderMovingTodayOg/);
    assert.match(read("app/moving-today/twitter-image.tsx"), /opengraph-image/);
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
    assert.match(load, /MOVING_TODAY_WEEK_DAYS/);
    const home = read("app/page.tsx");
    assert.match(home, /export const revalidate = 1800/);
    assert.doesNotMatch(home, /cookies\(|no-store|connection\(/);
    assert.match(load, /freshenMovingToday/);
    assert.match(load, /MOVING_TODAY_ERROR_CACHE_MS/);
    const cachedCall = load.indexOf("unstable_cache(");
    const freshenCall = load.indexOf("return freshenMovingToday");
    assert.ok(cachedCall > 0 && freshenCall > cachedCall);
    const slot = read("components/moving-today-slot.tsx");
    assert.doesNotMatch(slot, /connection\(/);
    assert.match(slot, /<MovingToday \/>/);
    assert.match(slot, /MovingTodayCached/);
    assert.match(read("app/page.tsx"), /export const revalidate = 1800/);
    assert.match(load, /sold_comps_cache/);
    assert.match(load, /\["moving-today-v2"\]/);
    assert.match(load, /updatedAt/);
    const page = read("app/moving-today/page.tsx");
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
    const map = feed.indexOf("feedEntries.map");
    assert.ok(moving > tabs && tabs > 0);
    assert.ok(grouping > 0 && grouping < map);
    assert.ok(notes > map);
    assert.ok(moving < map);
    assert.match(feed, /<NewPostsPill/);
    assert.match(feed, /showWelcome \? <HomeFirstCardPrompt \/> : null/);
    assert.doesNotMatch(feed, /CollectionToday|collection-today/);
    assert.doesNotMatch(feed, /card_value_history|shouldShowYourCardsSinceYesterday/);
    assert.doesNotMatch(read("components/moving-today-slot.tsx"), /CollectionToday/);
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
    assert.ok(read("components/collection-value-history.tsx").length > 0);
  });
});

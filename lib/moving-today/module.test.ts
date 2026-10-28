import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { join } from "node:path";
import { MovingToday, MovingTodayPanel } from "@/components/moving-today";
import {
  createTtlCache,
  MOVING_TODAY_CACHE_SECONDS,
  MOVING_TODAY_ERROR_CACHE_MS,
  movingTodayCacheControl,
} from "./cache";
import type { MovingTodaySale } from "./types";

const CARD = "ba95893e-89fe-4735-be3f-1509b6b6f3b9";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function sale(partial: Partial<MovingTodaySale> = {}): MovingTodaySale {
  return {
    cardId: CARD,
    href: `/u/ada/cards/${CARD}`,
    player: "Victor Wembanyama",
    detail: "2023-24 · Prizm · PSA 10",
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

describe("Moving today module", () => {
  it("renders nothing until sales arrive so an empty day does not move the composer", () => {
    const loading = renderToStaticMarkup(createElement(MovingToday));
    const empty = renderToStaticMarkup(
      createElement(MovingTodayPanel, { heading: "Moving today", dateLabel: "Oct 22", sales: [] }),
    );
    assert.equal(loading, "");
    assert.equal(empty, "");
    const source = read("components/moving-today.tsx");
    assert.doesNotMatch(source, /min-h-\[148px\]|minHeight|movingTodayReservedHeight/);
    assert.doesNotMatch(source, /animate-pulse/);
  });

  it("hides the module when there is nothing to show", () => {
    const html = renderToStaticMarkup(
      createElement(MovingTodayPanel, { heading: "Moving today", dateLabel: "Oct 22", sales: [] }),
    );
    assert.equal(html, "");
  });

  it("shows the card, price, honest percent, sale date, and share", () => {
    const html = renderToStaticMarkup(
      createElement(MovingTodayPanel, {
        heading: "Moving today",
        dateLabel: "Oct 22",
        sales: [sale()],
      }),
    );
    assert.doesNotMatch(html, /min-height|min-h-\[148px\]/);
    assert.match(html, /Victor Wembanyama/);
    assert.match(html, /\$200\.00/);
    assert.match(html, /\+40%/);
    assert.match(html, /Oct 22/);
    assert.match(html, new RegExp(`href="/u/ada/cards/${CARD}"`));
    assert.match(html, /aria-label="Share"/);
    assert.match(html, /max-md:pr-20/);
    assert.doesNotMatch(html, /No sales|Nothing moving/i);
  });

  it("omits the percent when the sample is too small to be honest", () => {
    const html = renderToStaticMarkup(
      createElement(MovingTodayPanel, {
        heading: "Moving today",
        dateLabel: "Oct 22",
        sales: [sale({ percent: null, percentLabel: null })],
      }),
    );
    assert.match(html, /\$200\.00/);
    assert.match(html, /Oct 22/);
    assert.equal(html.includes("+40%"), false);
    assert.equal(html.includes("−"), false);
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
  it("sits on For You and leaves the What's new grouping in the feed", () => {
    const feed = read("components/feed-view.tsx");
    const moving = feed.indexOf('lane === "foryou" ? movingToday ?? <MovingToday />');
    const grouping = feed.indexOf("presentForYouFeed(visible");
    const notes = feed.indexOf("<WhatsNewCard");
    const map = feed.indexOf("feedEntries.map");
    assert.ok(moving > 0);
    assert.ok(grouping > 0 && grouping < map);
    assert.ok(notes > map);
    assert.ok(moving < map);
    assert.match(feed, /<LaneTabs/);
    assert.match(feed, /<NewPostsPill/);
    const tabs = read("components/timeline-ui.tsx");
    assert.match(tabs, /For You/);
    assert.match(tabs, /New posts/);
    assert.doesNotMatch(feed, /card_value_history|shouldShowYourCardsSinceYesterday/);
  });
});

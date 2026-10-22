import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { join } from "node:path";
import { MOVING_TODAY_SLOT_CLASS, MovingTodayPanel } from "@/components/moving-today";
import {
  createTtlCache,
  MOVING_TODAY_CACHE_SECONDS,
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
  it("reserves a skeleton and does not jump the slot class", () => {
    const html = renderToStaticMarkup(
      createElement(MovingTodayPanel, { status: "loading", dateLabel: "", sales: [] }),
    );
    assert.match(html, /aria-busy="true"/);
    assert.match(html, /Moving today/);
    assert.match(html, new RegExp(MOVING_TODAY_SLOT_CLASS.replace("[", "\\[").replace("]", "\\]")));
    assert.match(html, /animate-pulse/);
    assert.doesNotMatch(html, /No sales|Nothing moving|empty/i);
    assert.doesNotMatch(html, /Share/);
  });

  it("hides the module when there is nothing to show", () => {
    const html = renderToStaticMarkup(
      createElement(MovingTodayPanel, { status: "ready", dateLabel: "Oct 22", sales: [] }),
    );
    assert.equal(html, "");
  });

  it("shows the card, price, honest percent, sale date, and share", () => {
    const html = renderToStaticMarkup(
      createElement(MovingTodayPanel, {
        status: "ready",
        dateLabel: "Oct 22",
        sales: [sale()],
      }),
    );
    assert.match(html, new RegExp(MOVING_TODAY_SLOT_CLASS.replace("[", "\\[").replace("]", "\\]")));
    assert.match(html, /aria-busy="false"/);
    assert.match(html, /Victor Wembanyama/);
    assert.match(html, /\$200\.00/);
    assert.match(html, /\+40%/);
    assert.match(html, /Oct 22/);
    assert.match(html, new RegExp(`href="/u/ada/cards/${CARD}"`));
    assert.match(html, /aria-label="Share"/);
    assert.doesNotMatch(html, /No sales|Nothing moving/i);
  });

  it("omits the percent when the sample is too small to be honest", () => {
    const html = renderToStaticMarkup(
      createElement(MovingTodayPanel, {
        status: "ready",
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

  it("caches the server read for 30 minutes and does not cache a failed response", () => {
    const load = read("lib/moving-today/load.ts");
    const route = read("app/api/moving-today/route.ts");
    assert.match(load, /unstable_cache/);
    assert.match(load, /revalidate: MOVING_TODAY_CACHE_SECONDS/);
    assert.match(load, /memoryCache\.read/);
    assert.match(route, /getMovingToday/);
    assert.match(route, /movingTodayCacheControl/);
    assert.match(route, /private, no-store/);
    assert.match(load, /sold_comps_cache/);
  });
});

describe("For You placement", () => {
  it("sits on For You and leaves the What's new grouping in the feed", () => {
    const feed = read("components/feed-view.tsx");
    const moving = feed.indexOf('lane === "foryou" ? <MovingToday />');
    const grouping = feed.indexOf("presentForYouFeed(visible");
    const notes = feed.indexOf("<WhatsNewCard");
    const map = feed.indexOf("feedEntries.map");
    assert.ok(moving > 0);
    assert.ok(grouping > 0 && grouping < map);
    assert.ok(notes > map);
    assert.ok(moving < map);
    assert.match(feed, /For You/);
    assert.match(feed, /New posts/);
    assert.doesNotMatch(feed, /card_value_history|shouldShowYourCardsSinceYesterday/);
  });
});

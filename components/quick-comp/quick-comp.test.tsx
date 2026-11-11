import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PRICE_BASIS_LINE, SalesChart, TRAWL_ATTRIBUTION } from "@/components/sales-chart";
import { addDays } from "@/lib/chart/range";
import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";
import type { QuickCompIdentity } from "@/lib/quick-comp/identity";
import type { SavedPayload } from "@/lib/quick-comp/recent";
import { QUICK_COMP_DAILY_MESSAGE, QUICK_COMP_HOURLY_MESSAGE } from "@/lib/quick-comp/respond";
import type { CompListing } from "@/lib/types";
import { GradeControl } from "./grade-control";
import { QUICK_COMP_EMPTY_TITLE, QuickCompResult, addToCollectionHref, identityLine } from "./quick-comp-result";
import { QuickCompLoading } from "./quick-comp-states";
import { CompStateNotice, ERROR_TITLE, OFFLINE_TITLE } from "./quick-comp-view";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const today = snapshotDateInNewYork();

const identity: QuickCompIdentity = {
  playerName: "Fixture Player",
  year: 2023,
  yearLabel: "2023-24",
  setBrand: "Panini Prizm",
  cardNumber: "136",
  parallel: "Base",
  grade: "PSA 10",
};

function comps(prices: number[]): CompListing[] {
  return prices.map((price, index) => ({
    id: `c${index}`,
    itemId: `i${index}`,
    title: `2023-24 Panini Prizm Fixture Player #136 PSA 10 (${index})`,
    soldPrice: price,
    soldDate: addDays(today, -(index * 6 + 2)),
    platform: "eBay",
    condition: "PSA 10",
    shipping: null,
    url: `https://example.test/item/${index}`,
  }));
}

function payload(prices: number[], extra: Partial<SavedPayload> = {}): SavedPayload {
  const sorted = [...prices].sort((a, b) => a - b);
  return {
    median: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
    p25: sorted[0] ?? null,
    p75: sorted[sorted.length - 1] ?? null,
    count: prices.length,
    source: "trawl",
    fetchedAt: new Date().toISOString(),
    lowConfidence: prices.length > 0 && prices.length < 5,
    sample: false,
    comps: comps(prices),
    ...extra,
  };
}

function result(p: SavedPayload, extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    createElement(QuickCompResult, {
      identity,
      catalog: null,
      payload: p,
      Chart: SalesChart,
      ...extra,
    } as Parameters<typeof QuickCompResult>[0]),
  );
}

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe("Quick Comp screen", () => {
  it("shows the comp card, the stat row and one trust line", () => {
    const html = result(payload([40, 42, 44, 46, 48, 50, 52]));
    assert.match(html, /data-comp-card/);
    assert.match(html, /data-quick-comp-stats/);
    assert.match(html, />Avg</);
    assert.match(html, />Highest<\/dt><dd[^>]*>\$52\.00</);
    assert.match(html, />Lowest<\/dt><dd[^>]*>\$40\.00</);
    // The chart caption already says "Based on 7 sales", so the trust line only gives the span.
    assert.equal(count(html, "7 sales"), 1);
    assert.match(html, /data-quick-comp-trust[^>]*><span>Sold /);
    assert.doesNotMatch(html, /\$0\.00/);
  });

  it("flags low confidence once with 4 sales", () => {
    const html = result(payload([40, 44, 48, 52]));
    assert.equal(count(html, "Low confidence"), 1);
    assert.equal(count(html, "4 sales"), 1);
    assert.match(html, /data-quick-comp-trust[^>]*><span>Sold [^<]+<\/span><span[^>]*>Low confidence</);
  });

  it("draws the empty state with no $0", () => {
    const html = result(payload([]));
    assert.match(html, /data-comp-empty/);
    assert.ok(html.includes(QUICK_COMP_EMPTY_TITLE.replace(/'/g, "&#x27;")));
    assert.doesNotMatch(html, /\$0/);
    assert.doesNotMatch(html, /data-quick-comp-stats/);
  });

  it("draws the loading skeleton in the comp card's final shapes", () => {
    const html = renderToStaticMarkup(createElement(QuickCompLoading));
    assert.match(html, /data-comp-skeleton/);
    assert.match(html, /aria-busy="true"/);
    assert.doesNotMatch(html, /\$|data-quick-comp-add/);
  });

  it("draws the error, offline and both limit states without Add to collection", () => {
    const noop = () => {};
    const error = renderToStaticMarkup(createElement(CompStateNotice, { state: { status: "error" }, onRetry: noop }));
    assert.match(error, new RegExp(ERROR_TITLE));
    assert.match(error, />Try again</);
    const offline = renderToStaticMarkup(createElement(CompStateNotice, { state: { status: "offline" }, onRetry: noop }));
    assert.ok(offline.includes(OFFLINE_TITLE.replace(/'/g, "&#x27;")));
    const hourly = renderToStaticMarkup(
      createElement(CompStateNotice, { state: { status: "limited", reason: "hourly", resetAt: null }, onRetry: noop }),
    );
    assert.ok(hourly.includes(QUICK_COMP_HOURLY_MESSAGE.replace(/'/g, "&#x27;")));
    const daily = renderToStaticMarkup(
      createElement(CompStateNotice, {
        state: { status: "limited", reason: "daily", resetAt: "2026-11-04T00:00:00.000Z" },
        onRetry: noop,
      }),
    );
    assert.ok(daily.includes(QUICK_COMP_DAILY_MESSAGE.replace(/'/g, "&#x27;")));
    assert.match(daily, /New comps from /);
    for (const html of [error, offline, hourly, daily]) {
      assert.doesNotMatch(html, /data-quick-comp-add|\$0/);
    }
  });

  it("keeps the Trawl attribution with live data, and leaves it off sample data", () => {
    const live = result(payload([40, 42, 44, 46, 48]));
    assert.equal(count(live, TRAWL_ATTRIBUTION), 1);
    const sample = result(payload([40, 42, 44, 46, 48], { source: "sample", sample: true }));
    assert.equal(count(sample, TRAWL_ATTRIBUTION), 0);
    assert.match(sample, /Sample prices, not real sales/);
    // Never "eBay sold" as the freshness line.
    assert.doesNotMatch(live, /eBay sold/);
    // The USD line under the median: live data only.
    assert.equal(count(live, PRICE_BASIS_LINE), 1);
    assert.equal(count(sample, PRICE_BASIS_LINE), 0);
  });

  it("puts Add to collection only after the comps", () => {
    const html = result(payload([40, 42, 44, 46, 48]));
    const add = html.indexOf("data-quick-comp-add");
    assert.ok(add > html.indexOf("data-comp-card"));
    assert.ok(add > html.indexOf("data-quick-comp-stats"));
    assert.ok(add > html.indexOf("Sales behind this price"));
    assert.equal(count(html, "Add to collection"), 1);
    assert.equal(
      addToCollectionHref(identity, null),
      "/cards/new?q=2023-24%20Panini%20Prizm%20Fixture%20Player%20%23136",
    );
    assert.match(
      addToCollectionHref(identity, { id: "x", playerName: "Fixture Player", yearLabel: "2023-24", setBrand: "Panini Prizm", cardNumber: "136", sport: "Basketball", parallel: "Base" }),
      /^\/cards\/new\?pick=1&player=Fixture\+Player/,
    );
  });

  it("shows a saved comp's age and a Refresh", () => {
    const html = result(payload([40, 42, 44, 46, 48]), {
      savedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
      onRefresh: () => {},
    });
    assert.match(html, /Saved 2h ago/);
    assert.match(html, />Refresh</);
  });

  it("offers alternatives as buttons that do nothing until tapped", () => {
    const html = result(payload([40, 42, 44, 46, 48]), {
      alternatives: [
        { id: "a1", playerName: "Fixture Player", yearLabel: "2023-24", setBrand: "Panini Select", cardNumber: "87", sport: "Basketball", parallel: "Base" },
      ],
      onAlternative: () => {},
    });
    assert.match(html, /Or did you mean/);
    assert.match(html, /2023-24 Panini Select #87 Base/);
  });

  it("writes the identity line with the grade", () => {
    assert.equal(identityLine(identity), "2023-24 Panini Prizm #136 Base · PSA 10");
  });

  it("makes the grade control a radiogroup with PSA 10 checked", () => {
    const html = renderToStaticMarkup(
      createElement(GradeControl, { grade: "PSA 10", otherOpen: false, onChange: () => {}, onOpenOther: () => {} }),
    );
    assert.match(html, /role="radiogroup"/);
    assert.equal(count(html, 'role="radio"'), 6);
    assert.match(html, /aria-checked="true"[^>]*>PSA 10</);
    for (const label of ["Raw", "PSA 9", "BGS 9.5", "SGC 10", "Other"]) assert.match(html, new RegExp(`>${label}<`));
    const other = renderToStaticMarkup(
      createElement(GradeControl, { grade: "CGC 9.5", otherOpen: true, onChange: () => {}, onOpenOther: () => {} }),
    );
    assert.match(other, /aria-checked="true"[^>]*>Other</);
    assert.match(other, /<select/);
  });

  it("has no off-brand hues, and puts every motion behind motion-safe", () => {
    // Built from parts so the PR's literal sweep of this folder stays empty.
    const banned = new RegExp(
      ["te" + "al", "cy" + "an", "radial-" + "gradient", "font-" + "bold", "transition-" + "all", "eBay " + "data", "animate-(?:pulse|ping|bounce|spin)"].join("|"),
    );
    const dir = "components/quick-comp";
    const files = [
      ...readdirSync(join(root, dir))
        .filter((name) => name.endsWith(".tsx") || name.endsWith(".ts"))
        .filter((name) => !name.endsWith(".test.tsx"))
        .map((name) => `${dir}/${name}`),
      "app/(app)/comp/page.tsx",
    ];
    for (const file of files) {
      const source = read(file);
      assert.doesNotMatch(source, banned, file);
      for (const match of source.matchAll(/(\S*)(transition-|duration-|ease-\[|animate-)/g)) {
        assert.match(match[1], /motion-safe:$/, `${file}: ${match[0]}`);
      }
    }
  });

  it("is reachable only from /comp", () => {
    const page = read("app/(app)/comp/page.tsx");
    assert.match(page, /if \(!quickCompEnabled\(\)\) notFound\(\);/);
    assert.match(page, /<QuickCompLazy /);
    const lazy = read("components/quick-comp/quick-comp-lazy.tsx");
    assert.match(lazy, /lazyPart<Props>\(\s*\(\) => import\("\.\/quick-comp-view"\)/);
  });
});

describe("Quick Comp Home entry", () => {
  it("draws nothing on Home with the flag off", () => {
    assert.equal(process.env.NEXT_PUBLIC_QUICK_COMP, undefined);
    const feed = read("components/home-feed.tsx");
    // Home has no Quick Comp row, flag on or off
    assert.doesNotMatch(feed, /QuickComp|MovingToday|LeaderboardHomeLink/);
  });
});

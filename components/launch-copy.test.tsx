import "@/lib/test/server-only-stub";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { installDom } from "@/lib/test/dom";
import { PRICE_BASIS_LINE, SalesChart, TRAWL_ATTRIBUTION } from "@/components/sales-chart";
import { CompEmpty, compCaption } from "@/components/comp-basis";
import { COLLECTION_LOAD_ERROR } from "@/components/collection-provider";
import { APP_STORE_URL, AppStoreLink } from "@/components/landing/app-store-link";
import { addDays } from "@/lib/chart/range";
import type { ChartSale } from "@/lib/chart/sales";
import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";

installDom();
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function count(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(join(process.cwd(), dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(process.cwd(), path)).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const today = snapshotDateInNewYork();
const card = { id: "fixture-card", estimatedSellPrice: 0, purchasePrice: 0 };
const sales: ChartSale[] = [40, 32, 24, 16, 8, 2].map((ago, index) => ({
  id: `s${index}`,
  price: 30 + index,
  date: addDays(today, -ago),
  grade: "PSA 10",
  source: "eBay",
}));

function chart(props: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    createElement(SalesChart, {
      card,
      sales,
      source: "trawl",
      sample: false,
      lockedToComps: true,
      median: 35,
      p25: 33,
      p75: 37,
      count: 6,
      fetchedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
      ...props,
    } as Parameters<typeof SalesChart>[0]),
  );
}

describe("launch copy: USD price basis", () => {
  it("is one line in lib/comps/price-basis.ts, used by the comp chart and the public comps", () => {
    assert.equal(PRICE_BASIS_LINE, "Prices in USD from recent US sold listings");
    for (const path of [...sourceFiles("components"), ...sourceFiles("app"), ...sourceFiles("lib")]) {
      if (path === join("lib", "comps", "price-basis.ts")) continue;
      assert.equal(read(path).includes(PRICE_BASIS_LINE), false, `${path} repeats the USD line`);
    }
    assert.match(read("components/sales-chart.tsx"), /export \{ PRICE_BASIS_LINE \}/);
    assert.match(read("components/public-card-comps.tsx"), /\{PRICE_BASIS_LINE\}/);
    assert.doesNotMatch(read("components/public-card-comps.tsx"), /from "@\/components\/sales-chart"/);
  });

  it("shows once under a real median, after the caption row, in the caption style", () => {
    const html = chart();
    assert.equal(count(html, PRICE_BASIS_LINE), 1);
    assert.ok(html.indexOf(PRICE_BASIS_LINE) > html.indexOf("Based on 6 sales"));
    assert.match(html, new RegExp(`<p class="[^"]*${compCaption.replace(/[[\]]/g, "\\$&")}[^"]*">${PRICE_BASIS_LINE}</p>`));
  });

  it("stays while a sale is tapped", () => {
    assert.equal(count(chart({ selectedSaleId: "s2" }), PRICE_BASIS_LINE), 1);
  });

  it("stays off sample, no-sales and fallback-label states", () => {
    assert.equal(count(chart({ source: "sample", sample: true, lockedToComps: false }), PRICE_BASIS_LINE), 0);
    // Quick Comp locks the chart to its comps, sample payloads included.
    assert.equal(count(chart({ source: "sample", sample: true }), PRICE_BASIS_LINE), 0);
    assert.equal(count(chart({ sales: [], count: 0, median: null, p25: null, p75: null }), PRICE_BASIS_LINE), 0);
    assert.equal(
      count(chart({ headlineIsEstimate: false, headlineLabel: "Last sale $30.00" }), PRICE_BASIS_LINE),
      0,
    );
  });

  it("reaches the card page, the public card page and Quick Comp through SalesChart", () => {
    assert.match(read("components/card-detail.tsx"), /<SalesChart\b/);
    assert.match(read("components/public-card-view.tsx"), /<SalesChart\b/);
    assert.match(read("components/quick-comp/quick-comp-result.tsx"), /<Chart\b[\s\S]*heading="Median sold price"/);
  });
});

describe("launch copy: marketplace wording", () => {
  it("says Recent sold for freshness, never eBay sold", () => {
    const html = chart();
    assert.match(html, /Recent sold · 2h ago/);
    assert.doesNotMatch(html, /eBay sold/);
  });

  it("waits for a recent sale, not an eBay sale, on both empty reads", () => {
    const empty = renderToStaticMarkup(createElement(CompEmpty, {}));
    assert.match(empty, /We&#x27;ll show a value once this card has a recent sale\./);
    const none = chart({ sales: [], count: 0, median: null, p25: null, p75: null });
    assert.match(none, /We&#x27;ll show a value once this card has a recent sale\./);
    for (const html of [empty, none]) assert.doesNotMatch(html, /sells on eBay/);
  });

  it("keeps the Trawl attribution as it is", () => {
    assert.equal(TRAWL_ATTRIBUTION, "Sold data via Trawl (third-party, not affiliated with eBay)");
  });
});

describe("launch copy: collection load error", () => {
  it("shows a plain message and keeps the raw error in the console", () => {
    assert.equal(COLLECTION_LOAD_ERROR, "Couldn't load your collection");
    const provider = read("components/collection-provider.tsx");
    assert.match(provider, /console\.warn\(/);
    // Both load paths (first load and reload) show the plain message.
    assert.equal(count(provider, "report(error, COLLECTION_LOAD_ERROR)"), 2);
  });

  it("offers Retry next to the error and keeps the welcome on an empty collection", () => {
    const dash = read("components/dashboard.tsx");
    assert.match(dash, /\{syncError\}[\s\S]{0,200}<button[^>]*type="button"[^>]*onClick=\{\(\) => void reload\(\)\}[^>]*>\s*Retry\s*<\/button>/);
    assert.match(dash, /className="[^"]*hit-44[^"]*"[^>]*>\s*Retry/);
    assert.doesNotMatch(dash, /syncError \? null :/);
    assert.match(
      dash,
      /shouldShowFirstCardWelcome\(\{ cardCount: cards\.length, ready, syncError: loadFailed \? syncError : null \}\) \? \(\s*<FirstCardWelcome \/>/,
    );
    // A failed load shows Couldn't load with Try again, never the welcome.
    assert.match(dash, /if \(loadFailed && cards\.length === 0\)[\s\S]{0,300}<ReadRetry title=\{COLLECTION_LOAD_ERROR\} onRetry=\{reload\} \/>/);
  });
});

describe("launch copy: about, privacy and metadata", () => {
  it("says what Slabhold is and links Privacy next to Terms and Support", () => {
    const about = read("app/(app)/about/page.tsx").replace(/\s+/g, " ");
    assert.match(
      about,
      /Slabhold is where sports card collectors comp their cards with recent sold prices, track what their collection is worth, and talk cards\./,
    );
    const terms = about.indexOf('href="/terms"');
    const privacy = about.indexOf('href="/privacy"');
    const support = about.indexOf('href="/support"');
    assert.ok(terms > 0 && privacy > 0 && support > 0);
  });

  it("drops the unset support email fallback from Privacy", () => {
    const privacy = read("app/(app)/privacy/page.tsx");
    assert.doesNotMatch(privacy, /not set up yet|TODO/);
    assert.match(privacy, /href=\{`mailto:\$\{email\}`\}/);
  });

  it("adds the Apple smart banner for the App Store app", () => {
    assert.match(read("app/layout.tsx"), /itunes: \{ appId: "6831357026" \}/);
  });
});

describe("launch copy: App Store link", () => {
  it("links to the App Store listing without saying free", () => {
    assert.equal(APP_STORE_URL, "https://apps.apple.com/app/id6831357026");
    const source = read("components/landing/app-store-link.tsx");
    assert.doesNotMatch(source, /free/i);
    assert.match(source, /^"use client";/);
  });

  it("holds its row but draws no link on the server, so the landing page stays server-rendered", () => {
    const server = renderToStaticMarkup(createElement(AppStoreLink));
    assert.match(server, /data-app-store-link=""[^>]*class="[^"]*min-h-11/);
    assert.doesNotMatch(server, /<a\b/);
    assert.doesNotMatch(read("components/landing-page.tsx"), /"use client"/);
    // The landing page draws it as buttons now: the hero's "Get the app" and the closing store badge.
    const landing = read("components/landing-page.tsx");
    assert.equal(count(landing, '<AppStoreBadge variant="button" />'), 1);
    assert.equal(count(landing, '<AppStoreBadge variant="badge" />'), 1);
    assert.ok(landing.indexOf('<AppStoreBadge variant="badge" />') > landing.indexOf("<LandingCta />"));
  });

  it("shows the link on the web and hides it inside the iOS app", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(createElement(AppStoreLink)));
    const link = host.querySelector("a");
    assert.ok(link);
    assert.match(link.className, /min-h-11/);
    assert.equal(link.textContent, "Get Slabhold on the App Store");
    assert.equal(link.getAttribute("href"), APP_STORE_URL);
    act(() => root.unmount());

    const win = window as Window & { Capacitor?: { isNativePlatform: () => boolean } };
    win.Capacitor = { isNativePlatform: () => true };
    try {
      const native = createRoot(host);
      act(() => native.render(createElement(AppStoreLink)));
      assert.equal(host.querySelector("a"), null);
      act(() => native.unmount());
    } finally {
      delete win.Capacitor;
      host.remove();
    }
  });
});

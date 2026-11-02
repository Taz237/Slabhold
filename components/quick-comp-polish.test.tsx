import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DeltaChip, RangeBar, SalesChart, TRAWL_ATTRIBUTION } from "@/components/sales-chart";
import { CompsList } from "@/components/comps-list";
import { CompEmpty } from "@/components/comp-basis";
import { SalesChartPending } from "@/components/card-detail-shell";
import { addDays } from "@/lib/chart/range";
import type { ChartSale } from "@/lib/chart/sales";
import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";
import type { CompListing } from "@/lib/types";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const today = snapshotDateInNewYork();
const card = { id: "fixture-card", estimatedSellPrice: 0, purchasePrice: 0 };

/** Sample sales only: a slow climb over 40 days, so the 30-day chip is up. */
const rising: ChartSale[] = [40, 32, 24, 16, 8, 2].map((ago, index) => ({
  id: `s${index}`,
  price: 30 + index,
  date: addDays(today, -ago),
  grade: "PSA 10",
  source: "eBay",
}));
const falling: ChartSale[] = rising.map((sale, index) => ({ ...sale, price: 40 - index }));

function chart(props: Record<string, unknown>) {
  return renderToStaticMarkup(
    createElement(SalesChart, {
      card,
      sales: rising,
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

function count(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}

const comps: CompListing[] = [
  {
    id: "c1",
    itemId: "i1",
    title: "2023 Prizm Sample Rookie PSA 10",
    soldPrice: 36,
    soldDate: addDays(today, -3),
    platform: "eBay",
    condition: "PSA 10",
    shipping: null,
    url: "https://example.test/listing/1",
  },
  {
    id: "c2",
    itemId: "i2",
    title: "2023 Prizm Sample Rookie PSA 10 #12",
    soldPrice: 34,
    soldDate: addDays(today, -9),
    platform: "eBay",
    condition: "PSA 10",
    shipping: null,
    url: "https://example.test/listing/2",
  },
];

describe("quick comp: one comp card", () => {
  it("shows the value exactly once", () => {
    const html = chart({});
    assert.equal(count(html, "$35.00"), 1);
    assert.equal(count(html, "data-comp-value"), 1);
    assert.match(html, /Based on 6 sales/);
  });

  it("puts the eyebrow label left and freshness right", () => {
    const html = chart({ heading: "Estimated value" });
    assert.match(html, /Estimated value/);
    assert.match(html, /eBay sold · 2h ago/);
  });

  it("shows an up chip with ▲ in emerald and a down chip with ▼ in rose", () => {
    const up = chart({});
    assert.match(up, /data-delta-chip="up"[^>]*class="[^"]*emerald[^"]*"[^>]*>▲ \d/);
    const down = chart({ sales: falling, median: 36 });
    assert.match(down, /data-delta-chip="down"[^>]*class="[^"]*rose[^"]*"[^>]*>▼ \d/);
    assert.match(renderToStaticMarkup(createElement(DeltaChip, { pct: 4.2 })), />▲ 4\.2%</);
    assert.match(renderToStaticMarkup(createElement(DeltaChip, { pct: -3.1 })), />▼ 3\.1%</);
    assert.match(renderToStaticMarkup(createElement(DeltaChip, { pct: 0 })), />– 0%</);
  });

  it("drops the chip under 3 sales and says how many more it needs", () => {
    const html = chart({ sales: rising.slice(0, 2), count: 2, median: 31 });
    assert.doesNotMatch(html, /data-delta-chip/);
    assert.match(html, /Needs 1 more sale to show a trend/);
  });

  it("draws the range bar only for an estimate with p25 and p75", () => {
    const estimate = chart({});
    assert.match(estimate, /data-range-bar/);
    assert.match(estimate, /Low \$33\.00/);
    assert.match(estimate, /High \$37\.00/);
    assert.doesNotMatch(chart({ p25: null, p75: null }), /data-range-bar/);
    assert.doesNotMatch(
      chart({ headlineIsEstimate: false, headlineLabel: "Last sold $36.00 on Oct 9" }),
      /data-range-bar/,
    );
    const bar = renderToStaticMarkup(createElement(RangeBar, { low: 10, high: 20, median: 15 }));
    assert.match(bar, /bg-violet-600\/25/);
    assert.match(bar, /bg-violet-600/);
  });

  it("keeps the Trawl attribution with live sold data", () => {
    assert.ok(chart({}).includes(TRAWL_ATTRIBUTION));
    assert.equal(TRAWL_ATTRIBUTION, "Sold data via Trawl (third-party, not affiliated with eBay)");
  });
});

describe("quick comp: recent sales rows", () => {
  const rows = renderToStaticMarkup(
    createElement(CompsList, { comps, cardId: "fixture-card", onSelect: () => {}, selectedId: "c2" }),
  );

  it("puts the price before the title", () => {
    assert.ok(rows.indexOf("$36.00") < rows.indexOf("2023 Prizm Sample Rookie PSA 10"));
  });

  it("selects the sale from the whole row and links out with a small ↗", () => {
    assert.match(rows, /aria-pressed="true"/);
    assert.match(rows, /aria-label="Show the \$36\.00 sale from [^"]+ on the chart"/);
    assert.match(rows, /<a [^>]*aria-label="Open listing on eBay"[^>]*>|<a [^>]*class="[^"]*hit-44[^"]*"[^>]*aria-label="Open listing on eBay"/);
    assert.match(rows, /class="[^"]*hit-44[^"]*"[^>]*aria-label="Open listing on eBay"|aria-label="Open listing on eBay"[^>]*class="[^"]*hit-44/);
    assert.match(rows, /3d/);
  });

  it("marks the selected row with a violet edge", () => {
    assert.match(rows, /data-selected=""[^>]*class="[^"]*bg-violet-500\/10[^"]*"/);
  });
});

describe("quick comp: states", () => {
  it("never shows $0 when there are no sales", () => {
    const empty = renderToStaticMarkup(createElement(CompEmpty, {}));
    assert.match(empty, /No sales yet/);
    assert.match(empty, /We&#x27;ll show a value once this card sells on eBay\./);
    assert.doesNotMatch(empty, /\$0/);
    const none = chart({ sales: [], count: 0, median: null, p25: null, p75: null });
    assert.doesNotMatch(none, /\$0/);
  });

  it("draws the loading skeleton in the final shapes", () => {
    const html = renderToStaticMarkup(createElement(SalesChartPending, {}));
    assert.match(html, /skeleton-shimmer/);
    assert.match(html, /data-skeleton="hero"/);
    assert.match(html, /data-skeleton="chip"/);
    assert.match(html, /data-skeleton="plot"/);
  });
});

describe("quick comp: brand and motion", () => {
  const files = [
    "components/sales-chart.tsx",
    "components/comps-list.tsx",
    "components/comp-basis.tsx",
    "components/card-detail-shell.tsx",
    "components/public-card-view.tsx",
  ];

  it("has no teal or cyan class anywhere in the comp section", () => {
    const markup = [
      chart({}),
      chart({ sales: falling, median: 36 }),
      renderToStaticMarkup(createElement(CompsList, { comps, onSelect: () => {} })),
      renderToStaticMarkup(createElement(CompEmpty, {})),
      renderToStaticMarkup(createElement(SalesChartPending, {})),
    ].join("\n");
    for (const match of markup.matchAll(/class="([^"]*)"/g)) {
      assert.doesNotMatch(match[1], /teal|cyan/, match[1]);
    }
    for (const file of files) assert.doesNotMatch(read(file), /\b(?:\w+-)?(?:teal|cyan)-\d/, file);
  });

  it("puts every animation behind motion-safe or a reduced-motion rule", () => {
    const css = read("app/globals.css");
    const reduced = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)]
      .map((block) => block[1])
      .join("\n");
    for (const file of ["components/sales-chart.tsx", "components/comps-list.tsx", "components/comp-basis.tsx"]) {
      const source = read(file);
      for (const token of source.match(/[\w:-]*animate-[\w[\]/.-]+/g) ?? []) {
        assert.ok(token.startsWith("motion-safe:"), `${file}: ${token}`);
      }
      for (const name of source.match(/\bcomp-(?:reveal|fade|chip-in|row-in)\b/g) ?? []) {
        assert.match(reduced, new RegExp(`\\.${name}\\b`), `${file}: .${name} needs a reduced-motion rule`);
      }
    }
    assert.match(reduced, /\.skeleton-shimmer/);
  });
});

describe("quick comp: Trawl attribution never drops with live rows on screen", () => {
  it("leaves the comp card's skeleton without the Trawl line", () => {
    const html = chart({ loading: true });
    assert.equal(html.includes(TRAWL_ATTRIBUTION), false);
  });

  it("keeps the line on the sales list until the comp card has drawn live data", () => {
    const view = read("components/public-card-view.tsx");
    assert.match(
      view,
      /const chartShowsAttribution =\s*chartCard && Boolean\(SalesChart\) && !chartFailed && !valueLoading && shownValue\?\.status !== "sample";/,
    );
    assert.match(view, /usingLive && !compsLoading && !authRequired && !chartShowsAttribution/);
    const detail = read("components/card-detail.tsx");
    assert.match(
      detail,
      /usingLive && !compsLoading && !authRequired && !\(showChart && SalesChart && shownValue\?\.status !== "sample"\)/,
    );
  });
});

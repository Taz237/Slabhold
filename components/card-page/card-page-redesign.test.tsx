import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CardHeading, cardSpecs } from "@/components/card-page/card-heading";
import { CardStage } from "@/components/card-page/card-stage";
import { CardStageSkeleton, STAGE_HEIGHT } from "@/components/card-page/card-stage-frame";
import { CardValue } from "@/components/card-page/card-value";
import { CategorySwitch } from "@/components/card-page/category-switch";
import { SalePlot } from "@/components/card-page/sale-plot";
import { PriceInfo } from "@/components/card-page/price-info";
import {
  PRICE_INFO_LABEL,
  PlotEmpty,
  ValuePending,
  priceInfoLines,
  valueHeadline,
} from "@/components/card-page/value-head";
import { CardTalkEmpty } from "@/components/card-talk-frame";
import { CompsList } from "@/components/comps-list";
import { buildSalePlot, nearestDot, plotMoney, saleLineOrder } from "@/lib/chart/sale-plot";
import { splitOutliers, type ChartSale } from "@/lib/chart/sales";
import { PRICE_BASIS_LINE, TRAWL_ATTRIBUTION } from "@/lib/comps/price-basis";
import type { PriceRead } from "@/lib/value/price-fallback";
import type { CompListing } from "@/lib/types";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/** The redesign's own files. */
const NEW_FILES = [
  "components/card-page/card-heading.tsx",
  "components/card-page/card-stage.tsx",
  "components/card-page/card-stage-frame.tsx",
  "components/card-page/card-value.tsx",
  "components/card-page/price-info.tsx",
  "components/card-page/sale-plot.tsx",
  "components/card-page/section-styles.ts",
  "components/card-page/value-head.tsx",
  "lib/chart/sale-plot.ts",
  "lib/chart/comp-ranges.ts",
];
/** Every file the card pages draw from. */
const PAGE_FILES = [
  ...NEW_FILES,
  // Holds the stored category id, which is data, not copy: its words on screen are checked below.
  "components/card-page/category-switch.tsx",
  "components/public-card-view.tsx",
  "components/card-detail.tsx",
  "components/card-detail-shell.tsx",
  "components/public-card-skeleton.tsx",
  "components/card-talk-frame.tsx",
];

const estimate: PriceRead = { kind: "estimate", text: "$34.00", isEstimate: true, showEbaySold: false };
const lastSale: PriceRead = { kind: "last_sale", text: "Last sold $24.50 on Oct 2", isEstimate: false, showEbaySold: false };

/** Made-up sales, a few days apart. Test data only. */
function sales(count: number): ChartSale[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `s${index}`,
    price: 30 + ((index * 7) % 11),
    date: `2026-10-${String(2 + index * 2).padStart(2, "0")}`,
    grade: index % 2 ? "PSA 10" : null,
  }));
}

const count = (html: string, needle: string) => html.split(needle).length - 1;
const plot = (list: ChartSale[], props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(SalePlot, { sales: list, ariaLabel: "Recent sales", width: 358, ...props }));
const value = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(CardValue, { read: estimate, ...props } as never));

describe("card page chart: the real sales, nothing else", () => {
  it("never smooths: no monotonePath, no trend line, not the shared ValueChart", () => {
    for (const file of ["components/card-page/sale-plot.tsx", "lib/chart/sale-plot.ts"]) {
      const src = read(file);
      assert.doesNotMatch(src, /monotonePath|smoothStepPath|saleTrend|resampleY/, file);
      assert.doesNotMatch(src, /charts\/value-chart"/, file);
    }
    const section = read("components/card-page/card-value.tsx");
    assert.doesNotMatch(section, /monotonePath|ValueChart|medianLayers|RangeBar/);
    for (const page of ["components/public-card-view.tsx", "components/card-detail.tsx"]) {
      const src = read(page);
      assert.doesNotMatch(src, /monotonePath|@\/components\/sales-chart|charts\/value-chart"/, page);
    }
    // The scrub chunk (press, drag, keys, the haptic tick) is the shared one.
    assert.match(read("components/card-page/sale-plot.tsx"), /import\("@\/components\/charts\/value-chart-scrub"\)/);
  });

  it("draws straight segments only, corner to corner through the sales", () => {
    for (const n of [2, 3, 12]) {
      const html = plot(sales(n));
      const d = html.match(/data-sale-line="" d="([^"]+)"/)?.[1] ?? "";
      assert.match(d, /^M[\d. ]+(L[\d. ]+)+$/, `${n} sales: ${d}`);
      assert.equal(count(d, "L") + 1, n, `${n} sales: one corner per sale`);
    }
  });

  it("puts one dot on every real sale, and no dot anywhere else", () => {
    for (const n of [1, 2, 3, 12]) assert.equal(count(plot(sales(n)), "data-sale-dot="), n, `${n} sales`);
    assert.equal(count(value({ amount: 34, count: 3, sales: sales(3), live: true }), "data-sale-dot="), 0, "nothing drawn before the plot has a width");
  });

  it("puts every corner on a real sale's own date and price", () => {
    const list = sales(7);
    const built = buildSalePlot({ sales: list, value: 34, width: 358, height: 208 })!;
    assert.equal(built.dots.length, list.length);
    assert.equal(built.vertices.length, list.length);
    assert.deepEqual([...built.vertices.map((dot) => dot.sale.id)].sort(), list.map((sale) => sale.id).sort());
    for (const dot of built.vertices) {
      const twin = built.dots.find((item) => item.sale.id === dot.sale.id)!;
      assert.equal(dot.x, twin.x);
      assert.equal(dot.y, twin.y);
    }
    // Higher prices sit higher, and later sales sit further right.
    const byPrice = [...built.dots].sort((a, b) => a.sale.price - b.sale.price);
    for (let i = 1; i < byPrice.length; i++) assert.ok(byPrice[i].y <= byPrice[i - 1].y);
    const byDate = [...built.dots].sort((a, b) => a.sale.date.localeCompare(b.sale.date));
    for (let i = 1; i < byDate.length; i++) assert.ok(byDate[i].x > byDate[i - 1].x);
  });

  it("keeps outliers as hollow dots, off the line", () => {
    const list: ChartSale[] = [...sales(8), { id: "wild", price: 900, date: "2026-10-09" }];
    const split = splitOutliers(list);
    assert.deepEqual(split.outliers.map((sale) => sale.id), ["wild"]);
    const hollow = new Set(split.outliers.map((sale) => sale.id));
    const html = plot(list, { hollowIds: hollow });
    assert.equal(count(html, 'data-sale-dot="outlier"'), 1);
    assert.equal(count(html, 'data-sale-dot="sale"'), 8);
    const built = buildSalePlot({ sales: list, hollow, width: 358, height: 208 })!;
    assert.equal(built.vertices.length, 8);
    assert.ok(!built.vertices.some((dot) => dot.sale.id === "wild"));
  });

  it("marks the current value once, with a dashed line", () => {
    const html = plot(sales(5), { value: 34 });
    assert.equal(count(html, "data-sale-value"), 1);
    assert.match(html, /stroke-dasharray="3 4"/);
    assert.equal(count(plot(sales(5)), "data-sale-value"), 0, "no value, no line");
  });

  it("looks meant at 1, 2 and 3 sales", () => {
    const one = plot(sales(1));
    assert.equal(count(one, "data-sale-line"), 0, "one sale has no line");
    assert.match(one, /data-sale-label=""[^>]*>\$30\.00</, "one sale is a dot with its price");
    const built = buildSalePlot({ sales: sales(1), width: 358, height: 208 })!;
    assert.ok(Math.abs(built.dots[0].x - built.plotRight / 2) < 1, "and it sits in the middle");
    for (const n of [2, 3]) {
      const few = buildSalePlot({ sales: sales(n), width: 358, height: 208 })!;
      assert.ok(few.dots[0].x >= few.plotRight * 0.15, `${n} sales: room on the left`);
      assert.ok(few.dots[n - 1].x <= few.plotRight * 0.85, `${n} sales: room on the right`);
      for (const dot of few.dots) assert.ok(dot.y > few.top + 8 && dot.y < few.bottom - 8, `${n} sales: room above and below`);
    }
  });

  it("keeps labels few: the first and last date, the high and the low", () => {
    const built = buildSalePlot({ sales: sales(12), value: 34, width: 358, height: 208 })!;
    assert.ok(built.dates.length <= 2);
    assert.ok(built.ticks.length <= 2);
    assert.equal(buildSalePlot({ sales: sales(1), width: 358, height: 208 })!.dates.length, 1);
    assert.equal(plotMoney(212.49), "$212");
    assert.equal(plotMoney(28.5), "$28.50");
    assert.equal(plotMoney(30), "$30");
    assert.equal(plotMoney(1250), "$1.25K");
  });

  it("orders same-day sales so the line does not zigzag", () => {
    const day: ChartSale[] = [
      { id: "a", price: 10, date: "2026-10-01" },
      { id: "b", price: 40, date: "2026-10-02" },
      { id: "c", price: 20, date: "2026-10-02" },
      { id: "d", price: 45, date: "2026-10-03" },
    ];
    assert.deepEqual(saleLineOrder(day).map((sale) => sale.id), ["a", "c", "b", "d"]);
  });

  it("picks the dot under the finger, also among sales stacked on one day", () => {
    const dots = [
      { x: 20, y: 100 },
      { x: 120, y: 40 },
      { x: 120, y: 150 },
      { x: 300, y: 90 },
    ];
    assert.equal(nearestDot(dots, 10, 50), 0);
    assert.equal(nearestDot(dots, 124, 140), 2);
    assert.equal(nearestDot(dots, 118, 30), 1);
    assert.equal(nearestDot(dots, 280, 10), 3);
  });

  it("draws in once, and not at all with reduced motion", () => {
    const css = read("app/globals.css");
    const reduced = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map((block) => block[1]).join("\n");
    for (const name of ["chart-draw", "chart-draw-fill", "chart-fade", "comp-reveal", "comp-chip-in"]) {
      assert.match(reduced, new RegExp(`\\.${name}\\b`), name);
    }
    const src = read("components/card-page/sale-plot.tsx");
    assert.match(src, /observer\.disconnect\(\);/);
    assert.doesNotMatch(src, /chart-pulse|animate-pulse|animate-ping/);
  });
});

describe("card page value: one price, one pill, one line", () => {
  it("shows the estimate big, with one short line", () => {
    const html = value({ amount: 34, count: 12, sales: sales(12), live: true });
    assert.equal(count(html, "data-value-price"), 1);
    assert.match(html, /\$34\.00/);
    assert.match(html, /12 recent sales/);
    assert.doesNotMatch(html, /Based on|Median|Low \$|High \$|data-range-bar/);
  });

  it("keeps the source line reachable behind ⓘ whenever live prices show", () => {
    const html = value({ amount: 34, count: 12, sales: sales(12), live: true });
    assert.match(html, new RegExp(`aria-label="${PRICE_INFO_LABEL}"`));
    assert.match(html, /aria-expanded="false"/);
    assert.equal(html.includes(TRAWL_ATTRIBUTION), false, "it is behind the tap, not on the page");
    const open = renderToStaticMarkup(createElement(PriceInfo, { lines: priceInfoLines(), defaultOpen: true }));
    assert.ok(open.includes(TRAWL_ATTRIBUTION));
    assert.ok(open.includes(PRICE_BASIS_LINE));
    assert.equal(TRAWL_ATTRIBUTION, "Sold data via Trawl (third-party, not affiliated with eBay)");
    // Every list of ⓘ lines ends with the credit, whatever else it says.
    assert.equal(priceInfoLines(["x", null, false]).at(-1), TRAWL_ATTRIBUTION);
  });

  it("keeps the credit in plain sight when the value section is not up", () => {
    const view = read("components/public-card-view.tsx");
    assert.match(view, /!chartShowsAttribution \? \(\s*<p data-trawl-credit=""[^>]*>\s*\{TRAWL_ATTRIBUTION\}/);
    const detail = read("components/card-detail.tsx");
    assert.match(detail, /<p data-trawl-credit=""[^>]*>\s*\{TRAWL_ATTRIBUTION\}/);
  });

  it("says Last sold once", () => {
    const html = value({ read: lastSale, count: 1, sales: sales(1), live: true });
    assert.equal(count(html, "Last sold"), 1);
    assert.match(html, /\$24\.50/);
    assert.match(html, /Oct 2/);
    assert.equal(count(value({ amount: 34, count: 12, sales: sales(12), live: true }).toLowerCase(), "last sold"), 0);
    assert.deepEqual(valueHeadline(lastSale), { label: "Last sold", price: "$24.50", note: "Oct 2" });
    // The pages never add a second line of their own.
    for (const page of ["components/public-card-view.tsx", "components/card-detail.tsx", "components/card-page/card-value.tsx"]) {
      assert.doesNotMatch(read(page), /lastSoldLine|Last sold/, page);
    }
  });

  it("draws a calm empty state for no sales, never $0", () => {
    const none: PriceRead = { kind: "none", text: "No sales found yet", isEstimate: false, showEbaySold: false };
    const html = value({ read: none, count: 0, sales: [], live: true });
    assert.match(html, /data-plot-empty/);
    assert.match(html, /No sales yet/);
    assert.doesNotMatch(html, /\$0/);
    assert.equal(count(html, "data-sale-dot="), 0);
    assert.match(renderToStaticMarkup(createElement(PlotEmpty, {})), /We&#x27;ll show a value once this card has a recent sale/);
  });

  it("shows range buttons only when there are two or more ranges", () => {
    assert.doesNotMatch(value({ amount: 34, count: 5, sales: sales(5), live: true }), /data-comp-ranges/);
  });

  it("holds its place while it loads", () => {
    const html = renderToStaticMarkup(createElement(ValuePending, {}));
    assert.match(html, /min-h-11/);
    assert.match(html, /height:208px/);
    assert.match(html, /aria-busy="true"/);
  });
});

describe("card page hero and title", () => {
  const card = { playerName: "Dax Morrow", photoDataUrl: "https://example.test/card.jpg", accent: "#7c3aed" };

  it("keeps the card whole: its own shape, never cropped or stretched", () => {
    const html = renderToStaticMarkup(createElement(CardStage, { card }));
    assert.match(html, /aria-label="View Dax Morrow full screen"/);
    assert.match(html, /max-height:calc\(min\(72vw, 18\.5rem\) \* 1\.4\)/);
    assert.match(html, /class="block h-auto w-auto /);
    assert.doesNotMatch(html, /object-cover|object-fill|aspect-\[/);
    assert.match(html, /fetchPriority="high"|fetchpriority="high"/);
  });

  it("reserves one stage height for every card, on a purple glow", () => {
    const html = renderToStaticMarkup(createElement(CardStageSkeleton, {}));
    assert.ok(html.includes(`height:${STAGE_HEIGHT}`));
    assert.match(html, /data-card-glow/);
    assert.match(html, /#7c3aed/);
    const frame = read("components/card-page/card-stage-frame.tsx");
    // Still gradients only: nothing to repaint while the page scrolls.
    assert.doesNotMatch(frame, /backdrop-filter|filter:|animate-|blur-/);
    // A card with no photo gets the designed tile, not a broken image.
    const bare = renderToStaticMarkup(createElement(CardStage, { card: { ...card, photoDataUrl: null } }));
    assert.doesNotMatch(bare, /<img/);
    assert.match(bare, /DM/);
  });

  it("sets the set small, the player big and the specs as one plain line", () => {
    const specs = cardSpecs({ setBrand: "Prizm", cardNumber: "160", parallel: "silver ", grade: "PSA 10", sport: "Basketball" }, () => "Silver");
    assert.deepEqual(specs, ["Basketball", "#160", "Silver", "PSA 10"]);
    assert.deepEqual(cardSpecs({ setBrand: "Prizm", cardNumber: "—", parallel: "", grade: "" }), []);
    const html = renderToStaticMarkup(
      createElement(CardHeading, { eyebrow: "2018 Prizm", name: "Dax Morrow", specs, action: createElement("button", { "aria-label": "Add to want list" }) }),
    );
    assert.ok(html.indexOf("2018 Prizm") < html.indexOf("<h1"));
    assert.doesNotMatch(html, /<dl|<dt|rounded-full border/, "no boxed chips");
    assert.match(html, /<div class="shrink-0">/, "the action keeps its own fixed slot");
  });

  it("makes the want list a 44px star with a spoken label", () => {
    const src = read("components/want-button.tsx");
    assert.match(src, /grid h-11 w-11 place-items-center rounded-full/);
    assert.match(src, /data-want-star=""\s+aria-pressed=\{Boolean\(want\)\}\s+aria-label=\{label\}/);
    assert.match(read("components/public-card-view.tsx"), /<WantButton\s+compact/);
  });
});

describe("card page sales rows and community", () => {
  const comps: CompListing[] = [
    {
      id: "c1",
      itemId: "i1",
      title: "A very long made-up listing title that used to fill the row",
      soldPrice: 36,
      soldDate: "2026-10-26",
      platform: "eBay",
      condition: "PSA 10",
      shipping: null,
      url: "https://example.test/sale/1",
    },
  ];

  it("shows price, grade and a short date, without the listing title", () => {
    const html = renderToStaticMarkup(createElement(CompsList, { compact: true, comps, onSelect: () => {}, canFlag: true, cardId: "card" }));
    const visible = html.replace(/aria-label="[^"]*"/g, "");
    assert.match(visible, /\$36\.00/);
    assert.match(visible, /PSA 10/);
    assert.match(visible, /Oct 26/);
    assert.doesNotMatch(visible, /very long made-up listing title/);
    // The sale link, the chart highlight and the owner's menu all stay.
    assert.match(html, /aria-label="Open the sold listing"/);
    assert.match(html, /aria-pressed="false"/);
    assert.match(html, /aria-haspopup="menu"/);
  });

  it("names the owner's two piles in plain words", () => {
    const html = renderToStaticMarkup(createElement(CategorySwitch, { value: "pc", onChange: () => {} }));
    const text = html.replace(/<[^>]+>/g, " ");
    assert.match(text, /For sale/);
    assert.match(text, /Personal collection/);
    assert.doesNotMatch(text, /flip/i);
    assert.equal(html.split('role="radio"').length - 1, 2);
    assert.match(html, /aria-checked="true"[^>]*>Personal collection|Personal collection/);
  });

  it("gives the posts section a warm empty state", () => {
    const html = renderToStaticMarkup(createElement(CardTalkEmpty, {}));
    assert.match(html, /Nobody has posted about this card yet/);
    const frame = read("components/card-talk-frame.tsx");
    assert.match(frame, /"Post about this card"/);
    assert.match(frame, /min-h-11/);
  });
});

describe("card page rules", () => {
  it("uses no banned copy", () => {
    const markup = [
      value({ amount: 34, count: 3, sales: sales(3), live: true }),
      value({ read: lastSale, count: 1, sales: sales(1), live: true }),
      renderToStaticMarkup(createElement(PriceInfo, { lines: priceInfoLines(["Few sales, rough value"]), defaultOpen: true })),
      renderToStaticMarkup(createElement(PlotEmpty, {})),
      renderToStaticMarkup(createElement(CardTalkEmpty, {})),
      renderToStaticMarkup(createElement(ValuePending, {})),
    ]
      .join("\n")
      .replace(/<[^>]+>/g, " ");
    for (const word of [/\bbest\b/i, /\bAI\b/, /\bfree\b/i, /number one/i, /flip/i, /mail day/i]) {
      assert.doesNotMatch(markup, word);
    }
    // The words in the new files' own strings and comments, too.
    for (const file of NEW_FILES) {
      const src = read(file);
      for (const word of [/\bbest\b/i, /\bAI\b/, /\bfree\b/i, /number one/i, /flip/i]) assert.doesNotMatch(src, word, file);
    }
  });

  it("is Slabhold purple, never teal: no teal or cyan class, no color with a hue from 160° to 200°", () => {
    for (const file of PAGE_FILES) {
      const src = read(file);
      assert.doesNotMatch(src, /\b(?:teal|cyan|emerald|sky)-\d/, file);
      for (const match of src.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
        const [r, g, b] = [0, 2, 4].map((at) => parseInt(match[1].slice(at, at + 2), 16) / 255);
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max - min < 0.08) continue; // a gray has no hue
        const raw = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
        const hue = (raw * 60 + 360) % 360;
        assert.ok(hue < 160 || hue > 200, `${file}: ${match[0]} has hue ${Math.round(hue)}°`);
      }
    }
  });

  it("adds no team or league logo and no boxes inside boxes on the value section", () => {
    for (const file of NEW_FILES) assert.doesNotMatch(read(file), /logo|\.png|\.svg"/i, file);
    const html = value({ amount: 34, count: 3, sales: sales(3), live: true });
    assert.doesNotMatch(html, /ring-1 ring-zinc-950\/5|rounded-2xl bg-white p-4/);
  });
});

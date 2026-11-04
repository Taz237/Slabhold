import assert from "node:assert/strict";
import { after, afterEach, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { ValueChart, type ChartPoint } from "@/components/charts/value-chart";
import { ValueSpark } from "@/components/charts/value-spark";
import { chartHaptic, pressAt, release, scrubTo, type ScrubState } from "@/components/charts/value-chart-scrub";
import { DeltaChip, SalesChart, compRanges } from "@/components/sales-chart";
import { addDays } from "@/lib/chart/range";
import type { ChartSale } from "@/lib/chart/sales";
import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
const win = dom.window;

function expose(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

/** The chart's box width, as a ResizeObserver would report it. */
let boxWidth = 300;
class SizedResizeObserver {
  constructor(private callback: (entries: { contentRect: { width: number } }[]) => void) {}
  observe() {
    this.callback([{ contentRect: { width: boxWidth } }]);
  }
  disconnect() {}
}

/** Every IntersectionObserver the charts make, so a test can scroll them in and out. */
const observers: FakeIntersectionObserver[] = [];
class FakeIntersectionObserver {
  node: Element | null = null;
  constructor(private callback: (entries: { isIntersecting: boolean; intersectionRatio: number }[]) => void) {
    observers.push(this);
  }
  observe(node: Element) {
    this.node = node;
  }
  disconnect() {}
  show(on: boolean) {
    act(() => this.callback([{ isIntersecting: on, intersectionRatio: on ? 1 : 0 }]));
  }
}

let reduce = false;
let visibility: DocumentVisibilityState = "visible";
Object.defineProperty(win, "matchMedia", {
  configurable: true,
  value: (query: string) => ({ matches: query.includes("reduce") ? reduce : false, addEventListener() {}, removeEventListener() {} }),
});
Object.defineProperty(win.document, "visibilityState", { configurable: true, get: () => visibility });

expose("window", win);
expose("self", win);
expose("document", win.document);
expose("navigator", win.navigator);
expose("HTMLElement", win.HTMLElement);
expose("SVGElement", win.SVGElement);
expose("Node", win.Node);
expose("Element", win.Element);
expose("MouseEvent", win.MouseEvent);
expose("KeyboardEvent", win.KeyboardEvent);
expose("ResizeObserver", SizedResizeObserver);
expose("IntersectionObserver", FakeIntersectionObserver);
expose("requestAnimationFrame", win.requestAnimationFrame.bind(win));
expose("cancelAnimationFrame", win.cancelAnimationFrame.bind(win));
expose("IS_REACT_ACT_ENVIRONMENT", true);

after(() => win.close());

let mounted: { root: Root; host: HTMLElement }[] = [];
afterEach(() => {
  for (const { root, host } of mounted) {
    act(() => root.unmount());
    host.remove();
  }
  mounted = [];
  observers.length = 0;
  boxWidth = 300;
  reduce = false;
  visibility = "visible";
});

async function mount(element: ReturnType<typeof createElement>) {
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  mounted.push({ root, host });
  return {
    host,
    rerender: (next: ReturnType<typeof createElement>) => act(async () => root.render(next)),
  };
}

function pointer(target: Element, type: string, clientX: number) {
  const event = new win.MouseEvent(type, { bubbles: true, clientX });
  Object.defineProperty(event, "pointerType", { value: "touch" });
  Object.defineProperty(event, "pointerId", { value: 1 });
  target.dispatchEvent(event);
}

async function wait(ms = 40) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

const points: ChartPoint[] = [
  { date: "2026-10-01", value: 41 },
  { date: "2026-10-10", value: 120, marker: "+ Jordan Love PSA 10" },
  { date: "2026-10-20", value: 200 },
  { date: "2026-10-30", value: 285 },
];

const today = snapshotDateInNewYork();
const card = { id: "fixture-card", estimatedSellPrice: 0, purchasePrice: 0 };
/** Six sales over 40 days, climbing: the 30-day chip is up. */
const rising: ChartSale[] = [40, 32, 24, 16, 8, 2].map((ago, index) => ({
  id: `s${index}`,
  price: 30 + index,
  date: addDays(today, -ago),
  grade: "PSA 10",
  source: "eBay",
}));
const falling: ChartSale[] = rising.map((sale, index) => ({ ...sale, price: 40 - index }));
/** Six sales inside 20 days. */
const recent: ChartSale[] = rising.map((sale, index) => ({ ...sale, date: addDays(today, -(20 - index * 3)) }));

function comp(props: Record<string, unknown> = {}) {
  return createElement(SalesChart, {
    card,
    sales: rising,
    source: "trawl",
    sample: false,
    lockedToComps: true,
    median: 35,
    p25: 33,
    p75: 37,
    count: 6,
    ...props,
  } as Parameters<typeof SalesChart>[0]);
}

function toneOf(className: string): string | null {
  return className.match(/text-(emerald|rose|violet|zinc)-600/)?.[1] ?? null;
}

describe("comp chart: the color is the outcome", () => {
  it("draws rising sales emerald, falling sales rose, and the chip always matches the line", async () => {
    for (const [sales, median, line, chip] of [
      [rising, 35, "emerald", "up"],
      [falling, 36, "rose", "down"],
    ] as const) {
      const { host } = await mount(comp({ sales, median }));
      const svg = host.querySelector("svg[role='img']");
      assert.ok(svg);
      assert.equal(toneOf(svg.getAttribute("class") ?? ""), line);
      const pill = host.querySelector("[data-delta-chip]");
      assert.equal(pill?.getAttribute("data-delta-chip"), chip);
      assert.match(pill?.className ?? "", new RegExp(line));
      assert.match(pill?.className ?? "", /rounded-full/);
    }
  });

  it("draws 1-2 sales and sample data in purple, with no line and no band", async () => {
    const { host } = await mount(comp({ sales: rising.slice(4), count: 2, median: 34.5 }));
    const svg = host.querySelector("svg[role='img']");
    assert.equal(toneOf(svg?.getAttribute("class") ?? ""), "violet");
    assert.equal(host.querySelector("[data-chart-line]")?.getAttribute("d"), "");
    assert.equal(host.querySelector("[data-chart-band]"), null);
    assert.equal(host.querySelectorAll("circle").length >= 2, true);
    assert.ok(host.querySelector(".chart-dots-in"), "the dots fade in once");
    assert.match(host.textContent ?? "", /Median \$34\.50/);
    assert.match(host.textContent ?? "", /Needs 1 more sale to show a trend/);

    const sample = await mount(comp({ source: "sample", sample: true, lockedToComps: false, card: { id: "c", estimatedSellPrice: 40, purchasePrice: 20 } }));
    assert.equal(toneOf(sample.host.querySelector("svg[role='img']")?.getAttribute("class") ?? ""), "violet");
  });

  it("never shows color alone: every chip carries an arrow, and no change is gray", () => {
    assert.match(renderToStaticMarkup(createElement(DeltaChip, { pct: 4.2 })), /▲ 4\.2%/);
    assert.match(renderToStaticMarkup(createElement(DeltaChip, { pct: -3.1 })), /▼ 3\.1%/);
    const flat = renderToStaticMarkup(createElement(DeltaChip, { pct: 0 }));
    assert.match(flat, /– 0%/);
    assert.match(flat, /zinc/);
  });
});

describe("comp chart: the median is a labeled band", () => {
  it("draws one band and exactly one solid median label with p25 and p75", async () => {
    const { host } = await mount(comp({}));
    assert.equal(host.querySelectorAll("[data-chart-band]").length, 1);
    assert.equal((host.textContent ?? "").split("Median $35.00").length - 1, 1);
    const median = host.querySelector("[data-chart-median]");
    assert.ok(median);
    assert.equal(median.getAttribute("stroke-dasharray"), null);
    assert.equal(host.querySelector("[stroke-dasharray]:not([data-chart-baseline])"), null);
  });

  it("draws no band without p25 and p75, and still one median label", async () => {
    const { host } = await mount(comp({ p25: null, p75: null }));
    assert.equal(host.querySelector("[data-chart-band]"), null);
    assert.equal((host.textContent ?? "").split("Median $35.00").length - 1, 1);
  });
});

describe("chart axes", () => {
  function labels(host: HTMLElement) {
    return [...host.querySelectorAll("text")].map((node) => node.textContent ?? "");
  }

  it("gives a minimal chart 3 round y labels", async () => {
    const { host } = await mount(createElement(ValueChart, { points, tone: "accent", ariaLabel: "x", minimal: true }));
    const money = labels(host).filter((label) => /^\$/.test(label));
    assert.equal(money.length, 3, money.join(","));
    for (const label of money) assert.match(label, /^\$[\d,]+$/);
  });

  it("shows 2 dates at 320 wide and 3 at 390", async () => {
    const dates = (host: HTMLElement) => labels(host).filter((label) => /^[A-Z][a-z]{2} \d+$/.test(label));
    boxWidth = 320;
    const narrow = await mount(createElement(ValueChart, { points, tone: "up", ariaLabel: "x" }));
    assert.equal(dates(narrow.host).length, 2);
    boxWidth = 390;
    const wide = await mount(createElement(ValueChart, { points, tone: "up", ariaLabel: "x" }));
    assert.equal(dates(wide.host).length, 3);
  });

  it("hides a y label within 12px of the median pill", async () => {
    const { medianLayers } = await import("@/components/charts/median-layer");
    const { host } = await mount(
      createElement(ValueChart, {
        points,
        tone: "up",
        ariaLabel: "x",
        refLine: { value: 150, label: "Median $150.00" },
        layers: medianLayers,
      }),
    );
    const all = labels(host);
    assert.ok(all.includes("Median $150.00"));
    assert.ok(!all.includes("$150"), all.join(","));
    assert.ok(all.includes("$50") && all.includes("$250"), all.join(","));
  });

  it("draws a range baseline at the first value, dashed only when the line is down", async () => {
    const up = await mount(createElement(ValueChart, { points, tone: "up", ariaLabel: "x" }));
    const base = up.host.querySelector("[data-chart-baseline]");
    assert.ok(base);
    assert.equal(base.getAttribute("stroke-dasharray"), null);
    const down = await mount(createElement(ValueChart, { points: [...points].reverse().map((p, i) => ({ ...p, date: points[i].date })), tone: "down", ariaLabel: "x" }));
    assert.ok(down.host.querySelector("[data-chart-baseline]")?.getAttribute("stroke-dasharray"));
  });
});

describe("chart draw-in and pulse", () => {
  it("waits until on screen, draws once, and never replays on a re-render or range change", async () => {
    const first = createElement(ValueChart, { points, tone: "up", ariaLabel: "x", morphKey: "30d" });
    const { host, rerender } = await mount(first);
    const line = () => host.querySelector("[data-chart-line]");
    assert.equal(line()?.getAttribute("class"), "chart-draw-wait");
    assert.equal(line()?.getAttribute("pathLength"), "1");
    observers[0].show(true);
    assert.equal(line()?.getAttribute("class"), "chart-draw");
    const node = line();
    await rerender(createElement(ValueChart, { points: points.slice(1), tone: "up", ariaLabel: "x", morphKey: "7d" }));
    observers[0].show(false);
    observers[0].show(true);
    assert.equal(line(), node, "the same path, so its animation does not restart");
    assert.equal(line()?.getAttribute("class"), "chart-draw");
  });

  it("draws the final frame with no draw class and no pulse under reduced motion", async () => {
    reduce = true;
    const { host } = await mount(createElement(ValueChart, { points, tone: "up", ariaLabel: "x" }));
    observers[0]?.show(true);
    assert.equal(host.querySelector("[data-chart-line]")?.getAttribute("class"), null);
    assert.equal(host.querySelector(".chart-pulse"), null);
    assert.equal(host.querySelector(".chart-draw-fill, .chart-draw-fill-wait"), null);
  });

  it("pauses the pulse off screen and in a hidden tab, and hides it while scrubbing", async () => {
    const { host } = await mount(createElement(ValueChart, { points, tone: "up", ariaLabel: "x", onScrub: () => {} }));
    const box = host.querySelector(".chart-surface");
    assert.ok(box);
    assert.ok(host.querySelector(".chart-pulse"));
    assert.equal(box.hasAttribute("data-chart-paused"), true, "paused until seen");
    observers[0].show(true);
    assert.equal(box.hasAttribute("data-chart-paused"), false);
    observers[0].show(false);
    assert.equal(box.hasAttribute("data-chart-paused"), true);
    observers[0].show(true);
    visibility = "hidden";
    act(() => {
      win.document.dispatchEvent(new win.Event("visibilitychange"));
    });
    assert.equal(box.hasAttribute("data-chart-paused"), true);
    visibility = "visible";
    act(() => {
      win.document.dispatchEvent(new win.Event("visibilitychange"));
    });
    assert.equal(box.hasAttribute("data-chart-paused"), false);

    const svg = host.querySelector("svg");
    assert.ok(svg);
    pointer(svg, "pointerdown", 80);
    await wait();
    assert.equal(host.querySelector(".chart-pulse"), null);
  });
});

describe("chart tooltip", () => {
  it("shows a picked sale's price and date in a pill kept inside the plot at 320 wide", async () => {
    boxWidth = 320;
    const plotRight = 320 - 44;
    const { host } = await mount(comp({ selectedSaleId: "s5", onSelectSale: () => {} }));
    await wait(60);
    const tip = host.querySelector<HTMLElement>("[data-chart-tip]");
    assert.ok(tip, "the tooltip shows once the scrub chunk is in");
    assert.equal(tip.getAttribute("aria-hidden"), "true");
    const sale = rising[5];
    assert.match(tip.textContent ?? "", new RegExp(`^\\$35\\.00 · [A-Z][a-z]{2} \\d+$`));
    assert.ok(sale.date);
    const [, left] = tip.style.transform.match(/translate\((-?[\d.]+)px/) ?? [];
    const width = parseFloat(tip.style.width);
    assert.ok(Number(left) >= 0, tip.style.transform);
    assert.ok(Number(left) + width <= plotRight, `${left} + ${width} > ${plotRight}`);
    const live = host.querySelector("[data-sale-row]");
    assert.match(live?.textContent ?? "", /\$35\.00/);
    assert.equal(live?.getAttribute("aria-live"), "polite");
  });

  it("shows only the date (and what was added) on the collection, since the headline shows the value", async () => {
    const { host } = await mount(
      createElement(ValueChart, { points, tone: "up", ariaLabel: "x", onScrub: () => {}, tooltip: "date" }),
    );
    const svg = host.querySelector("svg");
    assert.ok(svg);
    pointer(svg, "pointerdown", 80);
    await wait();
    const tip = host.querySelector("[data-chart-tip]");
    assert.equal(tip?.textContent, "Oct 10 · + Jordan Love PSA 10");
    assert.doesNotMatch(tip?.textContent ?? "", /\$/);
    pointer(svg, "pointerup", 80);
    await wait();
    assert.equal(host.querySelector("[data-chart-tip]"), null);
  });
});

describe("chart haptic", () => {
  function state(xs: number[]): ScrubState {
    const activeRef = { current: null as number | null };
    return {
      xs,
      withDots: false,
      selectedIndex: -1,
      pressed: { current: true },
      frame: { current: 0 },
      activeRef,
      lastTick: { current: 0 },
      select: (index) => {
        activeRef.current = index;
      },
    };
  }

  it("ticks once per new point, at most every 40ms, never on release", async () => {
    const calls: number[] = [];
    Object.defineProperty(win.navigator, "vibrate", { configurable: true, value: (ms: number) => calls.push(ms) });
    try {
      const s = state([0, 50, 100]);
      pressAt(s, 0, "touch");
      assert.equal(calls.length, 1);
      pressAt(s, 2, "touch");
      assert.equal(calls.length, 1, "same point, no tick");
      pressAt(s, 100, "touch");
      assert.equal(calls.length, 1, "a new point inside 40ms is throttled");
      await new Promise((resolve) => setTimeout(resolve, 50));
      scrubTo(s, 50, "touch");
      await wait(40);
      assert.equal(calls.length, 2);
      release(s);
      assert.equal(calls.length, 2, "no tick on release");
      assert.deepEqual(calls, [4, 4]);
    } finally {
      delete (win.navigator as { vibrate?: unknown }).vibrate;
    }
  });

  it("does not throw without navigator.vibrate", () => {
    assert.equal("vibrate" in win.navigator, false);
    assert.doesNotThrow(() => chartHaptic());
  });
});

describe("comp range chips", () => {
  it("hides the chips when the sales span 30 days or less", async () => {
    assert.deepEqual(compRanges(recent, today), []);
    const { host } = await mount(comp({ sales: recent }));
    assert.equal(host.querySelector("[data-comp-ranges]"), null);
  });

  it("shows 30D and All when they differ, with All selected and today's read", async () => {
    assert.deepEqual(compRanges(rising, today), ["30d", "all"]);
    const { host } = await mount(comp({}));
    const group = host.querySelector("[data-comp-ranges]");
    assert.ok(group);
    await wait(600); // the comp headline's own count-up
    assert.equal(group.getAttribute("role"), "group");
    const pressed = group.querySelector("[aria-pressed='true']");
    assert.equal(pressed?.textContent, "All");
    assert.match(pressed?.className ?? "", /hit-44 h-9 rounded-full text-xs font-semibold/);
    assert.equal(host.querySelector("[data-comp-value]")?.textContent, "$35.00");
    assert.match(host.textContent ?? "", /Based on 6 sales · vs 30 days ago/);
    assert.equal(host.querySelector("[data-delta-chip]")?.getAttribute("data-delta-chip"), "up");
  });

  it("re-reads the median from the sales in the window on 30D", async () => {
    const { host } = await mount(comp({}));
    const thirty = [...host.querySelectorAll("[data-comp-ranges] button")].find((node) => node.textContent === "30D");
    assert.ok(thirty);
    await act(async () => {
      thirty.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    });
    await wait(600);
    // Sales 2, 8, 16 and 24 days ago: $32, $33, $34, $35.
    assert.equal(host.querySelector("[data-comp-value]")?.textContent, "$33.50");
    assert.match(host.textContent ?? "", /Based on 4 sales · past 30 days/);
    assert.equal(host.querySelectorAll("svg circle:not(.chart-pulse)").length, 4);
  });
});

describe("ValueSpark end dot", () => {
  it("ends 2+ points with a dot, and draws nothing for one", () => {
    const two = renderToStaticMarkup(createElement(ValueSpark, { id: "a", points, tone: "up", ariaLabel: "Up" }));
    assert.equal((two.match(/data-spark-end/g) ?? []).length, 1);
    assert.match(two, /stop-opacity="0\.26"/);
    const one = renderToStaticMarkup(createElement(ValueSpark, { id: "b", points: points.slice(0, 1), tone: "up", ariaLabel: "One" }));
    assert.doesNotMatch(one, /data-spark-end|<path/);
  });

  it("keeps a small move small with minSpan", async () => {
    const { sparkPaths } = await import("@/components/charts/value-spark");
    const flat = [
      { date: "2026-10-01", value: 100 },
      { date: "2026-10-30", value: 100.5 },
    ];
    const loose = sparkPaths(flat, 24).end;
    const tight = sparkPaths(flat, 24, 5).end;
    assert.ok(loose && tight);
    // Without a minimum the half-dollar fills the box; with $5 it sits near the middle.
    assert.ok(loose.y < 6, String(loose.y));
    assert.ok(tight.y > 8 && tight.y < 14, String(tight.y));
  });
});

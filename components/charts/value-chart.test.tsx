import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { ValueChart, type ChartPoint } from "@/components/charts/value-chart";
import { ValueSpark } from "@/components/charts/value-spark";
import { SalesChart, moreSalesText, saleLine } from "@/components/sales-chart";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const win = dom.window;

function expose(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

/** Fires once on observe with a 300px box, like a phone-width chart. */
class FixedResizeObserver {
  constructor(private callback: (entries: { contentRect: { width: number } }[]) => void) {}
  observe() {
    this.callback([{ contentRect: { width: 300 } }]);
  }
  disconnect() {}
}

expose("window", win);
expose("self", win);
expose("document", win.document);
expose("navigator", win.navigator);
expose("HTMLElement", win.HTMLElement);
expose("SVGElement", win.SVGElement);
expose("Node", win.Node);
expose("Element", win.Element);
expose("MouseEvent", win.MouseEvent);
expose("ResizeObserver", FixedResizeObserver);
expose("IS_REACT_ACT_ENVIRONMENT", true);

after(() => win.close());

const points: ChartPoint[] = [
  { date: "2026-10-01", value: 41 },
  { date: "2026-10-10", value: 120, marker: "+ Jordan Love PSA 10" },
  { date: "2026-10-20", value: 200 },
  { date: "2026-10-30", value: 285 },
];

async function mount(element: ReturnType<typeof createElement>) {
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  return { host, root };
}

function pointer(target: Element, type: string, clientX: number) {
  const event = new win.MouseEvent(type, { bubbles: true, clientX });
  Object.defineProperty(event, "pointerType", { value: "touch" });
  Object.defineProperty(event, "pointerId", { value: 1 });
  target.dispatchEvent(event);
}

async function frame() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
}

describe("ValueChart scrub", () => {
  it("maps a press and drag to the nearest point, and snaps back on release", async () => {
    const seen: (ChartPoint | null)[] = [];
    const { host, root } = await mount(
      createElement(ValueChart, {
        points,
        tone: "up",
        ariaLabel: "Collection value $285.00, up 595% past 30 days",
        onScrub: (point: ChartPoint | null) => seen.push(point),
      }),
    );
    const svg = host.querySelector("svg");
    assert.ok(svg);
    assert.equal(svg.getAttribute("aria-label"), "Collection value $285.00, up 595% past 30 days");
    assert.equal(svg.style.touchAction, "pan-y");

    // Plot is 300 - 44 = 256 wide over 29 days: Oct 10 sits near x = 79.
    pointer(svg, "pointerdown", 80);
    await frame();
    assert.equal(seen.at(-1)?.value, 120);
    assert.match(host.textContent ?? "", /\+ Jordan Love PSA 10/);

    pointer(svg, "pointermove", 250);
    await frame();
    assert.equal(seen.at(-1)?.value, 285);

    pointer(svg, "pointerup", 250);
    await frame();
    assert.equal(seen.at(-1), null);

    await act(async () => root.unmount());
  });

  it("draws three quiet y labels, at most four dates, an ATH label, and one latest dot", async () => {
    const { host, root } = await mount(
      createElement(ValueChart, { points, tone: "up", ariaLabel: "x", showAth: true }),
    );
    const labels = [...host.querySelectorAll("text")].map((node) => node.textContent ?? "");
    const money = labels.filter((label) => /^\$\d+$/.test(label));
    assert.ok(money.length >= 2 && money.length <= 3, labels.join(","));
    const dates = labels.filter((label) => /^[A-Z][a-z]{2} \d+$/.test(label));
    assert.ok(dates.length >= 2 && dates.length <= 4, labels.join(","));
    assert.ok(labels.includes("ATH $285"), labels.join(","));
    // The latest point plus its pulse ring. No dot on every point.
    assert.ok(host.querySelectorAll("circle").length <= 2);
    await act(async () => root.unmount());
  });

  it("moves with the arrow keys for keyboard users", async () => {
    const seen: (ChartPoint | null)[] = [];
    const { host, root } = await mount(
      createElement(ValueChart, { points, tone: "up", ariaLabel: "x", onScrub: (point: ChartPoint | null) => seen.push(point) }),
    );
    const svg = host.querySelector("svg");
    assert.ok(svg);
    await act(async () => {
      svg.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    assert.equal(seen.at(-1)?.value, 285);
    await act(async () => {
      svg.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    assert.equal(seen.at(-1), null);
    await act(async () => root.unmount());
  });
});

describe("ValueSpark", () => {
  it("draws a line for two points and nothing broken for one", () => {
    const two = renderToStaticMarkup(createElement(ValueSpark, { id: "a", points, tone: "down", ariaLabel: "Down 5%" }));
    assert.match(two, /<path d="M/);
    assert.match(two, /text-rose-600/);
    const one = renderToStaticMarkup(
      createElement(ValueSpark, { id: "b", points: points.slice(0, 1), tone: "up", ariaLabel: "One day" }),
    );
    assert.doesNotMatch(one, /<path/);
    assert.match(one, /aria-label="One day"/);
  });
});

const card = { id: "c1", estimatedSellPrice: 35, purchasePrice: 20 };
const sales = [
  { id: "s1", price: 34, date: "2026-10-01", grade: "PSA 10", source: "eBay" },
  { id: "s2", price: 36, date: "2026-10-05", grade: "PSA 10", source: "eBay" },
  { id: "s3", price: 33, date: "2026-10-09", grade: "PSA 10", source: "eBay" },
  { id: "s4", price: 35, date: "2026-10-13", grade: "PSA 10", source: "eBay" },
  { id: "s5", price: 140, date: "2026-10-17", grade: "PSA 10", source: "eBay" },
  { id: "s6", price: 37, date: "2026-10-21", grade: "PSA 10", source: "eBay" },
];

describe("SalesChart", () => {
  it("labels the median line, notes hidden outliers, and draws outliers hollow", async () => {
    const { host, root } = await mount(
      createElement(SalesChart, {
        card,
        sales,
        source: "trawl",
        sample: false,
        lockedToComps: true,
        median: 35,
        p25: 34,
        p75: 36,
        count: 6,
        heading: "Recent sales",
      }),
    );
    const text = host.textContent ?? "";
    assert.match(text, /Median \$35\.00/);
    assert.match(text, /1 outlier hidden/);
    assert.match(text, /Based on 6 sales/);
    assert.ok(host.querySelectorAll("circle[fill='var(--chart-surface)']").length >= 1);
    await act(async () => root.unmount());
  });

  it("shows the tapped sale with price, grade, date and source", async () => {
    let picked: string | null = null;
    const { host, root } = await mount(
      createElement(SalesChart, {
        card,
        sales,
        source: "trawl",
        sample: false,
        lockedToComps: true,
        median: 35,
        count: 6,
        selectedSaleId: "s2",
        onSelectSale: (id: string | null) => {
          picked = id;
        },
      }),
    );
    assert.match(host.textContent ?? "", /\$36\.00 · PSA 10 · Oct 5, 2026 · Recent sold/);
    const svg = host.querySelector("svg");
    assert.ok(svg);
    // Oct 21 is the last dot, at the right edge.
    pointer(svg, "pointerdown", 250);
    await frame();
    assert.equal(picked, "s6");
    await act(async () => root.unmount());
  });

  it("asks for more sales instead of drawing a broken trend with one or two", () => {
    assert.equal(moreSalesText(1), "Needs 2 more sales to show a trend");
    assert.equal(moreSalesText(2), "Needs 1 more sale to show a trend");
    assert.equal(saleLine({ id: "x", price: 36, date: "2026-10-09" }), "$36.00 · Oct 9, 2026");
  });
});

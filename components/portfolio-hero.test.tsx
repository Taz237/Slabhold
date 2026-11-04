import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { PortfolioHero, type PortfolioHeroProps } from "@/components/portfolio-hero";
import { addDays } from "@/lib/chart/range";
import { snapshotDateInNewYork } from "@/lib/collection/totals-shared";
import type { SportsCard } from "@/lib/types";
import type { CardValueResult } from "@/lib/value/types";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const win = dom.window;

function expose(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

expose("window", win);
expose("self", win);
expose("document", win.document);
expose("navigator", win.navigator);
expose("HTMLElement", win.HTMLElement);
expose("Node", win.Node);
expose("Element", win.Element);
expose("MouseEvent", win.MouseEvent);
expose("localStorage", win.localStorage);
expose("IS_REACT_ACT_ENVIRONMENT", true);

after(() => win.close());

const today = snapshotDateInNewYork();

/** 40 saved days from $41 up to $260; the live value is $285. */
const rows = Array.from({ length: 40 }, (_, index) => ({
  snapshot_date: addDays(today, index - 40),
  value: index < 15 ? 41 : 260,
}));

const base: PortfolioHeroProps = {
  cardCount: 3,
  collectionValue: 285,
  profitTotal: 250,
  pricedCount: 2,
  pricedInvested: 1000,
  investedAmount: 1100,
  paidCount: 2,
  withoutValueCount: 1,
  valuesLoading: false,
  valuesFailed: false,
  valuesMessage: null,
  onRetry: () => {},
  snapshots: { rows, loading: false },
};

function html(props: Partial<PortfolioHeroProps> = {}) {
  return renderToStaticMarkup(createElement(PortfolioHero, { ...base, ...props }));
}

function text(markup: string) {
  return markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

describe("PortfolioHero hero", () => {
  it("shows the value once, with the change for the selected range in the same color as its sign", () => {
    win.localStorage.clear();
    const out = html();
    const words = text(out);
    assert.equal((words.match(/\$285\.00/g) ?? []).length, 1);
    // 30D by default: $41 carried to the window start, $285 now.
    assert.match(out, /data-gain="up"[^>]*class="[^"]*emerald/);
    assert.match(words, /\+\$244\.00 \(\+595%\)/);
    assert.match(words, /past 30 days/);
    assert.match(out, /href="\/cards\/new"/);
    assert.doesNotMatch(words, /Estimated value/);
    assert.doesNotMatch(out, /aria-expanded/);
  });

  it("goes red with a minus when the range fell, never a green number next to a red one", () => {
    win.localStorage.clear();
    const falling = rows.map((row, index) => ({ ...row, value: index < 15 ? 400 : 300 }));
    const out = html({ snapshots: { rows: falling, loading: false } });
    assert.match(out, /data-gain="down"[^>]*class="[^"]*rose/);
    assert.doesNotMatch(out, /data-gain="up"/);
    assert.match(text(out), /−\$115\.00 \(−28\.8%\)/);
  });

  it("uses the remembered range", () => {
    win.localStorage.setItem("slabhold:chart-range:collection", "7d");
    const words = text(html());
    assert.match(words, /\+\$25\.00 \(\+9\.6%\) past 7 days/);
    win.localStorage.clear();
  });

  it("offers only ranges that have data, as a labeled group with pressed state", () => {
    win.localStorage.clear();
    const out = html();
    assert.match(out, /role="group" aria-label="Chart range"/);
    assert.match(out, /aria-pressed="true"[^>]*>30D</);
    assert.match(out, />7D</);
    assert.match(out, />All</);
    assert.doesNotMatch(out, />90D</);
    assert.doesNotMatch(out, />1Y</);
  });

  it("shows a friendly thin state with fewer than two days, not a flat line", () => {
    const out = html({ snapshots: { rows: [], loading: false } });
    assert.match(text(out), /Your chart starts today/);
    assert.doesNotMatch(out, /data-gain/);
    assert.doesNotMatch(out, /Chart range/);
  });

  it("is gray, not green, on the pill and the line when the range did not move", () => {
    win.localStorage.clear();
    const still = rows.map((row) => ({ ...row, value: 285 }));
    const out = html({ snapshots: { rows: still, loading: false } });
    assert.match(out, /data-gain="flat"[^>]*class="[^"]*zinc/);
    assert.doesNotMatch(out, /data-gain="(up|down)"/);
    assert.match(text(out), /\$0\.00 \(0\.0%\) past 30 days/);
    assert.doesNotMatch(text(out), /\+0\.0%/);
  });

  it("shows the starts-today state, not a flat line then a jump, with one saved day plus today", () => {
    win.localStorage.clear();
    const out = html({ snapshots: { rows: [{ snapshot_date: addDays(today, -1), value: 41 }], loading: false } });
    assert.match(text(out), /Your chart starts today/);
    assert.doesNotMatch(out, /data-gain/);
    assert.doesNotMatch(out, /Chart range/);
    assert.doesNotMatch(out, /Share your collection chart/);
  });

  it("keeps the change line one fixed-height row, with no card-added text in the header", () => {
    win.localStorage.clear();
    const out = html({
      cards: [{ ...fixtureCard("a", "Jordan Love", 100), createdAt: `${addDays(today, -3)}T15:00:00Z` }],
      values: new Map([["a", okValue(285)]]),
      cardHistory: new Map(),
    });
    const row = out.slice(out.indexOf('data-slot="hero-change"') - 120, out.indexOf('data-slot="hero-change"'));
    assert.match(row, /class="[^"]*\bh-6\b[^"]*overflow-hidden/);
    assert.doesNotMatch(row, /flex-wrap|min-h-6/);
    const header = out.slice(0, out.indexOf('role="img"'));
    assert.doesNotMatch(header, /violet-700[^>]*>\+ /);
  });

  it("never shows $0 while values load", () => {
    const out = html({ collectionValue: 0, valuesLoading: true });
    assert.doesNotMatch(out, /\$0\.00/);
    assert.match(out, /animate-pulse|shimmer/);
    assert.doesNotMatch(out, /data-gain/);
  });

  it("keeps Retry when values fail", () => {
    const out = html({ valuesFailed: true, valuesMessage: "Couldn't load values." });
    assert.match(out, /Couldn&#x27;t load values\./);
    assert.match(out, />Retry</);
  });

  it("only offers Share for a collection that is not private", () => {
    assert.match(html({ shareable: true }), /aria-label="Share your collection chart"/);
    assert.doesNotMatch(html({ shareable: false }), /Share your collection chart/);
  });
});

describe("PortfolioHero stat grid", () => {
  it("is one 2-up row of Cards and Best card, nothing repeated from the hero", () => {
    win.localStorage.clear();
    const out = html();
    const grid = out.slice(out.lastIndexOf("<div", out.indexOf('data-slot="collection-stats"')));
    const words = text(grid);
    for (const name of ["Cards", "Best card"]) assert.match(words, new RegExp(name));
    assert.doesNotMatch(words, /Invested|Profit/);
    assert.match(words, /1 without a value yet/);
    assert.doesNotMatch(words, /\$285\.00/);
    assert.match(grid, /grid-cols-2/);
  });

  it("makes the without-a-value hint a button that opens those cards", async () => {
    let opened = 0;
    const host = win.document.createElement("div");
    win.document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(PortfolioHero, { ...base, onShowWithoutValue: () => (opened += 1) }));
    });
    const hint = [...host.querySelectorAll("button")].find((node) => node.textContent === "1 without a value yet");
    assert.ok(hint);
    await act(async () => {
      hint.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(opened, 1);
    await act(async () => {
      root.unmount();
    });
  });

  it("never shows invested or profit, even with a loss", () => {
    const words = text(html({ profitTotal: -100 }));
    assert.doesNotMatch(words, /−\$100\.00/);
    assert.doesNotMatch(words, /Profit/);
    assert.doesNotMatch(words, /Invested/);
  });

  it("asks for a price paid until a card has one and a value", () => {
    assert.match(text(html({ pricedCount: 0 })), /Needs a price paid and a value/);
  });
});

function fixtureCard(id: string, playerName: string, paid: number): SportsCard {
  return {
    id,
    playerName,
    year: 2023,
    yearLabel: "2023",
    setBrand: "Prizm",
    setIsCustom: false,
    cardNumber: "1",
    noNumber: false,
    grade: "PSA 10",
    parallel: "Base",
    parallelIsCustom: false,
    serialRun: null,
    serialNo: null,
    isRookie: false,
    isAuto: false,
    isRelic: false,
    conditionType: "graded",
    gradeQualifier: "",
    certNumber: "",
    sport: "Football",
    purchasePrice: paid,
    purchaseDate: "",
    estimatedSellPrice: 0,
    sellPrice: null,
    sellDate: null,
    notes: "",
    photoDataUrl: null,
    accent: "#7C3AED",
    createdAt: "2026-10-01T12:00:00Z",
    updatedAt: "2026-10-01T12:00:00Z",
  };
}

function okValue(median: number): CardValueResult {
  return { status: "ok", median, low: median, high: median, nSales: 9, matchedAt: null };
}

describe("PortfolioHero top movers and best card", () => {
  it("lists three movers with a sparkline and % each, and the best card with its gain", () => {
    win.localStorage.clear();
    const cards = [fixtureCard("a", "Jordan Love", 40), fixtureCard("b", "Cam Ward", 100), fixtureCard("c", "Jaxson Dart", 30), fixtureCard("d", "Travis Hunter", 50)];
    const values = new Map([
      ["a", okValue(120)],
      ["b", okValue(80)],
      ["c", okValue(33)],
      ["d", okValue(55)],
    ]);
    const cardHistory = new Map([
      ["a", [{ date: addDays(today, -20), value: 60 }, { date: today, value: 120 }]],
      ["b", [{ date: addDays(today, -20), value: 100 }, { date: today, value: 80 }]],
      ["c", [{ date: addDays(today, -20), value: 32 }, { date: today, value: 33 }]],
      ["d", [{ date: addDays(today, -20), value: 50 }, { date: today, value: 55 }]],
    ]);
    const out = html({ cards, values, cardHistory });
    const movers = out.slice(out.indexOf("Top movers in your collection"));
    const words = text(movers);
    assert.match(words, /Jordan Love.*\+100%.*Cam Ward.*−20\.0%.*Travis Hunter.*\+10\.0%/);
    assert.doesNotMatch(words, /Jaxson Dart/);
    assert.equal((movers.match(/role="img"/g) ?? []).length, 3);
    const best = text(out.slice(out.indexOf("Best card")));
    assert.match(best, /Jordan Love \+\$80\.00/);
  });

  it("shows a mover with no change as a gray 0.0%, not green", () => {
    win.localStorage.clear();
    const cards = [fixtureCard("a", "Jordan Love", 40)];
    const cardHistory = new Map([["a", [{ date: addDays(today, -20), value: 120 }, { date: today, value: 120 }]]]);
    const out = html({ cards, values: new Map([["a", okValue(120)]]), cardHistory });
    const movers = out.slice(out.indexOf("Top movers in your collection"));
    assert.match(movers, /data-gain="flat"[^>]*class="[^"]*zinc[^"]*"[^>]*>0\.0%</);
    assert.match(movers, /aria-label="Jordan Love, unchanged past 30 days"/);
  });
});

/** Fires once on observe with a 340px box, like the hero on a phone. */
class HeroResizeObserver {
  constructor(private callback: (entries: { contentRect: { width: number } }[]) => void) {}
  observe() {
    this.callback([{ contentRect: { width: 340 } }]);
  }
  disconnect() {}
}

async function mountHero(props: Partial<PortfolioHeroProps> = {}) {
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(PortfolioHero, { ...base, ...props }));
  });
  return {
    host,
    rerender: (next: Partial<PortfolioHeroProps>) =>
      act(async () => {
        root.render(createElement(PortfolioHero, { ...base, ...next }));
      }),
    unmount: () =>
      act(async () => {
        root.unmount();
        host.remove();
      }),
  };
}

async function settle(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

/** 40 saved days at `start`; the live value is `now`. */
function steady(start: number) {
  return { rows: rows.map((row) => ({ ...row, value: start })), loading: false };
}

describe("PortfolioHero redesign: calm scale and tone", () => {
  before(() => expose("ResizeObserver", HeroResizeObserver));
  after(() => expose("ResizeObserver", undefined));

  it("paints a 19-cent week calm purple, sign kept, with no rose anywhere (Donnie's case)", async () => {
    win.localStorage.setItem("slabhold:chart-range:collection", "7d");
    const props = { snapshots: steady(285.5), collectionValue: 285.31 };
    const out = html(props);
    assert.match(out, /data-gain="calm"[^>]*class="[^"]*bg-violet-500\/12 text-violet-700 dark:text-violet-300/);
    assert.match(text(out), /−\$0\.19 \(−0\.1%\) past 7 days/);
    assert.doesNotMatch(out, /rose/);
    const hero = await mountHero(props);
    const svg = hero.host.querySelector("svg[role='img']");
    assert.match(svg?.getAttribute("class") ?? "", /text-violet-600 dark:text-violet-400/);
    assert.doesNotMatch(hero.host.innerHTML, /rose/);
    // The ATH ($285.50) is 0.07% above the latest value: hidden.
    assert.doesNotMatch(hero.host.textContent ?? "", /ATH/);
    // The y axis spans at least 4% of the value: $280 / $285 / $290, not $285.00 / $285.50.
    const ticks = [...hero.host.querySelectorAll("text")].map((node) => node.textContent);
    assert.ok(ticks.includes("$280") && ticks.includes("$290"), ticks.join(","));
    await hero.unmount();
    win.localStorage.clear();
  });

  it("is calm at +0.4%, emerald at +0.6%, rose at −0.6%, and gray at exactly $0", () => {
    win.localStorage.setItem("slabhold:chart-range:collection", "7d");
    const gain = (now: number) => html({ snapshots: steady(100), collectionValue: now }).match(/data-gain="(\w+)"[^>]*class="([^"]*)"/);
    assert.equal(gain(100.4)?.[1], "calm");
    assert.equal(gain(100.6)?.[1], "up");
    assert.match(gain(100.6)?.[2] ?? "", /emerald/);
    assert.equal(gain(99.4)?.[1], "down");
    assert.match(gain(99.4)?.[2] ?? "", /rose/);
    assert.equal(gain(100)?.[1], "flat");
    assert.match(gain(100)?.[2] ?? "", /zinc/);
    win.localStorage.clear();
  });

  it("never colors alone: up and down keep their sign, no change reads 0.0%", () => {
    win.localStorage.setItem("slabhold:chart-range:collection", "7d");
    assert.match(text(html({ snapshots: steady(100), collectionValue: 110 })), /\+\$10\.00 \(\+10\.0%\)/);
    assert.match(text(html({ snapshots: steady(100), collectionValue: 90 })), /−\$10\.00 \(−10\.0%\)/);
    assert.match(text(html({ snapshots: steady(100), collectionValue: 100 })), /\$0\.00 \(0\.0%\)/);
    win.localStorage.clear();
  });

  it("draws a smooth line, never steps", () => {
    const source = readFileSync(join(process.cwd(), "components/portfolio-hero.tsx"), "utf8");
    assert.match(source, /curve="monotone"/);
    assert.doesNotMatch(source, /curve="step"/);
  });

  it("shows the ATH only when it is 1%+ above the latest value, and never while scrubbing", async () => {
    win.localStorage.clear();
    const peak = rows.map((row, index) => ({ ...row, value: index === 30 ? 300 : 280 }));
    const hero = await mountHero({ snapshots: { rows: peak, loading: false }, collectionValue: 285 });
    assert.match(hero.host.textContent ?? "", /ATH \$300/);
    const svg = hero.host.querySelector("svg[role='img']");
    assert.ok(svg);
    const press = new win.MouseEvent("pointerdown", { bubbles: true, clientX: 100 });
    Object.defineProperty(press, "pointerType", { value: "touch" });
    Object.defineProperty(press, "pointerId", { value: 1 });
    svg.dispatchEvent(press);
    await settle(60);
    assert.doesNotMatch(hero.host.textContent ?? "", /ATH/);
    await hero.unmount();

    const rising = await mountHero({});
    assert.doesNotMatch(rising.host.textContent ?? "", /ATH/, "the latest point is the high");
    await rising.unmount();
  });

  it("puts the range chips in one track under the chart, the active one with a dot in the line's tone", async () => {
    win.localStorage.clear();
    const hero = await mountHero({});
    const track = hero.host.querySelector('[data-slot="range-track"]');
    assert.ok(track);
    assert.equal(track.getAttribute("role"), "group");
    assert.ok(track.previousElementSibling?.querySelector("svg[role='img']"), "right after the chart");
    const active = track.querySelector("[aria-pressed='true']");
    const dot = active?.querySelector("[data-range-dot]");
    assert.ok(dot);
    assert.match(dot.getAttribute("class") ?? "", /emerald/);
    assert.equal(track.querySelectorAll("[data-range-dot]").length, 1);
    await hero.unmount();
  });
});

describe("PortfolioHero redesign: the count-up", () => {
  before(() => expose("ResizeObserver", HeroResizeObserver));
  after(() => expose("ResizeObserver", undefined));

  const headline = (host: HTMLElement) => host.querySelector('[data-slot="hero-value"]');

  it("does not count when the value is there at mount", async () => {
    win.localStorage.clear();
    const hero = await mountHero({});
    assert.equal(headline(hero.host)?.textContent, "$285.00");
    await hero.unmount();
  });

  it("counts once from the range's first value, never $0, when values land, then hands aria-live back", async () => {
    win.localStorage.clear();
    const hero = await mountHero({ valuesLoading: true, collectionValue: 0 });
    await settle(50); // the count-up's own chunk, fetched on mount, lands before the values do
    await hero.rerender({ valuesLoading: false });
    const node = headline(hero.host);
    assert.ok(node);
    // 30D starts at $41 (carried in); it counts up to $285.
    assert.equal(node.textContent, "$41.00");
    assert.equal(node.getAttribute("aria-live"), "off");
    await settle(120);
    assert.notEqual(node.textContent, "$0.00");
    await settle(400);
    assert.equal(node.textContent, "$285.00");
    assert.equal(node.getAttribute("aria-live"), "polite");
    assert.equal((hero.host.textContent ?? "").split("$285.00").length - 1, 1, "one value, no screen-reader copy");
    await hero.unmount();
  });

  it("does not count with reduced motion", async () => {
    win.localStorage.clear();
    Object.defineProperty(win, "matchMedia", {
      configurable: true,
      value: (query: string) => ({ matches: query.includes("reduce"), addEventListener() {}, removeEventListener() {} }),
    });
    try {
      const hero = await mountHero({ valuesLoading: true });
      await settle(50);
      await hero.rerender({ valuesLoading: false });
      assert.equal(headline(hero.host)?.textContent, "$285.00");
      await hero.unmount();
    } finally {
      delete (win as { matchMedia?: unknown }).matchMedia;
    }
  });
});

describe("PortfolioHero redesign: stat cards and movers", () => {
  it("is exactly two tiles, Cards then Best card, each with an aria-hidden icon", () => {
    win.localStorage.clear();
    const out = html();
    const tiles = [...out.matchAll(/data-stat-tile="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(tiles, ["Cards", "Best card"]);
    for (const name of tiles) {
      const tile = out.slice(out.indexOf(`data-stat-tile="${name}"`));
      assert.match(tile.slice(0, 600), /<svg[^>]*aria-hidden="true"/);
    }
  });

  it("never shows invested or profit, whatever the props say", () => {
    const words = text(html({ profitTotal: 250, investedAmount: 1100, pricedInvested: 1000, paidCount: 2, pricedCount: 2 }));
    for (const gone of ["Invested", "Profit", "$1,100.00", "+$250.00", "on 2 cards"]) {
      assert.equal(words.includes(gone), false, gone);
    }
  });

  it("reads Top card, the most valuable card and no red, when every priced card is down", () => {
    win.localStorage.clear();
    const cards = [fixtureCard("a", "Jordan Love", 100), fixtureCard("b", "Cam Ward", 300), fixtureCard("c", "Jaxson Dart", 50)];
    const values = new Map([
      ["a", okValue(80)],
      ["b", okValue(210)],
      ["c", okValue(40)],
    ]);
    const out = html({ cards, values, cardHistory: new Map() });
    const stats = out.slice(out.lastIndexOf("<div", out.indexOf('data-slot="collection-stats"')), out.indexOf("Top movers in your collection"));
    assert.match(text(stats), /Top card (CW )?Cam Ward \$210\.00 Your most valuable/);
    assert.doesNotMatch(stats, /Best card/);
    assert.doesNotMatch(stats, /rose/);
  });

  it("reads Best card with its gain when one card is up", () => {
    win.localStorage.clear();
    const cards = [fixtureCard("a", "Jordan Love", 100), fixtureCard("b", "Cam Ward", 300)];
    const values = new Map([
      ["a", okValue(130)],
      ["b", okValue(210)],
    ]);
    const out = html({ cards, values, cardHistory: new Map() });
    const stats = text(out.slice(out.indexOf('data-slot="collection-stats"'), out.indexOf("Top movers in your collection")));
    assert.match(stats, /Best card (JL )?Jordan Love \+\$30\.00 Since you paid/);
    assert.doesNotMatch(stats, /Top card/);
  });

  it("gives up and down movers an arrow and flat none, reserves 64x24 for each spark", () => {
    win.localStorage.clear();
    const cards = [fixtureCard("a", "Jordan Love", 40), fixtureCard("b", "Cam Ward", 100), fixtureCard("c", "Jaxson Dart", 30)];
    const cardHistory = new Map([
      ["a", [{ date: addDays(today, -20), value: 60 }, { date: today, value: 120 }]],
      ["b", [{ date: addDays(today, -20), value: 100 }, { date: today, value: 80 }]],
      ["c", [{ date: addDays(today, -20), value: 33 }, { date: today, value: 33 }]],
    ]);
    const out = html({ cards, values: new Map([["a", okValue(120)], ["b", okValue(80)], ["c", okValue(33)]]), cardHistory });
    const movers = out.slice(out.indexOf("Top movers in your collection"));
    assert.match(movers, /data-gain="up"[^>]*><svg/);
    assert.match(movers, /data-gain="down"[^>]*><svg/);
    assert.match(movers, /data-gain="flat"[^>]*>0\.0%</);
    assert.equal((movers.match(/data-spark-slot="" class="[^"]*\bh-6 w-16\b/g) ?? []).length, 3);
    assert.equal((movers.match(/data-spark-end/g) ?? []).length, 3);
  });

  it("shows Paid $X under the name, with no spark slot, for since-you-paid rows", () => {
    win.localStorage.clear();
    const cards = [fixtureCard("a", "Jordan Love", 40), fixtureCard("b", "Cam Ward", 100)];
    const out = html({ cards, values: new Map([["a", okValue(60)], ["b", okValue(80)]]), cardHistory: new Map() });
    const movers = out.slice(out.indexOf("Top movers in your collection"));
    assert.match(text(movers), /Since you paid/);
    assert.doesNotMatch(movers, /role="img"/);
    assert.match(text(movers), /Paid \$40/);
    assert.match(text(movers), /Paid \$100/);
    // Under the name, at every width, with no empty spark slot taking the name's room.
    assert.doesNotMatch(movers, /data-spark-slot/);
    assert.match(text(movers), /Jordan Love Paid \$40/);
    assert.doesNotMatch(movers, /max-\[359px\]:hidden[^"]*"[^>]*>Paid/);
  });
});

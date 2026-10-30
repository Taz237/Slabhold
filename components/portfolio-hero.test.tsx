import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
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
  it("is one 2x2 of Invested, Profit, Cards and Best card, nothing repeated from the hero", () => {
    win.localStorage.clear();
    const out = html();
    const grid = out.slice(out.lastIndexOf("<div", out.indexOf('data-slot="collection-stats"')));
    const words = text(grid);
    for (const name of ["Invested", "Profit", "Cards", "Best card"]) assert.match(words, new RegExp(name));
    assert.match(words, /\$1,100\.00/);
    assert.match(words, /\+\$250\.00/);
    assert.match(words, /\+25\.0% on 2 cards/);
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

  it("paints a loss red", () => {
    const words = html({ profitTotal: -100 });
    assert.match(words, /text-rose-700[^"]*"[^>]*>−\$100\.00/);
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

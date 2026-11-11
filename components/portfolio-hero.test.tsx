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
  it("shows a friendly thin state with fewer than two days, not a flat line", () => {
    const out = html({ snapshots: { rows: [], loading: false } });
    assert.match(text(out), /Your chart starts today/);
    assert.doesNotMatch(out, /data-gain/);
    assert.doesNotMatch(out, /Chart range/);
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

describe("PortfolioHero redesign: line, ATH and chips", () => {
  before(() => expose("ResizeObserver", HeroResizeObserver));
  after(() => expose("ResizeObserver", undefined));

  it("draws a smooth line, never steps", () => {
    const source = readFileSync(join(process.cwd(), "components/portfolio-hero.tsx"), "utf8");
    assert.match(source, /curve="monotone"/);
    assert.doesNotMatch(source, /curve="step"/);
  });

  it("shows the ATH only when it is 1%+ above the latest value, and never while scrubbing", async () => {
    win.localStorage.clear();
    win.localStorage.setItem("slabhold:chart-mode:collection", "value");
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
    win.localStorage.clear();
  });

  it("puts the range chips in one track under the chart, the active one with a dot in the line's tone", async () => {
    win.localStorage.clear();
    const hero = await mountHero(market);
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

/**
 * The market-move fixture: Jordan Love ($41) is held all along; Cam Ward
 * ($215) is added 25 days ago. Prices: Love $41 → $45 on that day, then
 * Love $50 and Ward $235 live today ($285). The saved totals jump $41 → $260
 * on the add, which the old header read as "+$244.00 (+595%)".
 */
const addIndex = 15;
const addDate = rows[addIndex].snapshot_date;
const marketCards = [
  { ...fixtureCard("a", "Jordan Love", 40), createdAt: `${rows[0].snapshot_date}T15:00:00Z` },
  { ...fixtureCard("b", "Cam Ward", 200), createdAt: `${addDate}T15:00:00Z` },
];
const marketDays = rows.flatMap((row, index) => [
  { cardId: "a", date: row.snapshot_date, value: index < addIndex ? 41 : 45, held: true },
  ...(index >= addIndex ? [{ cardId: "b", date: row.snapshot_date, value: 215, held: true }] : []),
]);
const market: Partial<PortfolioHeroProps> = {
  cards: marketCards,
  values: new Map([
    ["a", okValue(50)],
    ["b", okValue(235)],
  ]),
  cardHistory: new Map(),
  cardDays: { rows: marketDays, loading: false, failed: false },
};

/** The value card alone, without Best card and Top movers below it. */
function heroOnly(props: Partial<PortfolioHeroProps>) {
  const out = html(props);
  return out.slice(0, out.indexOf("</section>"));
}

describe("PortfolioHero market move (Performance)", () => {
  it("leads with the value and the market move for the range, never counting the add as a gain", () => {
    win.localStorage.clear();
    const out = html(market);
    const words = text(out);
    assert.equal((words.match(/\$285\.00/g) ?? []).length, 1);
    // 1M: Love +$4 on $41, then +$25 on $260 = +$29.00, (45/41 × 285/260 − 1) = +20.3%.
    assert.match(words, /\+\$29\.00 \(\+20\.3%\) market move/);
    assert.doesNotMatch(words, /595%|\+\$244/);
    assert.match(out, /data-gain="up"[^>]*class="[^"]*emerald/);
  });

  it("does not move when a card is added and prices stand still", () => {
    win.localStorage.clear();
    const still = rows.flatMap((row, index) => [
      { cardId: "a", date: row.snapshot_date, value: 50, held: true },
      ...(index >= addIndex ? [{ cardId: "b", date: row.snapshot_date, value: 235, held: true }] : []),
    ]);
    const out = html({ ...market, cardDays: { rows: still, loading: false, failed: false } });
    assert.match(out, /data-gain="flat"[^>]*class="[^"]*zinc/);
    assert.match(text(out), /\$0\.00 \(0\.0%\) market move/);
    assert.doesNotMatch(text(out), /\+0\.0%/);
  });

  it("goes rose with a minus when prices fell", () => {
    win.localStorage.setItem("slabhold:chart-range:collection", "7d");
    const out = heroOnly({
      ...market,
      values: new Map([
        ["a", okValue(36)],
        ["b", okValue(215)],
      ]),
      collectionValue: 251,
    });
    assert.match(out, /data-gain="down"[^>]*class="[^"]*rose/);
    assert.doesNotMatch(out, /data-gain="up"/);
    assert.match(text(out), /−\$9\.00 \(−3\.5%\) market move/);
    win.localStorage.clear();
  });

  it("is green at +0.6%, rose at −0.6%, and gray only when it reads 0.0%", () => {
    win.localStorage.setItem("slabhold:chart-range:collection", "7d");
    const gain = (love: number) =>
      html({ ...market, values: new Map([["a", okValue(love)], ["b", okValue(215)]]) }).match(/data-gain="(\w+)"[^>]*class="([^"]*)"/);
    // 7D base: $45 + $215 = $260.
    assert.equal(gain(46.56)?.[1], "up");
    assert.match(gain(46.56)?.[2] ?? "", /emerald/);
    assert.equal(gain(43.44)?.[1], "down");
    assert.match(gain(43.44)?.[2] ?? "", /rose/);
    assert.equal(gain(45)?.[1], "flat");
    win.localStorage.clear();
  });

  it("uses the remembered range, measured from that range's own start", () => {
    win.localStorage.setItem("slabhold:chart-range:collection", "7d");
    assert.match(text(html(market)), /\+\$25\.00 \(\+9\.6%\) market move/);
    win.localStorage.clear();
  });

  it("offers 1W 1M 3M 1Y All only as far back as the history goes, as a labeled group", () => {
    win.localStorage.clear();
    const out = heroOnly(market);
    assert.match(out, /role="group" aria-label="Chart range"/);
    assert.match(out, /aria-pressed="true"[^>]*>1M</);
    assert.match(out, />1W</);
    assert.match(out, />All</);
    assert.doesNotMatch(out, />3M</);
    assert.doesNotMatch(out, />1Y</);
    assert.doesNotMatch(out, />30D</);
  });

  it("says Not enough history yet, with no %, when there is under a day of prices", () => {
    win.localStorage.clear();
    const out = heroOnly({ ...market, cardDays: { rows: [], loading: false, failed: false } });
    assert.match(text(out), /Not enough history yet/);
    assert.doesNotMatch(out, /data-gain/);
    assert.doesNotMatch(text(out), /%\)/);
  });

  it("says Not enough history yet instead of a % from a base under $1", () => {
    win.localStorage.clear();
    const penny = rows.map((row, index) => ({ cardId: "a", date: row.snapshot_date, value: index < 30 ? 0.01 : 0.5, held: true }));
    const out = heroOnly({
      ...market,
      cards: [marketCards[0]],
      values: new Map([["a", okValue(0.5)]]),
      collectionValue: 0.5,
      cardDays: { rows: penny, loading: false, failed: false },
    });
    assert.match(text(out), /Not enough history yet/);
    assert.doesNotMatch(out, /data-gain/);
  });

  it("shows a skeleton, never a %, while per-card prices load", () => {
    win.localStorage.clear();
    const out = heroOnly({ ...market, cardDays: { rows: [], loading: true, failed: false } });
    assert.doesNotMatch(out, /data-gain/);
    assert.doesNotMatch(text(out), /Not enough history/);
    assert.match(out, /animate-pulse|shimmer/);
  });
});

describe("PortfolioHero Performance | Value toggle, chips and scrub", () => {
  before(() => expose("ResizeObserver", HeroResizeObserver));
  after(() => expose("ResizeObserver", undefined));

  const headline = (host: HTMLElement) => host.querySelector('[data-slot="hero-value"]')?.textContent;
  const change = (host: HTMLElement) => host.querySelector('[data-slot="hero-change"]')?.textContent ?? "";
  const ticks = (host: HTMLElement) =>
    [...host.querySelectorAll("svg[role='img'] text")].map((node) => node.textContent ?? "");
  function button(host: HTMLElement, name: string) {
    const found = [...host.querySelectorAll("button")].find((node) => node.textContent === name);
    assert.ok(found, name);
    return found;
  }
  async function click(node: Element) {
    await act(async () => {
      node.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    });
  }
  async function pointer(svg: Element, type: string, clientX: number) {
    await act(async () => {
      const event = new win.MouseEvent(type, { bubbles: true, clientX });
      Object.defineProperty(event, "pointerType", { value: "touch" });
      Object.defineProperty(event, "pointerId", { value: 1 });
      svg.dispatchEvent(event);
    });
  }

  it("opens on Performance (a % axis from 0%), and Value switches to dollars with add dots, remembered", async () => {
    win.localStorage.clear();
    const hero = await mountHero(market);
    const group = hero.host.querySelector('[role="group"][aria-label="Chart mode"]');
    assert.ok(group);
    assert.equal(button(hero.host, "Performance").getAttribute("aria-pressed"), "true");
    assert.ok(ticks(hero.host).some((tick) => /%$/.test(tick)), ticks(hero.host).join(","));
    assert.equal(hero.host.querySelectorAll("[data-chart-add]").length, 0);

    await click(button(hero.host, "Value"));
    assert.equal(button(hero.host, "Value").getAttribute("aria-pressed"), "true");
    assert.ok(ticks(hero.host).some((tick) => /^\$/.test(tick)), ticks(hero.host).join(","));
    assert.equal(hero.host.querySelectorAll("[data-chart-add]").length, 1);
    // The headline is still the market move, not the jump from the add.
    assert.match(change(hero.host), /\+\$29\.00 \(\+20\.3%\)market move/);
    assert.equal(win.localStorage.getItem("slabhold:chart-mode:collection"), "value");
    await hero.unmount();

    const again = await mountHero(market);
    assert.equal(button(again.host, "Value").getAttribute("aria-pressed"), "true");
    await again.unmount();
    win.localStorage.clear();
  });

  it("switches range from the chips and remembers it", async () => {
    win.localStorage.clear();
    const hero = await mountHero(market);
    await click(button(hero.host, "1W"));
    assert.equal(button(hero.host, "1W").getAttribute("aria-pressed"), "true");
    assert.match(change(hero.host), /\+\$25\.00 \(\+9\.6%\)market move/);
    assert.equal(win.localStorage.getItem("slabhold:chart-range:collection"), "7d");
    await click(button(hero.host, "All"));
    assert.match(change(hero.host), /\+\$29\.00/);
    await hero.unmount();
    win.localStorage.clear();
  });

  it("updates the headline live to the scrubbed day's value and move, and snaps back to today on release", async () => {
    win.localStorage.clear();
    const hero = await mountHero(market);
    const svg = hero.host.querySelector("svg[role='img']");
    assert.ok(svg);
    assert.equal(headline(hero.host), "$285.00");
    // The left edge is the range's first day: $41 saved that day, no move yet.
    await pointer(svg, "pointerdown", 0);
    await settle(60);
    assert.equal(headline(hero.host), "$41.00");
    assert.match(change(hero.host), /\$0\.00 \(0\.0%\)· /);
    await pointer(svg, "pointerup", 0);
    await settle(20);
    assert.equal(headline(hero.host), "$285.00");
    assert.match(change(hero.host), /market move/);
    await hero.unmount();
  });

  it("says Added: <card> when a tap lands on an add dot in Value", async () => {
    win.localStorage.setItem("slabhold:chart-mode:collection", "value");
    const hero = await mountHero(market);
    const svg = hero.host.querySelector("svg[role='img']");
    const dot = hero.host.querySelector("[data-chart-add]");
    assert.ok(svg && dot);
    const x = Number(dot.getAttribute("cx"));
    await pointer(svg, "pointerdown", x);
    await settle(60);
    await pointer(svg, "pointerup", x);
    await settle(20);
    const note = hero.host.querySelector('[data-slot="add-note"]');
    assert.ok(note);
    assert.match(note.textContent ?? "", /^Added: Cam Ward PSA 10 · /);
    await hero.unmount();
    win.localStorage.clear();
  });
});

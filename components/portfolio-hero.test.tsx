import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { PortfolioHero, type PortfolioHeroProps } from "@/components/portfolio-hero";

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

const base: PortfolioHeroProps = {
  cardCount: 3,
  collectionValue: 1250,
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
};

function html(props: Partial<PortfolioHeroProps> = {}) {
  return renderToStaticMarkup(createElement(PortfolioHero, { ...base, ...props }));
}

describe("PortfolioHero collapsed", () => {
  it("shows the total, a gain pill, the card count and Add a card", () => {
    const out = html();
    assert.match(out, /Collection value/);
    assert.match(out, /\$1,250\.00/);
    assert.match(out, /data-gain="up"[^>]*class="[^"]*emerald/);
    assert.match(out, /\+\$250\.00/);
    assert.match(out, /\+25\.0%/);
    assert.match(out, /3 cards/);
    assert.match(out, /href="\/cards\/new"/);
    assert.match(out, /aria-expanded="false"/);
    assert.doesNotMatch(out, /Total invested/);
  });

  it("shows a rose pill for a loss", () => {
    const out = html({ profitTotal: -100 });
    assert.match(out, /data-gain="down"[^>]*class="[^"]*rose/);
    assert.match(out, /−\$100\.00/);
  });

  it("hides the pill until a card has a price paid and a value", () => {
    assert.doesNotMatch(html({ pricedCount: 0 }), /data-gain/);
  });

  it("says 1 card, not 1 cards", () => {
    assert.match(html({ cardCount: 1 }), />1 card</);
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
});

describe("PortfolioHero expanded", () => {
  it("opens in place with the chart, the stats and the profit note", async () => {
    win.localStorage.clear();
    const host = win.document.createElement("div");
    win.document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(PortfolioHero, base));
    });
    const toggle = host.querySelector("button[aria-expanded]");
    assert.ok(toggle);
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.doesNotMatch(host.textContent ?? "", /Total invested/);

    await act(async () => {
      toggle.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    const text = host.textContent ?? "";
    assert.match(text, /Your value history starts today/);
    assert.match(text, /Total invested/);
    assert.match(text, /Estimated value/);
    assert.match(text, /Profit/);
    assert.match(text, /1 card without a value yet/);
    assert.match(text, /Profit only includes cards with a price paid and a current value\./);
    assert.equal(win.localStorage.getItem("slabhold:collection-hero-open"), "1");

    await act(async () => {
      toggle.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(win.localStorage.getItem("slabhold:collection-hero-open"), "0");

    await act(async () => {
      root.unmount();
    });
  });

  it("reopens when the last visit left it open", async () => {
    win.localStorage.setItem("slabhold:collection-hero-open", "1");
    const host = win.document.createElement("div");
    win.document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(PortfolioHero, base));
    });
    const toggle = host.querySelector("button[aria-expanded]");
    assert.equal(toggle?.getAttribute("aria-expanded"), "true");
    await act(async () => {
      root.unmount();
    });
  });
});

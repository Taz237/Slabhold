import assert from "node:assert/strict";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { join } from "node:path";
import { SalesChartPending, SalesListPending } from "@/components/card-detail-shell";
import { peekCardValue, rememberCardValues } from "@/lib/value/card-value-memory";
import type { CardValueResult } from "@/lib/value/types";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("opening a card from the collection", () => {
  const page = read("app/(app)/cards/[id]/page.tsx");
  const loading = read("app/(app)/cards/[id]/loading.tsx");
  const detail = read("components/card-detail.tsx");
  const shell = read("components/card-detail-shell.tsx");
  const form = read("components/card-form.tsx");
  const people = read("app/api/cards/people/route.ts");

  it("paints from the collection before the server people query", () => {
    assert.match(page, /await Promise\.all\(\[\s*requireCardPageAccess\(id, cardPageAccessWith\(/);
    const requireAt = page.indexOf("requireCardPageAccess");
    const detailAt = page.indexOf("<CardDetail");
    assert.ok(requireAt > 0 && detailAt > requireAt);
    assert.equal(page.includes("loadCardPeople"), false);

    assert.match(loading, /CardDetailPending/);
    assert.doesNotMatch(loading, /getAuthUserId|loadCardPeople/);
    assert.match(shell, /useCollection/);
    assert.match(shell, /Edit card/);
    // The card's stage and the value read are reserved while it loads.
    assert.match(shell, /<CardStageSkeleton \/>/);
    assert.match(shell, /<ValuePending/);
  });

  it("keeps photo, sales graph, sales list, then posts in that order", () => {
    const hero = detail.indexOf("<CardHero");
    const chart = detail.indexOf('data-slot="sales-chart"');
    const list = detail.indexOf("<SalesListPending");
    const talk = detail.indexOf('heading="Who\'s talking about this card"');
    assert.ok(hero > 0 && chart > hero && list > chart && talk > list);
    assert.match(detail, /<CardValueView/);
    assert.match(detail, /<LazyCompsList/);
    assert.match(detail, /import\("@\/components\/card-page\/card-value"\)/);
    assert.doesNotMatch(detail, /from "@\/components\/card-page\/card-value"/);
    assert.doesNotMatch(detail, /from "@\/components\/sales-chart"/);
    assert.doesNotMatch(detail, /from "@\/components\/charts\/value-chart"/);
  });

  it("keeps edit, value, delete, and privacy off the main column", () => {
    assert.match(shell, /aria-label="Card actions"/);
    assert.match(detail, /id="card-actions"/);
    assert.match(detail, /<CardForm/);
    assert.match(detail, /onCancel=\{/);
    assert.match(detail, /onSaved=\{/);
    assert.match(detail, /gradeDetailSpecs\(/);
    assert.match(detail, /<WantButton/);
    assert.doesNotMatch(detail, /<FairPriceCheck/);
    assert.doesNotMatch(detail, /<CardOwnersSection|<CardPeopleSections|\/api\/cards\/people/);
    assert.match(detail, /Delete/);
    assert.match(detail, /<CardVisibilitySwitch/);
    assert.match(detail, /Mark as sold/);
    assert.match(form, />\s*Cancel\s*</);
    assert.match(form, /type="button"/);
    assert.match(form, /router\.push\(existing \? `\/cards\/\$\{card\.id\}` : addedCardPath\(card\.id\)\)/);
    assert.match(people, /requireCardPageAccess/);
    assert.match(people, /loadCardPeople/);
  });

  it("shows the value only, with no Paid or Profit, on both card pages", () => {
    const view = read("components/public-card-view.tsx");
    for (const source of [detail, view]) {
      assert.doesNotMatch(source, /label="Paid"|label="Profit"|Paid vs|formatPaidLabel|showPaid/);
      assert.doesNotMatch(source, /<FairPriceCheck|<CardOwnersSection|<CardPeopleSections/);
    }
    assert.match(detail, /grid min-w-0 grid-cols-1 gap-3">\s*<EstSellMetric/);
    assert.match(view, /<section data-value-read="" className=\{cardSection\}>/);
    assert.doesNotMatch(read("app/(app)/u/[username]/cards/[id]/page.tsx"), /loadCardPeople/);
  });

  it("shows visibility and move for the owner right under the card, without opening the menu", () => {
    const menuAt = detail.indexOf("{menuOpen ? (");
    const moveAt = detail.indexOf("<CategorySwitch");
    const topBarAt = detail.indexOf("<CardTopBar");
    const publicAt = detail.indexOf("<CardVisibilitySwitch");
    const heroAt = detail.indexOf("<CardHero");
    const valueAt = detail.indexOf("<CardValueView\n");
    // The card is the hero, so the switch sits just under it, well above the sales.
    assert.ok(topBarAt < heroAt && heroAt < publicAt && publicAt < valueAt, "the switch sits right under the card");
    assert.ok(moveAt > 0 && menuAt > moveAt && menuAt > publicAt);
    assert.equal(detail.indexOf("<CategorySwitch", menuAt), -1);
    assert.equal(detail.indexOf("<CardVisibilitySwitch", menuAt), -1);
    assert.match(detail, /updateCard\(card\.id, publicTogglePatch\(card, next\)\)/);
    assert.match(detail, /aria-label="Collection"/);
    assert.match(detail, /data-slot="owner-controls"/);
    const visible = detail.slice(0, menuAt);
    assert.match(visible, /editing \? null : \(/);
    assert.doesNotMatch(read("components/public-card-view.tsx"), /CategorySwitch|CategoryPicker/);
    assert.doesNotMatch(read("components/public-card-view.tsx"), /CardVisibilitySwitch/);
  });

  it("reserves the sales graph and list so they do not pop in from zero height", () => {
    const chart = renderToStaticMarkup(createElement(SalesChartPending, { priceLabel: "$120.00" }));
    assert.match(chart, /Estimated value/);
    assert.match(chart, /\$120\.00/);
    // The price row and the plot keep their final heights.
    assert.match(chart, /min-h-11/);
    assert.match(chart, /height:208px/);
    const list = renderToStaticMarkup(createElement(SalesListPending));
    assert.match(list, /Recent sales/);
    assert.match(list, /h-12/);
    assert.equal((list.match(/h-12/g) ?? []).length, 4);
  });

  it("remembers a collection value for the next card open", () => {
    const stored: CardValueResult = {
      status: "ok",
      median: 42,
      low: 40,
      high: 44,
      nSales: 6,
      matchedAt: null,
    };
    rememberCardValues(new Map([["wemby-prizm-136", stored]]));
    assert.equal(peekCardValue("wemby-prizm-136")?.median, 42);
    assert.equal(peekCardValue("missing"), null);
  });
});

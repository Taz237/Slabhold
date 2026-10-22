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
  const page = read("app/cards/[id]/page.tsx");
  const loading = read("app/cards/[id]/loading.tsx");
  const detail = read("components/card-detail.tsx");
  const shell = read("components/card-detail-shell.tsx");
  const form = read("components/card-form.tsx");
  const people = read("app/api/cards/people/route.ts");

  it("paints from the collection before the server people query", () => {
    assert.match(page, /await requireCardPageAccess\(id\)/);
    const requireAt = page.indexOf("requireCardPageAccess");
    const detailAt = page.indexOf("<CardDetail");
    assert.ok(requireAt > 0 && detailAt > requireAt);
    assert.equal(page.includes("loadCardPeople"), false);

    assert.match(loading, /CardDetailPending/);
    assert.doesNotMatch(loading, /getAuthUserId|loadCardPeople/);
    assert.match(shell, /useCollection/);
    assert.match(shell, /Edit card/);
    assert.match(shell, /h-72 w-48/);
    assert.match(shell, /h-44/);
  });

  it("keeps photo, sales graph, sales list, then posts in that order", () => {
    const hero = detail.indexOf("<CardHero");
    const chart = detail.indexOf('data-slot="sales-chart"');
    const list = detail.indexOf("<SalesListPending");
    const talk = detail.indexOf('heading="Who\'s talking about this card"');
    assert.ok(hero > 0 && chart > hero && list > chart && talk > list);
    assert.match(detail, /<ValueChart/);
    assert.match(detail, /<CompsList/);
    assert.match(detail, /import\("@\/components\/value-chart"\)/);
    assert.doesNotMatch(detail, /from "@\/components\/value-chart"/);
  });

  it("keeps edit, value, delete, and privacy off the main column", () => {
    assert.match(shell, /aria-label="Card actions"/);
    assert.match(detail, /id="card-actions"/);
    assert.match(detail, /<CardForm/);
    assert.match(detail, /onCancel=\{/);
    assert.match(detail, /onSaved=\{/);
    assert.match(detail, /gradeDetailSpecs\(/);
    assert.match(detail, /<WantButton/);
    assert.match(detail, /<FairPriceCheck/);
    assert.match(detail, /Owners and hunters/);
    assert.match(detail, /Delete/);
    assert.match(detail, /Public on profile/);
    assert.match(detail, /Mark as sold/);
    assert.match(form, />\s*Cancel\s*</);
    assert.match(form, /type="button"/);
    assert.match(form, /router\.push\(`\/cards\/\$\{card\.id\}`\)/);
    assert.match(people, /requireCardPageAccess/);
    assert.match(people, /loadCardPeople/);
  });

  it("reserves the sales graph and list so they do not pop in from zero height", () => {
    const chart = renderToStaticMarkup(createElement(SalesChartPending, { priceLabel: "$120.00" }));
    assert.match(chart, /Recent sales/);
    assert.match(chart, /\$120\.00/);
    assert.match(chart, /h-44/);
    assert.match(chart, /min-h-9/);
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

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { join } from "node:path";
import { SalesChartPending } from "@/components/card-detail-shell";
import { money } from "@/lib/format";
import { VALUE_UNAVAILABLE_LABEL } from "@/lib/value/format";
import type { CardValueResult, CardValueSimilar } from "@/lib/value/types";
import {
  feedChipPrice,
  lastSaleLabel,
  NO_SALES_FOUND_LABEL,
  NORMAL_ESTIMATE_MIN_SALES,
  pickSimilarOffer,
  rangeLabel,
  resolvePriceRead,
  saleDayLabel,
  SIMILAR_CARDS_LABEL,
  similarRelation,
  tilePriceText,
  type SimilarCandidate,
} from "@/lib/value/price-fallback";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function value(
  partial: Partial<CardValueResult> & Pick<CardValueResult, "status">,
): CardValueResult {
  return {
    median: null,
    low: null,
    high: null,
    nSales: 0,
    matchedAt: null,
    ...partial,
  };
}

const SUBJECT = {
  id: "subject",
  playerName: "Mike Trout",
  year: 2023,
  setBrand: "Topps Chrome",
  cardNumber: "1",
  parallel: "Base",
  grade: "PSA 10",
};

const EBAY = "https://www.ebay.com/sch/i.html?_nkw=trout";
const USEFUL = {
  playerName: "Mike Trout",
  year: 2023,
  setBrand: "Topps Chrome",
  cardNumber: "1",
  parallel: "Base",
  grade: "PSA 10",
};

function cousin(partial: Partial<SimilarCandidate> & Pick<SimilarCandidate, "id">): SimilarCandidate {
  return {
    username: "donnie",
    playerName: "Mike Trout",
    year: 2023,
    setBrand: "Topps Chrome",
    cardNumber: "1",
    parallel: "Silver",
    grade: "PSA 10",
    sales: [{ price: 40, soldAt: "2026-10-02T18:00:00.000Z" }],
    ...partial,
  };
}

function similarOffer(detail = "Silver · PSA 10"): CardValueSimilar {
  return {
    href: "/u/donnie/cards/cousin",
    detail,
    priceText: rangeLabel(40, 40, 1),
    reason: "parallel",
  };
}

describe("price fallback labels", () => {
  it("formats a last sale with the price and the day", () => {
    assert.equal(saleDayLabel("2026-10-02T18:00:00.000Z"), "Oct 2");
    assert.equal(saleDayLabel("not-a-date"), null);
    assert.equal(lastSaleLabel(12, "2026-10-02T18:00:00.000Z"), `Last sold ${money(12)} on Oct 2`);
    assert.equal(rangeLabel(10, 20, 2), `${money(10)}\u2013${money(20)} from 2 sales`);
    assert.equal(rangeLabel(10, 10, 1), `${money(10)}\u2013${money(10)} from 1 sale`);
  });

  it("shows the median as the estimate only when there are enough sales", () => {
    const read = resolvePriceRead({
      value: value({ status: "ok", median: 120, low: 90, high: 150, nSales: NORMAL_ESTIMATE_MIN_SALES }),
      similar: similarOffer(),
      ebayHref: EBAY,
      card: USEFUL,
    });
    assert.equal(read.kind, "estimate");
    assert.equal(read.isEstimate, true);
    assert.equal(read.text, money(120));
    assert.equal(read.showEbaySold, false);
    assert.equal(tilePriceText(read, true), `Est. ${money(120)}`);
  });

  it("labels one dated sale as the last sale and not as the estimate", () => {
    const read = resolvePriceRead({
      value: value({
        status: "ok",
        median: 12,
        nSales: 1,
        sales: [{ price: 12, soldAt: "2026-10-02T18:00:00.000Z" }],
      }),
      similar: similarOffer(),
      ebayHref: EBAY,
      card: USEFUL,
    });
    assert.equal(read.kind, "last_sale");
    assert.equal(read.isEstimate, false);
    assert.equal(read.showEbaySold, false);
    assert.equal(read.text, "Last sold $12.00 on Oct 2");
    assert.notEqual(read.text, money(12));
    assert.doesNotMatch(read.text, /^Est\./);
    assert.equal(tilePriceText(read, true), read.text);
    assert.equal(feedChipPrice(read).showEbaySold, false);
  });

  it("uses a range when the only sale has no date", () => {
    const read = resolvePriceRead({
      value: value({
        status: "no_sales",
        median: 12,
        nSales: 1,
        sales: [{ price: 12, soldAt: null }],
      }),
      ebayHref: EBAY,
      card: USEFUL,
    });
    assert.equal(read.kind, "range");
    assert.equal(read.isEstimate, false);
    assert.equal(read.text, "$12.00\u2013$12.00 from 1 sale");
    assert.equal(read.showEbaySold, false);
  });

  it("labels two sales as a range and does not call that the estimate", () => {
    const read = resolvePriceRead({
      exactSales: [
        { price: 10, soldAt: "2026-09-01T00:00:00.000Z" },
        { price: 25, soldAt: "2026-10-02T00:00:00.000Z" },
      ],
      value: value({ status: "ok", median: 17.5, low: 10, high: 25, nSales: 2 }),
      similar: similarOffer(),
      ebayHref: EBAY,
      card: USEFUL,
    });
    assert.equal(read.kind, "range");
    assert.equal(read.isEstimate, false);
    assert.equal(read.showEbaySold, false);
    assert.equal(read.text, "$10.00\u2013$25.00 from 2 sales");
    assert.doesNotMatch(read.text, /^Est\./);
    assert.notEqual(read.text, money(17.5));
    assert.equal(feedChipPrice(read).text, read.text);
  });

  it("builds a range from a stored count when the sale rows are not loaded", () => {
    const read = resolvePriceRead({
      value: value({ status: "ok", median: 18, low: 11, high: 22, nSales: 2 }),
      ebayHref: EBAY,
      card: USEFUL,
    });
    assert.equal(read.kind, "range");
    assert.equal(read.isEstimate, false);
    assert.equal(read.text, "$11.00\u2013$22.00 from 2 sales");
  });

  it("labels similar cards and links through without calling it the estimate", () => {
    const offer = similarOffer("Silver · PSA 10");
    const read = resolvePriceRead({
      value: value({ status: "no_sales" }),
      exactSales: [],
      similar: offer,
      ebayHref: EBAY,
      card: USEFUL,
    });
    assert.equal(read.kind, "similar");
    assert.equal(read.isEstimate, false);
    assert.equal(read.showEbaySold, false);
    assert.equal(read.text, SIMILAR_CARDS_LABEL);
    assert.equal(read.text, "Similar cards");
    if (read.kind !== "similar") return;
    assert.equal(read.detail, "Silver · PSA 10");
    assert.equal(read.href, offer.href);
    assert.match(read.detail, /Silver/);
    assert.match(read.detail, /PSA 10/);
    assert.equal(
      feedChipPrice(read).text,
      `Similar cards · Silver · PSA 10 · ${offer.priceText}`,
    );
    assert.doesNotMatch(feedChipPrice(read).text, /^Est\./);
    assert.equal(tilePriceText(read, true), feedChipPrice(read).text);
  });

  it("says no sales found, and shows eBay sold only when that search is a real card", () => {
    const found = resolvePriceRead({
      value: value({ status: "no_sales" }),
      exactSales: [],
      ebayHref: EBAY,
      card: USEFUL,
    });
    assert.equal(found.kind, "none");
    assert.equal(found.isEstimate, false);
    assert.equal(found.text, NO_SALES_FOUND_LABEL);
    assert.equal(found.text, "No sales found yet");
    assert.equal(found.showEbaySold, true);

    const bare = resolvePriceRead({
      value: value({ status: "no_sales" }),
      exactSales: [],
      ebayHref: EBAY,
      card: { playerName: "Mike" },
    });
    assert.equal(bare.kind, "none");
    assert.equal(bare.showEbaySold, false);

    const setOnly = resolvePriceRead({
      value: value({ status: "no_sales" }),
      ebayHref: EBAY,
      card: { playerName: "Mo", setBrand: "Prizm" },
    });
    assert.equal(setOnly.showEbaySold, true);

    const noHref = resolvePriceRead({
      value: value({ status: "no_sales" }),
      ebayHref: null,
      card: USEFUL,
    });
    assert.equal(noHref.showEbaySold, false);
  });

  it("keeps the fallback order: one dated sale, then a range, then similar, then none", () => {
    const dated = resolvePriceRead({
      exactSales: [{ price: 12, soldAt: "2026-10-02T00:00:00.000Z" }],
      similar: similarOffer(),
      ebayHref: EBAY,
      card: USEFUL,
    });
    assert.equal(dated.kind, "last_sale");

    const range = resolvePriceRead({
      exactSales: [
        { price: 8, soldAt: "2026-09-01T00:00:00.000Z" },
        { price: 9, soldAt: "2026-10-01T00:00:00.000Z" },
      ],
      similar: similarOffer(),
      ebayHref: EBAY,
      card: USEFUL,
    });
    assert.equal(range.kind, "range");

    const similar = resolvePriceRead({
      exactSales: [],
      similar: similarOffer(),
      ebayHref: EBAY,
      card: USEFUL,
    });
    assert.equal(similar.kind, "similar");
    assert.equal(similar.showEbaySold, false);

    const none = resolvePriceRead({
      exactSales: [],
      ebayHref: EBAY,
      card: USEFUL,
    });
    assert.equal(none.kind, "none");
    assert.equal(none.showEbaySold, true);
  });

  it("does not treat unavailable or a fresh card as a blank price or an eBay search", () => {
    const unavailable = resolvePriceRead({
      value: value({ status: "unavailable", median: 40, nSales: 4 }),
      ebayHref: EBAY,
      card: USEFUL,
    });
    assert.equal(unavailable.kind, "status");
    assert.equal(unavailable.text, VALUE_UNAVAILABLE_LABEL);
    assert.equal(unavailable.isEstimate, false);
    assert.equal(unavailable.showEbaySold, false);

    const now = Date.parse("2026-10-22T12:00:00.000Z");
    const updating = resolvePriceRead({
      value: null,
      createdAt: new Date(now - 60_000).toISOString(),
      now,
      ebayHref: EBAY,
      card: USEFUL,
    });
    assert.equal(updating.kind, "status");
    assert.equal(updating.text, "Value updating");
    assert.equal(updating.showEbaySold, false);
  });

  it("keeps a sample with three sales as the estimate", () => {
    const read = resolvePriceRead({
      value: value({ status: "sample", median: 15, nSales: 3 }),
      exactSales: [{ price: 15, soldAt: "2026-10-02T00:00:00.000Z" }],
    });
    assert.equal(read.kind, "estimate");
    assert.equal(read.isEstimate, true);
    assert.equal(read.text, money(15));
  });

  it("does not promote a median when other copies add the extra rows", () => {
    const read = resolvePriceRead({
      value: value({
        status: "ok",
        median: 40,
        low: 40,
        high: 40,
        nSales: 1,
        sales: [
          { price: 40, soldAt: "2026-10-02T00:00:00.000Z" },
          { price: 80, soldAt: "2026-10-03T00:00:00.000Z" },
          { price: 90, soldAt: "2026-10-04T00:00:00.000Z" },
        ],
      }),
    });
    assert.equal(read.kind, "range");
    assert.equal(read.isEstimate, false);
    assert.equal(read.text, "$40.00\u2013$90.00 from 3 sales");
    assert.notEqual(read.text, money(40));
  });

  it("uses the stored count when the sales array is empty", () => {
    const read = resolvePriceRead({
      value: value({
        status: "ok",
        median: 18,
        low: 11,
        high: 22,
        nSales: 2,
        sales: [],
      }),
    });
    assert.equal(read.kind, "range");
    assert.equal(read.isEstimate, false);
    assert.equal(read.text, "$11.00\u2013$22.00 from 2 sales");
  });

  it("does not print $0.00 when the stored median, low, or high is not a price", () => {
    const blank = resolvePriceRead({
      value: value({ status: "ok", median: 0, low: 0, high: 0, nSales: 2, sales: [] }),
    });
    assert.equal(blank.kind, "none");
    assert.equal(blank.text.includes("$0.00"), false);

    const low = resolvePriceRead({
      value: value({ status: "ok", median: 12, low: 0, high: 20, nSales: 2, sales: [] }),
    });
    assert.equal(low.kind, "range");
    assert.equal(low.text, "$12.00\u2013$20.00 from 2 sales");
    assert.equal(low.text.includes("$0.00"), false);
  });

  it("keeps the estimate when the stored count is already three or more", () => {
    const read = resolvePriceRead({
      value: value({ status: "ok", median: 10, nSales: 3 }),
      exactSales: [{ price: 10, soldAt: "2026-10-02T00:00:00.000Z" }],
    });
    assert.equal(read.kind, "estimate");
    assert.equal(read.text, money(10));
  });
});

describe("similar cards", () => {
  it("names a different parallel and grade, and links to that card", () => {
    const offer = pickSimilarOffer(SUBJECT, [
      cousin({ id: "silver", parallel: "Silver", grade: "PSA 9", sales: [{ price: 30 }, { price: 50 }] }),
    ]);
    assert.ok(offer);
    assert.equal(offer.reason, "parallel");
    assert.equal(offer.detail, "Silver · PSA 9");
    assert.equal(offer.href, "/u/donnie/cards/silver");
    assert.equal(offer.priceText, "$30.00\u2013$50.00 from 2 sales");
    assert.match(offer.detail, /Silver/);
    assert.match(offer.detail, /PSA 9/);
  });

  it("names a grade-only cousin and a nearby year", () => {
    const grade = pickSimilarOffer(SUBJECT, [
      cousin({ id: "grade", parallel: "Base", grade: "PSA 9" }),
    ]);
    assert.equal(grade?.reason, "grade");
    assert.equal(grade?.detail, "Base · PSA 9");

    const year = pickSimilarOffer(SUBJECT, [
      cousin({
        id: "year",
        year: 2022,
        yearLabel: "2022-23",
        parallel: "Base",
        grade: "PSA 10",
        sales: [{ price: 22, soldAt: "2026-01-05T00:00:00.000Z" }],
      }),
    ]);
    assert.equal(year?.reason, "year");
    assert.equal(year?.detail, "2022-23 · Base · PSA 10");
    assert.match(year?.detail ?? "", /2022/);
  });

  it("prefers the same year over a nearby year and does not mix parallels", () => {
    const offer = pickSimilarOffer(SUBJECT, [
      cousin({
        id: "gold",
        parallel: "Gold",
        sales: [
          { price: 100, soldAt: "2026-08-01" },
          { price: 200, soldAt: "2026-08-02" },
        ],
      }),
      cousin({ id: "silver", parallel: "Silver", sales: [{ price: 10, soldAt: "2026-08-03" }] }),
      cousin({
        id: "older",
        year: 2022,
        parallel: "Base",
        sales: [
          { price: 1 },
          { price: 2 },
          { price: 3 },
          { price: 4 },
        ],
      }),
    ]);
    assert.equal(offer?.reason, "parallel");
    assert.equal(offer?.href, "/u/donnie/cards/gold");
    assert.equal(offer?.detail, "Gold · PSA 10");
    assert.equal(offer?.priceText, "$100.00\u2013$200.00 from 2 sales");
  });

  it("rejects the same card, a two-year gap, and a different player, set, or number", () => {
    assert.equal(similarRelation(SUBJECT, { ...SUBJECT }), null);
    assert.equal(
      similarRelation(SUBJECT, { ...SUBJECT, id: "other", year: 2021 }),
      null,
    );
    assert.equal(
      pickSimilarOffer(SUBJECT, [cousin({ id: "same", parallel: "Base", grade: "PSA 10" })]),
      null,
    );
    assert.equal(pickSimilarOffer(SUBJECT, [cousin({ id: "far", year: 2021 })]), null);
    assert.equal(
      pickSimilarOffer(SUBJECT, [cousin({ id: "who", playerName: "Shohei Ohtani" })]),
      null,
    );
    assert.equal(
      pickSimilarOffer(SUBJECT, [cousin({ id: "set", setBrand: "Panini Prizm" })]),
      null,
    );
    assert.equal(pickSimilarOffer(SUBJECT, [cousin({ id: "num", cardNumber: "99" })]), null);
    assert.equal(pickSimilarOffer(SUBJECT, [cousin({ id: "nonum", cardNumber: "" })]), null);
    assert.equal(pickSimilarOffer(SUBJECT, [cousin({ id: "user", username: "no" })]), null);
    assert.equal(pickSimilarOffer(SUBJECT, [cousin({ id: "anon", username: "" })]), null);
    assert.equal(
      similarRelation(
        { ...SUBJECT, playerName: "M. Trout" },
        { ...SUBJECT, id: "dots", playerName: "M Trout", parallel: "Silver" },
      )?.reason,
      "parallel",
    );
  });
});

describe("fallback is not drawn as the estimate", () => {
  it("ties the big dollar and the eBay link to an estimate or a real empty search", () => {
    const detail = source("components/card-detail.tsx");
    const publicView = source("components/public-card-view.tsx");
    const chart = source("components/value-chart.tsx");
    const chip = source("lib/social/use-attachment-label.ts");
    assert.match(detail, /headlineIsEstimate=\{priceRead\?\.kind === "estimate"\}/);
    assert.match(detail, /median=\{priceRead\?\.kind === "estimate" \? storedAmount : null\}/);
    assert.match(detail, /asEstimate=\{priceRead\?\.kind === "estimate" \|\| priceRead == null\}/);
    assert.match(publicView, /headlineIsEstimate=\{priceRead\?\.kind === "estimate"\}/);
    assert.match(chart, /headlineIsEstimate !== false/);
    assert.match(chart, /text-lg font-semibold tracking-tight/);
    assert.match(chip, /soldHref: chip\.showEbaySold \? ebayHref : null/);
    assert.match(source("components/tweet.tsx"), /useAttachedChip/);
    assert.match(source("components/quoted-post-embed.tsx"), /useAttachedChip/);
    assert.doesNotMatch(source("components/mail-day-card.tsx"), /resolvePriceRead|feedChipPrice|useAttachedChip/);
  });

  it("keeps a fallback label smaller than the estimate dollar and reserves the chart", () => {
    const estimate = renderToStaticMarkup(
      createElement(SalesChartPending, { priceLabel: "$120.00", priceIsEstimate: true }),
    );
    assert.match(estimate, /text-3xl/);
    assert.match(estimate, /\$120\.00/);
    assert.match(estimate, /h-44/);
    assert.match(estimate, /min-h-9/);

    const lastSale = renderToStaticMarkup(
      createElement(SalesChartPending, { priceLabel: "Last sold $12.00 on Oct 2" }),
    );
    assert.match(lastSale, /whitespace-nowrap/);
    assert.doesNotMatch(lastSale, /text-3xl/);
    assert.match(lastSale, /Last sold \$12\.00/);
    assert.match(lastSale, /on Oct 2/);
    assert.match(lastSale, /h-44/);
    assert.match(lastSale, /min-h-9/);

    const none = renderToStaticMarkup(
      createElement(SalesChartPending, { priceLabel: "No sales found yet" }),
    );
    assert.match(none, /No sales found yet/);
    assert.doesNotMatch(none, /text-3xl/);
  });
});

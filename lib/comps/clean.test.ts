import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cleanTrawlResult,
  cleanTrawlResults,
  gradesMatch,
  titleLooksExcluded,
} from "./clean";
import type { TrawlSoldResult } from "./types";

function baseResult(
  overrides: Partial<TrawlSoldResult> & {
    details?: TrawlSoldResult["details"];
  } = {},
): TrawlSoldResult {
  const { details, ...rest } = overrides;
  return {
    title: "2023 Panini Prizm Victor Wembanyama #136 PSA 10",
    sale_price: 200,
    shipping_price: 0,
    currency: "$",
    condition: "used",
    condition_raw: "Pre-Owned",
    date_sold: "2026-09-01T00:00:00.000Z",
    buying_format: "Buy It Now",
    item_id: "1001",
    item_link: "https://www.ebay.com/itm/1001",
    image_url: null,
    details: {
      listing_state: "sold",
      grading: { graded: true, grader: "PSA", grade: "10", condition: null },
      sale_price: 200,
      best_offer_accepted: false,
      sales: [
        {
          date_sold: "2026-09-01T00:00:00.000Z",
          sale_price: 200,
          shipping_price: 0,
          currency: "$",
        },
      ],
      ...details,
    },
    ...rest,
  };
}

describe("titleLooksExcluded", () => {
  it("excludes whole-word junk titles", () => {
    assert.equal(titleLooksExcluded("Wemby PSA 10 lot of 3"), true);
    assert.equal(titleLooksExcluded("proxy Wemby"), true);
    assert.equal(titleLooksExcluded("reprint card"), true);
    assert.equal(titleLooksExcluded("custom slab"), true);
    assert.equal(titleLooksExcluded("PSA 10 Candidate"), true);
    assert.equal(titleLooksExcluded("worthy auto"), true);
    assert.equal(titleLooksExcluded("you pick the card"), true);
  });

  it("keeps clean titles", () => {
    assert.equal(titleLooksExcluded("2023 Prizm Wembanyama PSA 10"), false);
    assert.equal(titleLooksExcluded("Lottery pick RC"), false);
  });
});

describe("gradesMatch", () => {
  it("matches grader and grade case-insensitively", () => {
    assert.equal(gradesMatch("PSA 10", "psa", "10"), true);
    assert.equal(gradesMatch("PSA 10", "PSA", "9"), false);
    assert.equal(gradesMatch("PSA 10", "BGS", "10"), false);
  });
});

describe("cleanTrawlResult", () => {
  it("excludes removed listings", () => {
    const result = baseResult({
      details: { listing_state: "removed" },
    });
    assert.deepEqual(cleanTrawlResult(result, "PSA 10"), []);
  });

  it("uses details.sale_price when best_offer_accepted", () => {
    const result = baseResult({
      sale_price: 250,
      details: {
        listing_state: "sold",
        best_offer_accepted: true,
        sale_price: 180,
        grading: { graded: true, grader: "PSA", grade: "10", condition: null },
        sales: [
          {
            date_sold: "2026-09-01T00:00:00.000Z",
            sale_price: 250,
            shipping_price: 0,
            currency: "$",
          },
        ],
      },
    });
    const cleaned = cleanTrawlResult(result, "PSA 10");
    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0].price, 180);
  });

  it("expands multi-quantity sales[] into separate sales", () => {
    const result = baseResult({
      details: {
        listing_state: "active",
        best_offer_accepted: null,
        sale_price: null,
        grading: { graded: true, grader: "PSA", grade: "10", condition: null },
        sales: [
          {
            date_sold: "2026-09-10T00:00:00.000Z",
            sale_price: 210,
            shipping_price: 0,
            currency: "$",
          },
          {
            date_sold: "2026-09-01T00:00:00.000Z",
            sale_price: 195,
            shipping_price: 4.99,
            currency: "$",
          },
        ],
      },
    });
    const cleaned = cleanTrawlResult(result, "PSA 10");
    assert.equal(cleaned.length, 2);
    assert.equal(cleaned[0].price, 210);
    assert.equal(cleaned[1].price, 195);
  });

  it("filters by details.grading not title text", () => {
    const psa9 = baseResult({
      title: "2023 Prizm Wembanyama PSA 10",
      details: {
        listing_state: "sold",
        grading: { graded: true, grader: "PSA", grade: "9", condition: null },
        sales: [
          {
            date_sold: "2026-09-01T00:00:00.000Z",
            sale_price: 100,
            shipping_price: 0,
            currency: "$",
          },
        ],
      },
    });
    assert.deepEqual(cleanTrawlResult(psa9, "PSA 10"), []);
  });

  it("drops excluded titles across a batch", () => {
    const results = [
      baseResult({ title: "Wemby candidate PSA 10" }),
      baseResult({ item_id: "1002", title: "2023 Prizm Wembanyama PSA 10" }),
    ];
    const cleaned = cleanTrawlResults(results, "PSA 10");
    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0].itemId, "1002");
  });
});

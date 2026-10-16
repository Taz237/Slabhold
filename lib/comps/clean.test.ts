import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cleanTrawlResult,
  cleanTrawlResults,
  gradesMatch,
  isLowConfidence,
  parseGradeFromTitle,
  prepareSales,
  resolveListingGrade,
  titleHasCardNumber,
  titleHasDisallowedParallel,
  titleLooksExcluded,
  titleMatchesCard,
  titleNamesWrongSet,
} from "./clean";
import { cleanedToCompListings } from "./map";
import { filterPriceOutliers, middleFifty } from "./stats";
import type { CleanedSale, TrawlSoldResult } from "./types";

const WEMBY_BASE = {
  grade: "PSA 10",
  cardNumber: "136",
  setBrand: "Panini Prizm",
  parallel: "Base",
} as const;

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
    assert.equal(titleLooksExcluded("Wemby autograph PSA 10"), true);
    assert.equal(titleLooksExcluded("you pick the card"), true);
    assert.equal(titleLooksExcluded("Wemby RP PSA 10"), true);
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

describe("isLowConfidence", () => {
  it("is true when N < 5 including zero", () => {
    assert.equal(isLowConfidence(0), true);
    assert.equal(isLowConfidence(4), true);
    assert.equal(isLowConfidence(5), false);
  });
});

describe("Wemby Prizm #136 PSA 10 matching", () => {
  it("accepts a clean base Prizm #136 PSA 10", () => {
    const cleaned = cleanTrawlResult(baseResult(), WEMBY_BASE);
    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0].grader, "PSA");
    assert.equal(cleaned[0].grade, "10");
    assert.equal(
      cleaned[0].title,
      "2023 Panini Prizm Victor Wembanyama #136 PSA 10",
    );
  });

  it("accepts the exact base listing title", () => {
    assert.equal(
      titleMatchesCard(
        "2023 Panini Prizm Victor Wembanyama #136 PSA 10",
        WEMBY_BASE,
      ),
      true,
    );
  });

  it("rejects Silver Prizm, lots, autos, and /99 for the base card", () => {
    const rejects = [
      "2023 Prizm Silver Wembanyama #136 PSA 10",
      "2023 Panini Prizm Victor Wembanyama #136 PSA 10 lot of 2",
      "2023 Panini Prizm Victor Wembanyama #136 PSA 10 auto",
      "2023 Panini Prizm Victor Wembanyama Autograph #136 PSA 10",
      "2023 Panini Prizm Victor Wembanyama #136 /99 PSA 10",
    ];
    for (const title of rejects) {
      assert.equal(
        titleMatchesCard(title, WEMBY_BASE),
        false,
        `should reject: ${title}`,
      );
      assert.deepEqual(
        cleanTrawlResult(baseResult({ title }), WEMBY_BASE),
        [],
        `should reject cleaned: ${title}`,
      );
    }
  });

  it("rejects Select, Mosaic, Monopoly, Silver Prizm, PSA 9, candidate, and lots", () => {
    const rejects = [
      baseResult({
        item_id: "s",
        title: "2023 Panini Select Victor Wembanyama #136 PSA 10",
      }),
      baseResult({
        item_id: "m",
        title: "2023 Panini Mosaic Victor Wembanyama #136 PSA 10",
      }),
      baseResult({
        item_id: "mon",
        title: "2023 Monopoly Prizm Victor Wembanyama #136 PSA 10",
      }),
      baseResult({
        item_id: "sil",
        title: "2023 Panini Prizm Silver Victor Wembanyama #136 PSA 10",
      }),
      baseResult({
        item_id: "p9",
        title: "2023 Panini Prizm Victor Wembanyama #136 PSA 9",
        details: {
          listing_state: "sold",
          grading: { graded: true, grader: "PSA", grade: "9", condition: null },
          sales: [
            {
              date_sold: "2026-09-01T00:00:00.000Z",
              sale_price: 80,
              shipping_price: 0,
              currency: "$",
            },
          ],
        },
      }),
      baseResult({
        item_id: "cand",
        title: "2023 Panini Prizm Victor Wembanyama #136 PSA 10 candidate",
      }),
      baseResult({
        item_id: "lot",
        title: "2023 Panini Prizm Victor Wembanyama #136 PSA 10 lot of 2",
      }),
    ];

    for (const result of rejects) {
      assert.deepEqual(
        cleanTrawlResult(result, WEMBY_BASE),
        [],
        `should reject: ${result.title}`,
      );
    }
  });

  it("requires card number and set name", () => {
    assert.equal(titleHasCardNumber("Wemby #136 PSA 10", "136"), true);
    assert.equal(titleHasCardNumber("Wemby 136 PSA 10", "136"), true);
    assert.equal(titleHasCardNumber("Wemby #135 PSA 10", "136"), false);
    assert.equal(titleNamesWrongSet("2023 Select Wemby #136", "Panini Prizm"), true);
    assert.equal(
      titleMatchesCard("2023 Panini Prizm Victor Wembanyama PSA 10", WEMBY_BASE),
      false,
    );
  });

  it("rejects parallel words on base cards", () => {
    assert.equal(
      titleHasDisallowedParallel(
        "2023 Panini Prizm Silver Victor Wembanyama #136 PSA 10",
        "Base",
      ),
      true,
    );
    assert.equal(
      titleHasDisallowedParallel(
        "2023 Panini Prizm Victor Wembanyama #136 PSA 10",
        "Base",
      ),
      false,
    );
  });
});

describe("grade resolution", () => {
  it("prefers Trawl grading details over the title", () => {
    const result = baseResult({
      title: "2023 Panini Prizm Victor Wembanyama #136 PSA 10",
      details: {
        listing_state: "sold",
        grading: { graded: true, grader: "PSA", grade: "9", condition: null },
      },
    });
    const resolved = resolveListingGrade(result);
    assert.deepEqual(resolved, { grader: "PSA", grade: "9" });
    assert.deepEqual(cleanTrawlResult(result, WEMBY_BASE), []);
  });

  it("parses grade from the title when details are missing", () => {
    const result = baseResult({
      title: "2023 Panini Prizm Victor Wembanyama #136 PSA 10",
      details: {
        listing_state: "sold",
        grading: { graded: false, grader: null, grade: null, condition: null },
        sales: [
          {
            date_sold: "2026-09-01T00:00:00.000Z",
            sale_price: 200,
            shipping_price: 0,
            currency: "$",
          },
        ],
      },
    });
    assert.deepEqual(parseGradeFromTitle(result.title), {
      grader: "PSA",
      grade: "10",
    });
    const cleaned = cleanTrawlResult(result, WEMBY_BASE);
    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0].grader, "PSA");
    assert.equal(cleaned[0].grade, "10");
  });

  it("drops comps when grade cannot be determined", () => {
    const result = baseResult({
      title: "2023 Panini Prizm Victor Wembanyama #136",
      details: {
        listing_state: "sold",
        grading: { graded: false, grader: null, grade: null, condition: null },
        sales: [
          {
            date_sold: "2026-09-01T00:00:00.000Z",
            sale_price: 50,
            shipping_price: 0,
            currency: "$",
          },
        ],
      },
    });
    assert.equal(resolveListingGrade(result), null);
    assert.deepEqual(cleanTrawlResult(result, WEMBY_BASE), []);
  });
});

describe("cleanTrawlResult", () => {
  it("excludes removed listings", () => {
    const result = baseResult({
      details: { listing_state: "removed" },
    });
    assert.deepEqual(cleanTrawlResult(result, WEMBY_BASE), []);
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
    const cleaned = cleanTrawlResult(result, WEMBY_BASE);
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
    const cleaned = cleanTrawlResult(result, WEMBY_BASE);
    assert.equal(cleaned.length, 2);
    assert.equal(cleaned[0].price, 210);
    assert.equal(cleaned[1].price, 195);
  });

  it("filters by details.grading not title text", () => {
    const psa9 = baseResult({
      title: "2023 Panini Prizm Victor Wembanyama #136 PSA 10",
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
    assert.deepEqual(cleanTrawlResult(psa9, WEMBY_BASE), []);
  });

  it("drops excluded titles across a batch", () => {
    const results = [
      baseResult({
        title: "2023 Panini Prizm Victor Wembanyama #136 PSA 10 candidate",
      }),
      baseResult({
        item_id: "1002",
        title: "2023 Panini Prizm Victor Wembanyama #136 PSA 10",
      }),
    ];
    const cleaned = cleanTrawlResults(results, WEMBY_BASE);
    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0].itemId, "1002");
  });
});

describe("filterPriceOutliers", () => {
  it("drops sales below 0.4x or above 2.5x the median", () => {
    const sales: CleanedSale[] = [
      saleAt(100),
      saleAt(110),
      saleAt(105),
      saleAt(10),
      saleAt(500),
    ];
    const filtered = filterPriceOutliers(sales);
    assert.deepEqual(
      filtered.map((s) => s.price).sort((a, b) => a - b),
      [100, 105, 110],
    );
  });
});

describe("prepareSales stats match filtered list", () => {
  it("count and median come from the post-filter list only", () => {
    const results = [
      baseResult({
        item_id: "a",
        sale_price: 100,
        details: {
          listing_state: "sold",
          grading: { graded: true, grader: "PSA", grade: "10", condition: null },
          sales: [
            {
              date_sold: "2026-09-01T00:00:00.000Z",
              sale_price: 100,
              shipping_price: 0,
              currency: "$",
            },
          ],
        },
      }),
      baseResult({
        item_id: "b",
        sale_price: 110,
        details: {
          listing_state: "sold",
          grading: { graded: true, grader: "PSA", grade: "10", condition: null },
          sales: [
            {
              date_sold: "2026-09-02T00:00:00.000Z",
              sale_price: 110,
              shipping_price: 0,
              currency: "$",
            },
          ],
        },
      }),
      baseResult({
        item_id: "c",
        sale_price: 105,
        details: {
          listing_state: "sold",
          grading: { graded: true, grader: "PSA", grade: "10", condition: null },
          sales: [
            {
              date_sold: "2026-09-03T00:00:00.000Z",
              sale_price: 105,
              shipping_price: 0,
              currency: "$",
            },
          ],
        },
      }),
      baseResult({
        item_id: "outlier",
        sale_price: 900,
        details: {
          listing_state: "sold",
          grading: { graded: true, grader: "PSA", grade: "10", condition: null },
          sales: [
            {
              date_sold: "2026-09-04T00:00:00.000Z",
              sale_price: 900,
              shipping_price: 0,
              currency: "$",
            },
          ],
        },
      }),
      baseResult({
        item_id: "silver",
        title: "2023 Prizm Silver Wembanyama #136 PSA 10",
        sale_price: 200,
      }),
    ];

    const sales = prepareSales(results, WEMBY_BASE);
    const comps = cleanedToCompListings(sales);
    const stats = middleFifty(comps.map((c) => c.soldPrice));

    assert.equal(sales.length, 3);
    assert.equal(comps.length, 3);
    assert.equal(comps.length, sales.length);
    assert.equal(Math.round(stats.median!), 105);
    assert.ok(comps.every((c) => !/silver/i.test(c.title)));
    assert.ok(comps.every((c) => c.title.includes("Panini Prizm")));
  });
});

function saleAt(price: number): CleanedSale {
  return {
    itemId: `id-${price}`,
    title: "2023 Panini Prizm Victor Wembanyama #136 PSA 10",
    price,
    currency: "$",
    soldAt: "2026-09-01T00:00:00.000Z",
    grader: "PSA",
    grade: "10",
    url: "https://www.ebay.com/itm/1",
  };
}

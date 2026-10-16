import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCompsQuery,
  filterComps,
  titleMatchesCard,
  type MatchCard,
} from "./match";
import type { TrawlSoldResult } from "./types";

function rawResult(
  title: string,
  opts: {
    item_id?: string;
    sale_price?: number;
    grading?: {
      graded: boolean;
      grader: string | null;
      grade: string | null;
      condition: string | null;
    };
  } = {},
): TrawlSoldResult {
  return {
    title,
    sale_price: opts.sale_price ?? 20,
    shipping_price: 0,
    currency: "$",
    condition: "used",
    condition_raw: "Pre-Owned",
    date_sold: "2026-09-01T00:00:00.000Z",
    buying_format: "Buy It Now",
    item_id: opts.item_id ?? "r1",
    item_link: "https://www.ebay.com/itm/r1",
    image_url: null,
    details: {
      listing_state: "sold",
      grading: opts.grading ?? {
        graded: false,
        grader: null,
        grade: null,
        condition: null,
      },
      sales: [
        {
          date_sold: "2026-09-01T00:00:00.000Z",
          sale_price: opts.sale_price ?? 20,
          shipping_price: 0,
          currency: "$",
        },
      ],
    },
  };
}

function gradedResult(
  title: string,
  grader: string,
  grade: string,
  item_id = "g1",
): TrawlSoldResult {
  return rawResult(title, {
    item_id,
    sale_price: 100,
    grading: { graded: true, grader, grade, condition: null },
  });
}

describe("shared comps match", () => {
  const JAYLEN_RAW: MatchCard = {
    playerName: "Jaylen Brown",
    year: 2026,
    yearLabel: "2026",
    setBrand: "Topps",
    cardNumber: "196",
    parallel: "Base",
    conditionType: "raw",
    grade: "Raw",
  };

  const JAYLEN_NOW: MatchCard = {
    playerName: "Jaylen Brown",
    year: 2026,
    yearLabel: "2026",
    setBrand: "Topps Now",
    cardNumber: "AS22",
    parallel: "Base",
    conditionType: "graded",
    grade: "PSA 10",
  };

  const WEMBY_RAW: MatchCard = {
    playerName: "Victor Wembanyama",
    year: 2023,
    yearLabel: "2023-24",
    setBrand: "Panini Prizm",
    cardNumber: "136",
    parallel: "Base",
    conditionType: "raw",
    grade: "Raw",
  };

  const GOLD_SERIAL: MatchCard = {
    playerName: "Victor Wembanyama",
    year: 2023,
    yearLabel: "2023",
    setBrand: "Panini Prizm",
    cardNumber: "136",
    parallel: "Gold",
    serialRun: 10,
    conditionType: "raw",
    grade: "Raw",
  };

  it('raw Jaylen Brown 2026 Topps rejects "Topps Now #AS22 PSA 10"', () => {
    const title = "2026 Topps Now All-Star Game #AS22 Jaylen Brown PSA 10";
    assert.equal(titleMatchesCard(title, JAYLEN_RAW), false);
    assert.equal(
      filterComps(JAYLEN_RAW, [
        gradedResult(title, "PSA", "10"),
      ]).length,
      0,
    );
  });

  it("Topps Now #AS22 PSA 10 accepts matching listing", () => {
    const title = "2026 Topps Now All-Star Game #AS22 Jaylen Brown PSA 10";
    assert.equal(titleMatchesCard(title, JAYLEN_NOW), true);
    const sales = filterComps(JAYLEN_NOW, [
      gradedResult(title, "PSA", "10"),
    ]);
    assert.equal(sales.length, 1);
  });

  it("raw Prizm #136 Base rejects Silver and PSA comps", () => {
    const silver = "2023 Panini Prizm Silver Victor Wembanyama #136";
    const psa = "2023 Panini Prizm Victor Wembanyama #136 PSA 10";
    const rawOk = "2023-24 Panini Prizm Victor Wembanyama #136";

    assert.equal(titleMatchesCard(silver, WEMBY_RAW), false);
    assert.equal(titleMatchesCard(psa, WEMBY_RAW), false);
    assert.equal(titleMatchesCard(rawOk, WEMBY_RAW), true);

    assert.equal(
      filterComps(WEMBY_RAW, [
        rawResult(silver, { item_id: "s" }),
        gradedResult(psa, "PSA", "10", "p"),
        rawResult(rawOk, { item_id: "ok", sale_price: 40 }),
      ]).length,
      1,
    );
  });

  it("Gold /10 requires /10 in the title", () => {
    const withSerial = "2023 Panini Prizm Gold Victor Wembanyama #136 /10";
    const noSerial = "2023 Panini Prizm Gold Victor Wembanyama #136";
    const wrongSerial = "2023 Panini Prizm Gold Victor Wembanyama #136 /25";

    assert.equal(titleMatchesCard(withSerial, GOLD_SERIAL), true);
    assert.equal(titleMatchesCard(noSerial, GOLD_SERIAL), false);
    assert.equal(titleMatchesCard(wrongSerial, GOLD_SERIAL), false);
  });

  it("buildCompsQuery builds the preview line", () => {
    assert.equal(
      buildCompsQuery({
        playerName: "Victor Wembanyama",
        year: 2023,
        yearLabel: "2023-24",
        setBrand: "Panini Prizm",
        cardNumber: "136",
        parallel: "Base",
        conditionType: "graded",
        grade: "PSA 10",
      }),
      "2023-24 Panini Prizm #136 Victor Wembanyama, Base, PSA 10",
    );
  });

  it("base card excludes titles with a serial run", () => {
    assert.equal(
      titleMatchesCard(
        "2023 Panini Prizm Victor Wembanyama #136 /99",
        WEMBY_RAW,
      ),
      false,
    );
  });
});

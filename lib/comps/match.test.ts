import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCompsQuery,
  filterComps,
  titleMatchesCard,
  type MatchCard,
} from "./match";
import type { CleanedSale, TrawlSoldResult } from "./types";

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

  const WEMBY_PSA10: MatchCard = {
    playerName: "Victor Wembanyama",
    year: 2023,
    yearLabel: "2023-24",
    setBrand: "Panini Prizm",
    cardNumber: "136",
    parallel: "Base",
    conditionType: "graded",
    grade: "PSA 10",
    isRookie: true,
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

  it("accepts Laser as the Lazer parallel", () => {
    const lazer: MatchCard = { ...WEMBY_RAW, parallel: "Lazer" };
    const laserTitle = "2023-24 Panini Prizm Victor Wembanyama #136 Laser";
    const lazerTitle = "2023-24 Panini Prizm Victor Wembanyama #136 Lazer";
    assert.equal(titleMatchesCard(laserTitle, lazer), true);
    assert.equal(titleMatchesCard(lazerTitle, lazer), true);
    assert.equal(titleMatchesCard(laserTitle, { ...lazer, parallel: "Laser" }), true);
    assert.equal(titleMatchesCard(laserTitle, WEMBY_RAW), false);
    assert.equal(
      filterComps(lazer, [rawResult(laserTitle, { item_id: "laser", sale_price: 80 })]).length,
      1,
    );
  });

  it("Wemby Prizm #136 PSA 10 rejects raw, PSA 9, BGS 10, and lots; accepts PSA 10", () => {
    const accept = "2023 Prizm Wembanyama #136 PSA 10";
    const rawTitle = "2023-24 Panini Prizm Victor Wembanyama #136";
    const psa9 = "2023 Panini Prizm Victor Wembanyama #136 PSA 9";
    const bgs10 = "2023 Panini Prizm Victor Wembanyama #136 BGS 10";
    const lot = "2023 Prizm base set lot";

    assert.equal(titleMatchesCard(accept, WEMBY_PSA10), true);
    assert.equal(titleMatchesCard(lot, WEMBY_PSA10), false);

    const sales = filterComps(WEMBY_PSA10, [
      gradedResult(accept, "PSA", "10", "ok"),
      rawResult(rawTitle, { item_id: "raw" }),
      gradedResult(psa9, "PSA", "9", "p9"),
      gradedResult(bgs10, "BGS", "10", "b10"),
      rawResult(lot, { item_id: "lot", sale_price: 200 }),
    ]);
    assert.equal(sales.length, 1);
    assert.equal(sales[0].itemId, "ok");
  });

  it('raw card rejects any "PSA 10" title', () => {
    const title = "2023 Panini Prizm Victor Wembanyama #136 PSA 10";
    assert.equal(titleMatchesCard(title, WEMBY_RAW), false);
    assert.equal(
      filterComps(WEMBY_RAW, [gradedResult(title, "PSA", "10")]).length,
      0,
    );
    assert.equal(
      filterComps(WEMBY_RAW, [
        rawResult(title, {
          grading: {
            graded: false,
            grader: null,
            grade: null,
            condition: null,
          },
        }),
      ]).length,
      0,
    );
  });

  it("re-filters cached CleanedSale rows (lots and wrong grades drop)", () => {
    const cached: CleanedSale[] = [
      {
        itemId: "ok",
        title: "2023 Prizm Wembanyama #136 PSA 10",
        price: 100,
        currency: "$",
        soldAt: "2026-09-01T00:00:00.000Z",
        grader: "PSA",
        grade: "10",
        url: "https://www.ebay.com/itm/ok",
      },
      {
        itemId: "lot",
        title: "2023 Prizm base set lot",
        price: 200,
        currency: "$",
        soldAt: "2026-09-01T00:00:00.000Z",
        grader: "PSA",
        grade: "10",
        url: "https://www.ebay.com/itm/lot",
      },
      {
        itemId: "raw",
        title: "2023-24 Panini Prizm Victor Wembanyama #136",
        price: 40,
        currency: "$",
        soldAt: "2026-09-01T00:00:00.000Z",
        grader: null,
        grade: null,
        url: "https://www.ebay.com/itm/raw",
      },
    ];
    const sales = filterComps(WEMBY_PSA10, cached);
    assert.equal(sales.length, 1);
    assert.equal(sales[0].itemId, "ok");
  });

  it("Gold /10 requires /10 in the title", () => {
    const withSerial = "2023 Panini Prizm Gold Victor Wembanyama #136 /10";
    const noSerial = "2023 Panini Prizm Gold Victor Wembanyama #136";
    const wrongSerial = "2023 Panini Prizm Gold Victor Wembanyama #136 /25";

    assert.equal(titleMatchesCard(withSerial, GOLD_SERIAL), true);
    assert.equal(titleMatchesCard(noSerial, GOLD_SERIAL), false);
    assert.equal(titleMatchesCard(wrongSerial, GOLD_SERIAL), false);
  });

  it("buildCompsQuery builds the preview line with RC", () => {
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
        isRookie: true,
      }),
      "2023-24 Panini Prizm #136 Victor Wembanyama RC, Base, PSA 10",
    );
  });

  it("buildCompsQuery omits year when empty", () => {
    assert.equal(
      buildCompsQuery({
        playerName: "Victor Wembanyama",
        year: 0,
        yearLabel: "",
        setBrand: "Panini Prizm",
        cardNumber: "136",
        parallel: "Base",
        conditionType: "graded",
        grade: "PSA 10",
      }),
      "Panini Prizm #136 Victor Wembanyama, Base, PSA 10",
    );
  });

  it("plain Fleer rejects Ultra and Traditions Crystal and keeps base Fleer", () => {
    const jordan: MatchCard = {
      playerName: "Michael Jordan",
      year: 1997,
      yearLabel: "1997-98",
      setBrand: "Fleer",
      cardNumber: "23",
      parallel: "Base",
      conditionType: "graded",
      grade: "PSA 9",
    };
    const ultra = "1997-98 Fleer Ultra Michael Jordan #23 PSA 9";
    const crystal = "Fleer Traditions Crystal Michael Jordan PSA 9";
    const base = "1997-98 Fleer Michael Jordan #23 PSA 9";
    assert.equal(titleMatchesCard(ultra, jordan), false);
    assert.equal(titleMatchesCard(crystal, jordan), false);
    assert.equal(
      titleMatchesCard("1997-98 Fleer Traditions Crystal Michael Jordan #23 PSA 9", jordan),
      false,
    );
    assert.equal(titleMatchesCard(base, jordan), true);
    assert.equal(titleMatchesCard("1997 Fleers Michael Jordan #23 PSA 9", jordan), false);
    assert.deepEqual(
      filterComps(jordan, [
        gradedResult(ultra, "PSA", "9", "ultra"),
        gradedResult(crystal, "PSA", "9", "crystal"),
        gradedResult(base, "PSA", "9", "base"),
      ]).map((sale) => sale.itemId),
      ["base"],
    );
  });

  it("Fleer Ultra accepts a Fleer Ultra title", () => {
    const jordan: MatchCard = {
      playerName: "Michael Jordan",
      year: 1997,
      yearLabel: "1997-98",
      setBrand: "Fleer Ultra",
      cardNumber: "23",
      parallel: "Base",
      conditionType: "graded",
      grade: "PSA 9",
    };
    const title = "1997-98 Fleer Ultra Michael Jordan #23 PSA 9";
    assert.equal(titleMatchesCard(title, jordan), true);
    assert.equal(filterComps(jordan, [gradedResult(title, "PSA", "9")]).length, 1);
  });

  it("plain Topps rejects Chrome and Now and keeps plain Topps", () => {
    const card: MatchCard = {
      playerName: "LeBron James",
      year: 2024,
      yearLabel: "2024",
      setBrand: "Topps",
      cardNumber: "1",
      parallel: "Base",
      conditionType: "graded",
      grade: "PSA 9",
    };
    assert.equal(
      titleMatchesCard("2024 Topps Chrome LeBron James #1 PSA 9", card),
      false,
    );
    assert.equal(
      titleMatchesCard("2024 Topps Now LeBron James #1 PSA 9", card),
      false,
    );
    assert.equal(
      titleMatchesCard("2024 Topps LeBron James #1 PSA 9", card),
      true,
    );
  });

  it("plain sets keep ordinary title words and still reject the full product", () => {
    const prizm: MatchCard = {
      playerName: "Jaxson Dart",
      year: 2025,
      yearLabel: "2025",
      setBrand: "Panini Prizm",
      cardNumber: "332",
      parallel: "Base",
      conditionType: "raw",
      grade: "Raw",
    };
    assert.equal(
      titleMatchesCard(
        "2025 Panini Prizm Jaxson Dart #332 RC Giants 1st Round Draft",
        prizm,
      ),
      true,
    );
    assert.equal(
      titleMatchesCard("2025 Panini Prizm Draft Picks Jaxson Dart #332 RC", prizm),
      false,
    );

    const bowman: MatchCard = {
      playerName: "Jackson Holliday",
      year: 2024,
      yearLabel: "2024",
      setBrand: "Bowman",
      cardNumber: "1",
      parallel: "Base",
      conditionType: "raw",
      grade: "Raw",
    };
    assert.equal(
      titleMatchesCard("2024 Bowman Jackson Holliday #1 RC Best Rookie Card", bowman),
      true,
    );
    assert.equal(
      titleMatchesCard("2024 Bowman's Best Jackson Holliday #1 RC", bowman),
      false,
    );
    assert.equal(
      titleMatchesCard("2024 Bowman Bowmans Best Jackson Holliday #1 RC", bowman),
      false,
    );

    const topps: MatchCard = {
      playerName: "Shohei Ohtani",
      year: 2024,
      yearLabel: "2024",
      setBrand: "Topps",
      cardNumber: "50",
      parallel: "Base",
      conditionType: "raw",
      grade: "Raw",
    };
    assert.equal(
      titleMatchesCard("2024 Topps Shohei Ohtani #50 RC Now", topps),
      true,
    );
    assert.equal(
      titleMatchesCard("2024 Topps Now Shohei Ohtani #50 RC", topps),
      false,
    );

    const upperDeck: MatchCard = {
      playerName: "Alexander Ovechkin",
      year: 2005,
      yearLabel: "2005-06",
      setBrand: "Upper Deck",
      cardNumber: "201",
      parallel: "Base",
      conditionType: "raw",
      grade: "Raw",
    };
    assert.equal(
      titleMatchesCard(
        "2005-06 Upper Deck Alexander Ovechkin #201 Young Guns RC SP",
        upperDeck,
      ),
      true,
    );
    assert.equal(
      titleMatchesCard(
        "2005-06 Upper Deck SP Authentic Alexander Ovechkin #201 RC",
        upperDeck,
      ),
      false,
    );
    assert.equal(
      titleMatchesCard(
        "2005-06 Upper Deck SPX Alexander Ovechkin #201 RC",
        upperDeck,
      ),
      false,
    );
  });

  it("plain Prizm rejects Prizm Draft Picks", () => {
    const card: MatchCard = {
      playerName: "Victor Wembanyama",
      year: 2023,
      yearLabel: "2023-24",
      setBrand: "Prizm",
      cardNumber: "136",
      parallel: "Base",
      conditionType: "graded",
      grade: "PSA 9",
    };
    assert.equal(
      titleMatchesCard("2023-24 Prizm Draft Picks Victor Wembanyama #136 PSA 9", card),
      false,
    );
    assert.equal(
      titleMatchesCard("2023-24 Prizm Victor Wembanyama #136 PSA 9", card),
      true,
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

  it("treats Optic Preview Pink aliases as one Donruss parallel", () => {
    const card: MatchCard = {
      playerName: "J.J. McCarthy",
      year: 2024,
      setBrand: "Panini Donruss",
      cardNumber: "303",
      parallel: "Optic Preview-Pink",
      conditionType: "raw",
      grade: "Raw",
    };
    const spaced = { ...card, parallel: "Optic Preview Pink" };
    assert.equal(
      titleMatchesCard("2024 DONRUSS #303 JJ McCARTHY OPTIC PREVIEW-PINK", card),
      true,
    );
    assert.equal(
      titleMatchesCard("2024 Donruss J.J. McCarthy Optic Preview Pink #303", spaced),
      true,
    );
    assert.equal(
      titleMatchesCard("2024 DONRUSS #303 JJ McCARTHY PINK OPTIC PREVIEW HOLO", card),
      true,
    );
    assert.equal(
      titleMatchesCard("2024 Donruss Optic J.J. McCarthy Pink #303", { ...card, parallel: "Pink" }),
      false,
    );
    assert.equal(
      titleMatchesCard("2024 Donruss Optic J.J. McCarthy Pink #303", {
        ...card,
        setBrand: "Donruss Optic",
        parallel: "Pink",
      }),
      true,
    );
    assert.equal(
      titleMatchesCard("2024 Donruss J.J. McCarthy Pink Prizm #303", card),
      false,
    );
  });

  it("matches Donruss Optic Preview Pink Prizm as a Donruss parallel", () => {
    const title =
      "2024 Panini Donruss - Rated Rookie J.J. McCarthy #303 Optic Preview Pink Prizm";
    const card: MatchCard = {
      playerName: "J.J. McCarthy",
      year: 2024,
      setBrand: "Panini Donruss",
      cardNumber: "303",
      parallel: "Optic Preview Pink Prizm",
      conditionType: "raw",
      grade: "Raw",
    };
    assert.equal(titleMatchesCard(title, card), true);
    assert.equal(
      titleMatchesCard(title, { ...card, parallel: "Optic Preview Pink" }),
      true,
    );
    assert.equal(titleMatchesCard(title, { ...card, parallel: "Pink" }), false);
    assert.equal(titleMatchesCard(title, { ...card, parallel: "Base" }), false);
    assert.equal(
      filterComps(
        {
          ...card,
          conditionType: "graded",
          grade: "PSA 10",
        },
        [rawResult(title)],
      ).length,
      0,
    );
    assert.equal(
      titleMatchesCard(title.replace("J.J. McCarthy", "JJ McCarthy"), card),
      true,
    );
    assert.equal(
      titleMatchesCard(title.replace("J.J. McCarthy", "J. J. McCarthy"), card),
      true,
    );
    assert.equal(
      titleMatchesCard(
        "2023 Panini Donruss Optic Preview Rated Rookie #OP-1 CJ Stroud",
        {
          playerName: "C.J. Stroud",
          year: 2023,
          setBrand: "Panini Donruss",
          cardNumber: "OP-1",
          parallel: "Optic Preview",
          conditionType: "raw",
          grade: "Raw",
        },
      ),
      true,
    );
    assert.equal(
      titleMatchesCard("2024 Donruss AJ Brown Pink #12", {
        playerName: "A.J. Brown",
        year: 2024,
        setBrand: "Donruss",
        cardNumber: "12",
        parallel: "Pink",
        conditionType: "raw",
        grade: "Raw",
      }),
      true,
    );
    assert.equal(
      titleMatchesCard(
        "2023 Panini Donruss Optic Rated Rookie #201 C.J. Stroud",
        {
          playerName: "CJ Stroud",
          year: 2023,
          setBrand: "Panini Donruss",
          cardNumber: "201",
          parallel: "Base",
          conditionType: "raw",
          grade: "Raw",
        },
      ),
      false,
    );
    assert.equal(
      titleMatchesCard("2024 Donruss Optic J.J. McCarthy Pink Velocity #303", {
        ...card,
        parallel: "Pink",
      }),
      false,
    );
    assert.equal(
      titleMatchesCard("2024 Donruss Optic J.J. McCarthy Pink Press Proof #303", {
        ...card,
        parallel: "Pink",
      }),
      false,
    );
    assert.equal(
      titleMatchesCard("2024 Donruss J.J. McCarthy Pink Prizm #303", {
        ...card,
        parallel: "Pink",
      }),
      true,
    );
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SETS } from "@/lib/card-options";
import type { TrawlSoldResult } from "@/lib/comps/types";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import { CONFIRM_COPY } from "./confirm";
import { lookupLiveSolds, type LiveSoldsDeps } from "./live-solds";
import { liveSearchLadder, rankScanMatches, type ScanMatch } from "./match";
import { SAPPHIRE_BASES, SAPPHIRE_FIRST_YEAR, inSapphireFamily, isSapphireSet, sapphireBase, sapphireOf, sapphireOptionFor, sapphireSearchSet, withoutSapphire } from "./sapphire";
import { scanSalesFor } from "./scan-sales";
import { scanReadFrom } from "./session";

/** Sapphire Edition: named by the card's print or by most of its sold titles, never guessed. Made-up sales. */

const FRONT = ["BOWMAN", "1ST", "WAYNE KNIGHT", "RB", "03/10"];
const BACK = [
  "BCP-68",
  "RUNNING BACK",
  "WAYNE KNIGHT",
  "UCLA",
  "© 2026 THE TOPPS COMPANY, INC. ALL RIGHTS RESERVED.",
  "TOPPS AND BOWMAN CHROME ARE REGISTERED TRADEMARKS OF THE TOPPS COMPANY, INC.",
  "CMP#148134",
];
const SAPPHIRE_1 = "2026 Bowman U Chrome Sapphire Wayne Knight 1st Bowman Black BCP-68 /10 UCLA";
const SAPPHIRE_2 = "Wayne Knight 2026 Bowman Sapphire Edition 1st BCP-68 03/10";
const PLAIN = "2026 Bowman U Chrome Wayne Knight 1st Bowman Gold Refractor BCP-68 /10";

function read(front = FRONT, back: string[] | null = BACK) {
  return scanReadFrom({ lines: front, backLines: back, image: null, kind: "card", border: null }, INDEXED_DIRECTORY);
}

function matches(titles: string[], front = FRONT, back: string[] | null = BACK): ScanMatch[] {
  return rankScanMatches(read(front, back), [], { directory: INDEXED_DIRECTORY, products: null, soldTitles: titles.map((title) => ({ title, price: 40 })) }).matches;
}

const top = (titles: string[], front = FRONT, back: string[] | null = BACK) => matches(titles, front, back)[0];

describe("the Sapphire sets", () => {
  it("are in the set list and the Add card set picker", () => {
    for (const name of ["Bowman U Chrome Sapphire", "Bowman Chrome Sapphire", "Bowman Draft Sapphire", "Topps Chrome Sapphire"]) assert.ok(SETS.includes(name), name);
    for (const base of SAPPHIRE_BASES) {
      assert.ok(SETS.includes(base), base);
      assert.equal(sapphireOf(base), `${base} Sapphire`);
      assert.equal(sapphireBase(`${base} Sapphire`), base);
    }
    assert.equal(sapphireOf("Panini Prizm"), null);
    assert.equal(sapphireOf("Bowman U Chrome Sapphire"), null);
    assert.equal(isSapphireSet("Bowman U Chrome"), false);
    assert.equal(inSapphireFamily("Bowman Draft"), true);
    assert.equal(inSapphireFamily("Bowman"), false);
    assert.equal(sapphireSearchSet("Bowman U Chrome Sapphire"), "Bowman Sapphire");
    assert.equal(sapphireSearchSet("Topps Chrome Sapphire"), "Topps Chrome Sapphire");
    assert.equal(withoutSapphire("Bowman Sapphire Edition Black /10"), "Bowman Black /10");
  });
});

describe("naming Sapphire", () => {
  it("with nothing on the card and no titles: plain Bowman U Chrome, with the quick pick", () => {
    const match = top([]);
    assert.equal(match.setBrand, "Bowman U Chrome");
    assert.equal(match.sapphireOption, "Bowman U Chrome Sapphire");
    assert.equal(match.setSource, undefined);
  });

  it("SAPPHIRE anywhere in the OCR names it, front or back, and it is never the parallel", () => {
    for (const [front, back] of [
      [[...FRONT, "SAPPHIRE"], BACK],
      [FRONT, [...BACK, "SAPPHIRE EDITION"]],
    ] as const) {
      const match = top([], [...front], [...back]);
      assert.equal(match.setBrand, "Bowman U Chrome Sapphire");
      assert.equal(match.sapphireOption, undefined);
      assert.equal(match.parallel, "");
      assert.equal(match.cardNumber, "BCP-68");
      assert.equal(match.serialRun, 10);
    }
    // The same for the other three sets.
    assert.equal(top([], ["BOWMAN CHROME", "SAPPHIRE", "ETHAN SALAS", "SAN DIEGO PADRES"], ["ETHAN SALAS", "BCP-103", "© 2024 THE TOPPS COMPANY, INC."]).setBrand, "Bowman Chrome Sapphire");
    assert.equal(top([], ["TOPPS CHROME", "SAPPHIRE EDITION", "PAUL SKENES", "PITTSBURGH PIRATES"], ["#120", "PAUL SKENES", "© 2025 THE TOPPS COMPANY, INC."]).setBrand, "Topps Chrome Sapphire");
  });

  it("most sold titles for the same player, card # and run say Sapphire: named, and marked as from sales", () => {
    const match = top([SAPPHIRE_1, SAPPHIRE_2, PLAIN]);
    assert.equal(match.setBrand, "Bowman U Chrome Sapphire");
    assert.equal(match.setSource, "sales");
    assert.equal(match.sapphireOption, undefined);
    assert.doesNotMatch(match.parallel, /sapphire/i);
    // One card, not a second "Bowman" row for the title that says "Bowman Sapphire".
    assert.equal(matches([SAPPHIRE_1, SAPPHIRE_2, PLAIN]).length, 1);
  });

  it("no majority leaves it plain and open to the collector: a tie, one title, or titles for another card", () => {
    const cases: [string, string[]][] = [
      ["a tie", [SAPPHIRE_1, PLAIN]],
      ["one title", [SAPPHIRE_1]],
      ["another run", [SAPPHIRE_1.replace("/10", "/50"), SAPPHIRE_2.replace("03/10", "21/50"), PLAIN]],
      ["another card #", [SAPPHIRE_1.replace("BCP-68", "BCP-12"), SAPPHIRE_2.replace("BCP-68", "BCP-12"), PLAIN]],
      ["another player", [SAPPHIRE_1.replace("Wayne Knight", "Arch Manning"), SAPPHIRE_2.replace("Wayne Knight", "Arch Manning")]],
      ["a lot", [`${SAPPHIRE_1} lot of 2`, `${SAPPHIRE_2} lot`]],
    ];
    for (const [name, titles] of cases) {
      const match = top(titles);
      assert.equal(match.setBrand, "Bowman U Chrome", name);
      assert.equal(match.setSource, undefined, name);
      assert.equal(match.sapphireOption, "Bowman U Chrome Sapphire", name);
      assert.doesNotMatch(match.parallel, /sapphire/i, name);
    }
  });

  it("is never guessed from a color: a blue border and color words don't name it", () => {
    const blue = scanReadFrom({ lines: [...FRONT, "BLUE"], backLines: BACK, image: null, kind: "card", border: "blue" }, INDEXED_DIRECTORY);
    const match = rankScanMatches(blue, [], { directory: INDEXED_DIRECTORY, products: null, soldTitles: [] }).matches[0];
    assert.equal(match.setBrand, "Bowman U Chrome");
  });

  it("a set with no Sapphire Edition is never offered it, and its Sapphire parallel word stays a parallel", () => {
    const match = top([], ["PRIZM", "JAXSON DART", "GIANTS", "SAPPHIRE"], ["No. 332", "JAXSON DART", "2025 PANINI - PRIZM FOOTBALL", "© 2025 Panini America, Inc."]);
    assert.equal(match.setBrand, "Panini Prizm");
    assert.equal(match.sapphireOption, undefined);
  });

  it("the question's copy is plain", () => {
    assert.equal(CONFIRM_COPY.sapphireAsk, "Is this Sapphire?");
    assert.equal(CONFIRM_COPY.sapphireFromSales, "Sapphire matched from recent sales");
    for (const text of [CONFIRM_COPY.sapphireAsk, CONFIRM_COPY.sapphireFromSales]) assert.doesNotMatch(text, /\bfree\b|\bAI\b|\bbest\b|number one/i);
  });
});

describe("Sapphire solds", () => {
  it("searches as sellers list it, and every rung keeps the player and the card #", () => {
    const sapphire = read([...FRONT, "SAPPHIRE"]);
    const ladder = liveSearchLadder(sapphire, top([], [...FRONT, "SAPPHIRE"]), INDEXED_DIRECTORY);
    assert.equal(ladder[0], "Wayne Knight Bowman Sapphire BCP-68 /10");
    for (const query of ladder) assert.match(query, /^Wayne Knight .*BCP-68/);
    assert.equal(liveSearchLadder(read(), top([]), INDEXED_DIRECTORY)[0], "Wayne Knight Bowman U Chrome BCP-68 /10");
  });

  function sold(title: string, price: number, id: string): TrawlSoldResult {
    return {
      title,
      sale_price: price,
      shipping_price: null,
      currency: "USD",
      condition: "Ungraded",
      condition_raw: null,
      date_sold: "2026-11-05T18:00:00.000Z",
      buying_format: "Auction",
      item_id: id,
      item_link: "",
      image_url: null,
      details: null,
    } as TrawlSoldResult;
  }
  const RESULTS = [
    sold(SAPPHIRE_1, 40, "1"),
    sold(SAPPHIRE_2, 55, "2"),
    sold(PLAIN, 30, "3"),
    sold("2026 Bowman U Chrome Sapphire Wayne Knight BCP-68 /50", 9, "4"),
    sold("2026 Bowman U Chrome Sapphire Arch Manning BCP-68 /10", 900, "5"),
  ];

  it("a Sapphire card prices only from Sapphire sales of the same player, card # and run, named by their parallel", () => {
    const match = top([], [...FRONT, "SAPPHIRE"]);
    const { kept, dropped } = scanSalesFor(match, { grade: "Raw", setBrand: match.setBrand, parallel: match.parallel }, RESULTS, INDEXED_DIRECTORY);
    assert.deepEqual(kept.map((sale) => sale.price).sort(), [40, 55]);
    assert.deepEqual(kept.map((sale) => sale.parallel).sort(), ["/10, parallel not named", "Black"].sort());
    assert.equal(dropped.set, 1);
  });

  it("the regular card never prices from Sapphire sales", () => {
    const match = top([]);
    const { kept } = scanSalesFor(match, { grade: "Raw", setBrand: match.setBrand, parallel: match.parallel }, RESULTS, INDEXED_DIRECTORY);
    assert.deepEqual(kept.map((sale) => sale.price), [30]);
  });

  function deps(results: TrawlSoldResult[], queries: string[]): LiveSoldsDeps {
    return {
      directory: INDEXED_DIRECTORY,
      products: async () => [],
      cachedTitles: async () => [],
      quickCompCache: async () => null,
      now: () => Date.parse("2026-11-12T20:00:00.000Z"),
      liveSearch: async (query) => {
        queries.push(query);
        return { ok: true, results: queries.length === 1 ? results : [], fetchedAt: "2026-11-12T20:00:00.000Z" };
      },
      storeQuickComp: async () => {},
    };
  }

  it("the live lookup names Sapphire from the sold titles it gets back, and prices from them only", async () => {
    const queries: string[] = [];
    const result = await lookupLiveSolds({ capture: { lines: FRONT, backLines: BACK, kind: "card" }, rows: [] }, "user", deps(RESULTS, queries));
    const match = result.matches[0];
    assert.equal(match.setBrand, "Bowman U Chrome Sapphire");
    assert.equal(match.setSource, "sales");
    assert.ok(result.comp.status === "ok" || result.comp.status === "split");
    const labels = result.comp.status === "ok" || result.comp.status === "split" ? (result.comp.groups ?? []).map((group) => group.label) : [];
    assert.ok(labels.includes("Black"));
    assert.ok(!labels.some((label) => /sapphire|gold/i.test(label)), "the regular card's Gold sale is not this card's");
  });

  it("the quick pick: the same scan read with a SAPPHIRE line looks up Sapphire sales", async () => {
    const queries: string[] = [];
    const result = await lookupLiveSolds({ capture: { lines: [...FRONT, "SAPPHIRE"], backLines: BACK, kind: "card" }, rows: [] }, "user", deps([sold(PLAIN, 30, "3")], queries));
    assert.equal(queries[0], "Wayne Knight Bowman Sapphire BCP-68 /10");
    assert.equal(result.matches[0].setBrand, "Bowman U Chrome Sapphire");
    // Only a regular sale came back: it is not this card's, so no price.
    assert.deepEqual(result.comp, { status: "none", searched: true });
  });
});

describe("the Sapphire quick pick is only asked where it can be true", () => {
  const ask = (lines: string[], backLines: string[] | null, kind: "card" | "slab" = "card") => {
    const scan = scanReadFrom({ lines, backLines, image: null, kind, border: null }, INDEXED_DIRECTORY);
    const match = rankScanMatches(scan, [], { directory: INDEXED_DIRECTORY, products: null, soldTitles: [] }).matches[0];
    assert.ok(match, lines.join(" "));
    return match;
  };

  it("a slab is never asked: its label prints SAPPHIRE when it is one", () => {
    const slab = ask(["PSA", "2025 BOWMAN CHROME", "PROSPECTS", "#BCP-12", "CHARLIE CONDON", "GEM MT 10", "61234567"], null, "slab");
    assert.equal(slab.setBrand, "Bowman Chrome");
    assert.equal(slab.yearLabel, "2025");
    assert.equal(slab.sapphireOption, undefined);
  });

  it("a card from before its set had a Sapphire Edition is never asked", () => {
    const old = ask(["TOPPS CHROME", "MIKE TROUT", "ANGELS"], ["#144", "MIKE TROUT", "2012 TOPPS CHROME", "© 2012 THE TOPPS COMPANY, INC."]);
    assert.equal(old.setBrand, "Topps Chrome");
    assert.equal(old.yearLabel, "2012");
    assert.equal(old.sapphireOption, undefined);
  });

  it("a raw card from a year that had one is still asked", () => {
    const raw = ask(["BOWMAN CHROME", "1ST", "ETHAN SALAS", "SAN DIEGO PADRES"], ["ETHAN SALAS", "BCP-103", "2024 BOWMAN CHROME", "© 2024 THE TOPPS COMPANY, INC."]);
    assert.equal(raw.setBrand, "Bowman Chrome");
    assert.equal(raw.yearLabel, "2024");
    assert.equal(raw.sapphireOption, "Bowman Chrome Sapphire");
  });

  it("each set starts at its first Sapphire year, a season counts by its first year, and an unread year is still asked", () => {
    const cases: [string, string, boolean][] = [
      ["Topps Chrome", "2015", false],
      ["Topps Chrome", "2016", true],
      ["Bowman Draft", "2018", false],
      ["Bowman Draft", "2019", true],
      ["Bowman Chrome", "2019", false],
      ["Bowman Chrome", "2020", true],
      ["Bowman U Chrome", "2022", false],
      ["Bowman U Chrome", "2022-23", false],
      ["Bowman U Chrome", "2023", true],
      ["Bowman U Chrome", "2023-24", true],
      ["Bowman U Chrome", "", true],
      ["Panini Prizm", "2024", false],
      ["Bowman U Chrome Sapphire", "2026", false],
    ];
    for (const [set, year, asked] of cases) {
      assert.equal(sapphireOptionFor(set, year) != null, asked, `${year} ${set}`);
    }
    assert.equal(sapphireOptionFor("Bowman U Chrome", "2026"), "Bowman U Chrome Sapphire");
    assert.deepEqual(Object.keys(SAPPHIRE_FIRST_YEAR).sort(), [...SAPPHIRE_BASES].sort());
  });

  it("SAPPHIRE printed on the card still names it in any year: the gate is only on the question", () => {
    const printed = ask(["TOPPS CHROME", "SAPPHIRE", "MIKE TROUT", "ANGELS"], ["#144", "MIKE TROUT", "2012 TOPPS CHROME", "© 2012 THE TOPPS COMPANY, INC."]);
    assert.equal(printed.setBrand, "Topps Chrome Sapphire");
  });
});

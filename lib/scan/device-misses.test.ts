import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CatalogCard } from "@/lib/card-catalog";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import { catalogQueriesFor, matchScan, rankScanMatches, type ScanRead, type SoldTitle } from "./match";
import { readRawCardText } from "./raw-text";

/**
 * The real-device misses from Thu Nov 12, as fixtures: the printed text the
 * phone read (front, and the back from the flip step), the catalog rows a
 * search could return, and cached sold titles like the ones Card Ladder
 * showed. Made-up rows and titles, no real collector's card.
 *
 * The bar: the right card, or an honest open field. Never a different player.
 */

function row(partial: Partial<CatalogCard> & Pick<CatalogCard, "id" | "playerName">): CatalogCard {
  return { yearLabel: "", setBrand: "", cardNumber: "", sport: "Football", parallel: "Base", isRookie: false, ...partial };
}

function raw(front: string[], back?: string[]): ScanRead {
  return {
    kind: "raw",
    front: readRawCardText(front, INDEXED_DIRECTORY),
    back: back ? readRawCardText(back, INDEXED_DIRECTORY) : null,
  };
}

function rank(read: ScanRead, rows: CatalogCard[], soldTitles: SoldTitle[] = []) {
  return rankScanMatches(read, rows, { directory: INDEXED_DIRECTORY, products: null, soldTitles });
}

function line(match: { yearLabel: string; setBrand: string; cardNumber: string }) {
  return [match.yearLabel, match.setBrand, match.cardNumber ? `#${match.cardNumber}` : ""].filter(Boolean).join(" ");
}

describe("device miss 1: 2024 Bowman 1st Aidan Miller, magenta /299", () => {
  const FRONT = ["3B", "1ST BOWMAN", "PHILADELPHIA PHILLIES", "137/299", "AIDAN MILLER", "B"];
  // The back's bio mentions another player by name: it must never win over the nameplate.
  const BACK = [
    "AIDAN MILLER",
    "PHILADELPHIA PHILLIES - 3B",
    "BP-27",
    "BOWMAN BRIEFING: Scouts liked his bat speed as much as Scott Daly's arm.",
    "© 2024 THE TOPPS COMPANY, INC.",
  ];
  // What a loose search could return: someone else entirely.
  const SCOTT_DALY = row({ id: "daly", playerName: "Scott Daly", setBrand: "Topps", cardNumber: "CMPO73107", yearLabel: "2024" });

  it("reads the nameplate, the BP-27 code, the team's sport and the © year", () => {
    const read = raw(FRONT, BACK);
    assert.ok(read.kind === "raw");
    assert.equal(read.front.printedName, "Aidan Miller");
    assert.equal(read.back?.printedName, "Aidan Miller");
    assert.equal(read.back?.cardNumber, "BP-27");
    assert.equal(read.back?.copyrightYear, "2024");
    assert.equal(read.front.team?.sport, "Baseball");
    assert.deepEqual(read.front.serial, { number: "137", run: "299" });
  });

  it("never shows Scott Daly: every row is Aidan Miller, with the set and number the card printed", () => {
    const result = rank(raw(FRONT, BACK), [SCOTT_DALY]);
    assert.ok(result.matches.length > 0);
    for (const match of result.matches) assert.equal(match.playerName, "Aidan Miller");
    const top = result.matches[0];
    assert.equal(line(top), "2024 Bowman #BP-27");
    assert.equal(top.sport, "Baseball");
    assert.equal(top.sureness.player, "sure", "printed on the front and the back");
    assert.equal(top.sureness.number, "sure");
    assert.equal(top.sureness.year, "likely", "from the © year, not printed on the front");
    assert.equal(top.serialRun, 299);
    assert.equal(top.serialNo, "137");
  });

  it("leaves the parallel open with no sold titles: magenta isn't printed, and /299 isn't Base", () => {
    const top = rank(raw(FRONT, BACK), [SCOTT_DALY]).matches[0];
    assert.equal(top.parallel, "");
    assert.equal(top.sureness.parallel, "unsure");
    assert.ok(!top.parallelOptions.some((option) => option.name === "Base"));
  });

  it("takes Magenta from cached sold titles that agree on /299", () => {
    const titles = [
      { title: "2024 Bowman 1st Aidan Miller Magenta /299 #BP-27 Phillies" },
      { title: "Aidan Miller 2024 Bowman 1st Prospect Magenta 12/299 BP-27" },
      { title: "2024 Bowman Chrome Aidan Miller Gold Refractor /50 #BCP-27" },
    ];
    const top = rank(raw(FRONT, BACK), [SCOTT_DALY], titles).matches[0];
    assert.equal(top.playerName, "Aidan Miller");
    assert.equal(line(top), "2024 Bowman #BP-27");
    assert.equal(top.parallel, "Magenta");
    assert.equal(top.sureness.parallel, "likely");
    assert.equal(top.serialRun, 299);
  });

  it("searches the catalog and the sold cache for Aidan Miller, not a fuzzy other name", async () => {
    assert.deepEqual(catalogQueriesFor(raw(FRONT, BACK), INDEXED_DIRECTORY), ["Aidan Miller Bowman BP-27", "Aidan Miller"]);
    const asked: string[] = [];
    await matchScan(raw(FRONT, BACK), {
      directory: INDEXED_DIRECTORY,
      search: async () => [SCOTT_DALY],
      products: async () => [],
      soldTitles: async (player) => {
        asked.push(player);
        return [];
      },
      signal: new AbortController().signal,
    });
    assert.deepEqual(asked, ["Aidan Miller"]);
  });
});

describe("device miss 2: 2025 Panini Mosaic Jaxson Dart, orange /199", () => {
  // The Mosaic logo isn't text, so the phone read no set word.
  const FRONT = ["JAXSON DART", "GIANTS", "QB", "RC", "121/199"];
  const PRIZM = row({ id: "dart-prizm", playerName: "Jaxson Dart", yearLabel: "2025", setBrand: "Panini Prizm", cardNumber: "332", isRookie: true });
  const CHROME = row({ id: "dart-chrome", playerName: "Jaxson Dart", yearLabel: "2025", setBrand: "Topps Chrome", cardNumber: "306", isRookie: true });
  const OTHER = row({ id: "dart-6", playerName: "Jaxson Dart", yearLabel: "2025", setBrand: "Score", cardNumber: "6", isRookie: true });
  const TITLES = [
    { title: "Jaxson Dart /199 Rookie 2025 Panini Mosaic - Orange Prizm #362 RC Giants", price: 45, soldAt: "2026-08-05" },
    { title: "2025 Panini Mosaic Jaxson Dart Orange Prizm 88/199 #362 Rookie" },
    { title: "2025 Panini Prizm Jaxson Dart Silver #332 RC" },
  ];

  it("cached sold titles that say Mosaic beat a fallback to Prizm or Topps Chrome", () => {
    const result = rank(raw(FRONT), [PRIZM, CHROME, OTHER], TITLES);
    const top = result.matches[0];
    assert.equal(top.playerName, "Jaxson Dart");
    assert.equal(line(top), "2025 Panini Mosaic #362");
    assert.equal(top.parallel, "Orange", "the /199 titles agree on orange");
    assert.equal(top.sureness.parallel, "likely");
    assert.equal(top.serialRun, 199);
    for (const match of result.matches) assert.equal(match.playerName, "Jaxson Dart");
  });

  it("MOSAIC printed on the card beats Prizm and Topps Chrome rows, with no titles at all", () => {
    const top = rank(raw([...FRONT, "MOSAIC"]), [PRIZM, CHROME, OTHER]).matches[0];
    assert.equal(top.setBrand, "Panini Mosaic");
    assert.equal(top.parallel, "", "orange isn't printed and no title pins it");
  });

  it("with no set word and no titles, doesn't invent a set", () => {
    const result = rank(raw(FRONT), []);
    // The printed name still shows (the bake-off's player rule), with nothing invented around it.
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].playerName, "Jaxson Dart");
    assert.equal(result.matches[0].setBrand, "");
    assert.equal(result.matches[0].cardNumber, "");
    assert.equal(result.matches[0].serialRun, 199);
    assert.equal(result.matches[0].parallel, "");
  });
});

describe("device miss 3: 2025-26 Topps Chrome VJ Edgecombe, Instinct green 28/99", () => {
  const FRONT = ["VJ EDGECOMBE", "ROOKIE", "INSTINCT", "28/99"];
  const TOPPS = row({ id: "vj-topps", playerName: "VJ Edgecombe", sport: "Basketball", yearLabel: "2025-26", setBrand: "Topps", cardNumber: "203", isRookie: true });
  const CHROME = row({ id: "vj-chrome", playerName: "VJ Edgecombe", sport: "Basketball", yearLabel: "2025-26", setBrand: "Topps Chrome", cardNumber: "253", isRookie: true });
  const PRIZM = row({ id: "vj-prizm", playerName: "VJ Edgecombe", sport: "Basketball", yearLabel: "2025-26", setBrand: "Panini Prizm", cardNumber: "5", isRookie: true });
  const TITLES = [
    { title: "2025-26 Topps Chrome VJ Edgecombe Instinct Green Refractor /99 #INS-7 RC 76ers" },
    { title: "VJ Edgecombe 2025-26 Topps Chrome Instinct Green 61/99 Rookie #INS-7" },
    { title: "2025-26 Topps Chrome VJ Edgecombe #253 RC Base" },
  ];

  it("reads Instinct as the insert", () => {
    assert.equal(readRawCardText(FRONT, INDEXED_DIRECTORY).insert, "Instinct");
  });

  it("puts Instinct /99 on top from cached sold titles, not Topps #203", () => {
    const result = rank(raw(FRONT), [TOPPS, CHROME, PRIZM], TITLES);
    const top = result.matches[0];
    assert.equal(line(top), "2025-26 Topps Chrome #INS-7");
    assert.equal(top.parallel, "Instinct Green", "the color both /99 titles share");
    assert.equal(top.serialRun, 99);
    assert.equal(top.serialNo, "28");
    for (const match of result.matches) assert.equal(match.playerName, "VJ Edgecombe");
  });

  it("with TOPPS CHROME printed and no titles, keeps Instinct and /99 in the top row", () => {
    const top = rank(raw([...FRONT, "TOPPS CHROME"]), [TOPPS, CHROME, PRIZM]).matches[0];
    assert.equal(top.setBrand, "Topps Chrome");
    assert.equal(top.parallel, "Instinct", "green isn't printed, so no color");
    assert.equal(top.serialRun, 99);
  });
});

describe("device miss 4: Jaylen Brown Topps Now", () => {
  const TOPPS = row({ id: "jb-topps", playerName: "Jaylen Brown", sport: "Basketball", yearLabel: "2024-25", setBrand: "Topps", cardNumber: "12" });
  const CHROME = row({ id: "jb-chrome", playerName: "Jaylen Brown", sport: "Basketball", yearLabel: "2024-25", setBrand: "Topps Chrome", cardNumber: "40" });

  it("TOPPS NOW printed is Topps Now, not plain Topps", () => {
    const read = readRawCardText(["TOPPS NOW", "JAYLEN BROWN", "CELTICS"], INDEXED_DIRECTORY);
    assert.deepEqual(read.setNames, ["Topps Now"]);
    const top = rank(raw(["TOPPS NOW", "JAYLEN BROWN", "CELTICS"]), [TOPPS, CHROME]).matches[0];
    assert.equal(top.playerName, "Jaylen Brown");
    assert.equal(top.setBrand, "Topps Now");
  });

  it("only the logo showing: a cached Topps Now sold title names the set", () => {
    const titles = [{ title: "2024 Topps Now Jaylen Brown #NBA-12 Finals MVP Celtics" }];
    const top = rank(raw(["JAYLEN BROWN", "CELTICS"]), [TOPPS, CHROME], titles).matches[0];
    assert.equal(top.setBrand, "Topps Now");
    assert.equal(top.cardNumber, "NBA-12");
  });
});

describe("honest when the card can't be read", () => {
  it("returns no rows rather than a random player", () => {
    const result = rank(raw(["1ST BOWMAN", "PHILADELPHIA PHILLIES", "137/299"]), [row({ id: "x", playerName: "Scott Daly", setBrand: "Topps" })]);
    assert.deepEqual(result.matches, []);
  });
});

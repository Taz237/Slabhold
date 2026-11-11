import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CatalogCard } from "@/lib/card-catalog";
import type { ProductRecord } from "@/lib/cards/product-data";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import { catalogQueriesFor, matchScan, rankScanMatches, type ScanRead } from "./match";
import { readRawCardText } from "./raw-text";
import { readSlabLabel } from "./slab-label";

/** Fixture catalog rows and checklist. Made up for tests, not real collectors' cards. */
function row(partial: Partial<CatalogCard> & Pick<CatalogCard, "id" | "playerName">): CatalogCard {
  return {
    yearLabel: "",
    setBrand: "",
    cardNumber: "",
    sport: "Basketball",
    parallel: "Base",
    isRookie: false,
    ...partial,
  };
}

const LUKA_PRIZM_BASE = row({ id: "luka-prizm-base", playerName: "Luka Doncic", yearLabel: "2018-19", setBrand: "Panini Prizm", cardNumber: "280" });
const LUKA_PRIZM_SILVER = { ...LUKA_PRIZM_BASE, id: "luka-prizm-silver", parallel: "Silver" };
const LUKA_OPTIC = row({ id: "luka-optic", playerName: "Luka Doncic", yearLabel: "2018-19", setBrand: "Panini Optic", cardNumber: "177", parallel: "Holo" });
const TRAE_PRIZM = row({ id: "trae-prizm", playerName: "Trae Young", yearLabel: "2018-19", setBrand: "Panini Prizm", cardNumber: "78", parallel: "Silver" });

const WEMBY_PRIZM = row({ id: "wemby-prizm", playerName: "Victor Wembanyama", yearLabel: "2023-24", setBrand: "Panini Prizm", cardNumber: "136", isRookie: true });
const WEMBY_SELECT = row({ id: "wemby-select", playerName: "Victor Wembanyama", yearLabel: "2023-24", setBrand: "Panini Select", cardNumber: "87" });
const WEMBY_HOOPS = row({ id: "wemby-hoops", playerName: "Victor Wembanyama", yearLabel: "2023-24", setBrand: "Hoops", cardNumber: "277", isRookie: true });

const PRIZM_2023: ProductRecord = {
  sport: "Basketball",
  yearLabel: "2023-24",
  product: "Panini Prizm",
  manufacturer: "Panini",
  parallels: [
    { subset: "Base", name: "Base", serialRun: null },
    { subset: "Base", name: "Silver", serialRun: null },
    { subset: "Base", name: "Red", serialRun: 299 },
    { subset: "Base", name: "Blue", serialRun: 199 },
    { subset: "Base", name: "Purple", serialRun: 99 },
    { subset: "Base", name: "Blue Seismic", serialRun: 99 },
    { subset: "Base", name: "Gold", serialRun: 10 },
  ],
};

function slab(lines: string[]): ScanRead {
  return { kind: "slab", label: readSlabLabel(lines) };
}

function raw(front: string[], back?: string[]): ScanRead {
  return {
    kind: "raw",
    front: readRawCardText(front, INDEXED_DIRECTORY),
    back: back ? readRawCardText(back, INDEXED_DIRECTORY) : null,
  };
}

const PSA_LUKA = ["PSA", "2018 PANINI PRIZM", "#280", "LUKA DONCIC", "SILVER PRIZM", "GEM MT 10", "45678912"];

describe("rankScanMatches: slabs", () => {
  it("picks the catalog card and the parallel the label names", () => {
    const result = rankScanMatches(slab(PSA_LUKA), [LUKA_PRIZM_BASE, LUKA_PRIZM_SILVER, LUKA_OPTIC, TRAE_PRIZM], {
      directory: INDEXED_DIRECTORY,
      products: [],
    });
    const top = result.matches[0];
    assert.equal(top?.catalogId, "luka-prizm-silver");
    assert.equal(top?.playerName, "Luka Doncic");
    assert.equal(top?.yearLabel, "2018-19");
    assert.equal(top?.setBrand, "Panini Prizm");
    assert.equal(top?.cardNumber, "280");
    assert.equal(top?.parallel, "Silver");
    assert.equal(top?.sureness.parallel, "sure");
    assert.deepEqual(top?.grade, {
      company: "PSA",
      number: "10",
      qualifier: "",
      certNumber: "45678912",
      authentic: false,
      autoGrade: "",
    });
    assert.equal(result.settled, true);
  });

  it("shows one row per card, not one per parallel, at most three", () => {
    const result = rankScanMatches(slab(PSA_LUKA), [LUKA_PRIZM_BASE, LUKA_PRIZM_SILVER, LUKA_OPTIC, TRAE_PRIZM], {
      directory: INDEXED_DIRECTORY,
      products: [],
    });
    const ids = result.matches.map((match) => `${match.playerName} ${match.setBrand} ${match.cardNumber}`);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(result.matches.length <= 3);
    assert.equal(result.matches[1]?.catalogId, "luka-optic");
  });

  it("keeps a slab the catalog does not have, read from the label", () => {
    const result = rankScanMatches(
      slab(["PSA", "2020 SAGE HIT #12", "SOME PLAYER", "MINT 9", "31234567"]),
      [],
      { directory: INDEXED_DIRECTORY, products: [] },
    );
    const top = result.matches[0];
    assert.equal(top?.catalogId, null);
    assert.equal(top?.playerName, "Some Player");
    assert.equal(top?.setBrand, "Sage Hit");
    assert.equal(top?.cardNumber, "12");
    assert.equal(top?.parallel, "Base");
    assert.equal(top?.sureness.player, "likely");
    assert.equal(top?.grade?.number, "9");
  });

  it("reads autograph and rookie words as flags, not a parallel", () => {
    const result = rankScanMatches(
      slab(["PSA", "2024 TOPPS CHROME UPDATE #USC1", "PAUL SKENES", "ROOKIE AUTO", "NM-MT 8", "AUTO 10", "91234567"]),
      [],
      { directory: INDEXED_DIRECTORY, products: [] },
    );
    const top = result.matches[0];
    assert.equal(top?.playerName, "Paul Skenes");
    assert.equal(top?.sport, "Baseball");
    assert.equal(top?.yearLabel, "2024");
    assert.equal(top?.parallel, "Base");
    assert.equal(top?.isAuto, true);
    assert.equal(top?.isRookie, true);
    assert.equal(top?.grade?.autoGrade, "10");
  });

  it("ranks a catalog card with the wrong number below the right one", () => {
    const wrongNumber = { ...LUKA_PRIZM_SILVER, id: "luka-prizm-other", cardNumber: "999" };
    const result = rankScanMatches(slab(PSA_LUKA), [wrongNumber, LUKA_PRIZM_SILVER], {
      directory: INDEXED_DIRECTORY,
      products: [],
    });
    assert.equal(result.matches[0]?.catalogId, "luka-prizm-silver");
  });
});

describe("rankScanMatches: raw cards", () => {
  it("ranks by the set on the front and leaves the parallel open", () => {
    const result = rankScanMatches(raw(["VICTOR WEMBANYAMA", "PRIZM", "RC"]), [WEMBY_HOOPS, WEMBY_SELECT, WEMBY_PRIZM], {
      directory: INDEXED_DIRECTORY,
      products: [PRIZM_2023],
    });
    const top = result.matches[0];
    assert.equal(top?.catalogId, "wemby-prizm");
    assert.equal(top?.parallel, "");
    assert.equal(top?.sureness.parallel, "unsure");
    assert.equal(top?.sureness.number, "unsure");
    assert.ok(top?.parallelOptions.some((option) => option.name === "Silver"));
    assert.equal(top?.parallelOptions[0]?.name, "Base");
    assert.equal(result.settled, false);
  });

  it("pins the parallel when the serial run fits one checklist parallel", () => {
    const result = rankScanMatches(
      raw(["VICTOR WEMBANYAMA", "PRIZM", "07/10"], ["#136", "2023-24 PANINI PRIZM", "© 2024 Panini America, Inc."]),
      [WEMBY_PRIZM, WEMBY_SELECT],
      { directory: INDEXED_DIRECTORY, products: [PRIZM_2023] },
    );
    const top = result.matches[0];
    assert.equal(top?.catalogId, "wemby-prizm");
    assert.equal(top?.parallel, "Gold");
    assert.equal(top?.serialRun, 10);
    assert.equal(top?.serialNo, "7");
    assert.equal(top?.sureness.parallel, "sure");
    assert.equal(top?.sureness.number, "sure");
    assert.equal(top?.sureness.year, "sure");
    assert.equal(result.settled, true);
  });

  it("narrows the options when two parallels share a run, and a color word picks one", () => {
    const shared = rankScanMatches(raw(["VICTOR WEMBANYAMA", "PRIZM", "12/99"], ["#136"]), [WEMBY_PRIZM], {
      directory: INDEXED_DIRECTORY,
      products: [PRIZM_2023],
    }).matches[0];
    assert.equal(shared?.parallel, "");
    assert.deepEqual(shared?.parallelOptions.map((option) => option.name).sort(), ["Blue Seismic", "Purple"]);

    const named = rankScanMatches(raw(["VICTOR WEMBANYAMA", "PRIZM", "PURPLE", "12/99"], ["#136"]), [WEMBY_PRIZM], {
      directory: INDEXED_DIRECTORY,
      products: [PRIZM_2023],
    }).matches[0];
    assert.equal(named?.parallel, "Purple");
    assert.equal(named?.sureness.parallel, "likely");
  });

  it("builds a match from the card when the catalog has none", () => {
    const result = rankScanMatches(raw(["VICTOR WEMBANYAMA", "PRIZM"], ["#136", "2023-24 PANINI PRIZM"]), [], {
      directory: INDEXED_DIRECTORY,
      products: [PRIZM_2023],
    });
    const top = result.matches[0];
    assert.equal(top?.catalogId, null);
    assert.equal(top?.playerName, "Victor Wembanyama");
    assert.equal(top?.yearLabel, "2023-24");
    assert.equal(top?.setBrand, "Panini Prizm");
    assert.equal(top?.cardNumber, "136");
  });

  it("returns nothing when no player or card was read", () => {
    const result = rankScanMatches(raw([]), [WEMBY_PRIZM], { directory: INDEXED_DIRECTORY, products: [] });
    assert.deepEqual(result.matches, []);
    assert.equal(result.settled, false);
  });
});

describe("catalogQueriesFor", () => {
  it("asks for the full card, then the player alone", () => {
    assert.deepEqual(catalogQueriesFor(slab(PSA_LUKA), INDEXED_DIRECTORY), [
      "Luka Doncic 2018 Panini Prizm 280",
      "Luka Doncic",
    ]);
  });

  it("asks nothing without a player", () => {
    assert.deepEqual(catalogQueriesFor(raw(["PRIZM"]), INDEXED_DIRECTORY), []);
  });
});

describe("matchScan", () => {
  it("makes at most two catalog searches and merges their rows", async () => {
    const queries: string[] = [];
    const result = await matchScan(slab(PSA_LUKA), {
      directory: INDEXED_DIRECTORY,
      search: async (query) => {
        queries.push(query);
        return queries.length === 1 ? [LUKA_PRIZM_SILVER] : [LUKA_PRIZM_SILVER, LUKA_OPTIC];
      },
      products: async () => [],
      signal: new AbortController().signal,
    });
    assert.ok(queries.length <= 2);
    assert.equal(result?.matches[0]?.catalogId, "luka-prizm-silver");
    assert.equal(result?.matches.length, 2);
  });

  it("still matches from the label when search and checklists fail", async () => {
    const result = await matchScan(slab(PSA_LUKA), {
      directory: INDEXED_DIRECTORY,
      search: async () => null,
      products: async () => {
        throw new Error("offline");
      },
      signal: new AbortController().signal,
    });
    assert.equal(result?.matches[0]?.catalogId, null);
    assert.equal(result?.matches[0]?.playerName, "Luka Doncic");
    assert.equal(result?.matches[0]?.parallel, "Silver");
  });

  it("stops searching once aborted", async () => {
    const controller = new AbortController();
    let calls = 0;
    const result = await matchScan(slab(PSA_LUKA), {
      directory: INDEXED_DIRECTORY,
      search: async () => {
        calls += 1;
        controller.abort();
        return [LUKA_PRIZM_SILVER];
      },
      products: async () => [],
      signal: controller.signal,
    });
    assert.equal(calls, 1);
    assert.equal(result, null);
  });
});

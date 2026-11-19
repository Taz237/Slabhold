import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadChecklistsFor } from "@/lib/cards/checklist-load";
import { loadProductData } from "@/lib/cards/product-data";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import type { TrawlSoldResult } from "@/lib/comps/types";
import hardCards from "./hard-cards-v1.json";
import { hardCardBack, type HardCard } from "./hard-cards";
import { lookupLiveSolds } from "./live-solds";
import type { ScanMatch } from "./match";
import { VERSION_ROWS_SHOWN, versionChoicesFor, versionFromSerial, versionRows, versionRowsShown } from "./version-list";

/**
 * "Pick your version" on the 2023 Illusions Sam LaPorta First Impressions patch auto #131, 03/10.
 * Live (2026-11-19): the serial wasn't read and the picker offered only what recent sales named
 * (/399 and Red), so the /10 wasn't there to pick. Nothing is fetched.
 */

const CARDS = (hardCards as { cards: HardCard[] }).cards;
const card = (id: string) => CARDS.find((item) => item.id === id)!;

const sold = (titles: readonly string[]): TrawlSoldResult[] =>
  titles.map((title, index) => ({
    title,
    sale_price: 50 + index,
    shipping_price: null,
    currency: "USD",
    condition: "Ungraded",
    condition_raw: null,
    date_sold: "2026-11-10T18:00:00.000Z",
    buying_format: "Auction",
    item_id: `sale-${index}`,
    item_link: "",
    image_url: null,
    details: { grading: { graded: false, grader: null, grade: null, condition: null } },
  }));

async function lookup(id: string) {
  const item = card(id);
  return lookupLiveSolds({ capture: { lines: item.typical_ocr_front, backLines: hardCardBack(item), kind: "card", look: null }, rows: [] }, "version-list", {
    directory: SCAN_DIRECTORY,
    products: loadProductData,
    checklists: (key) => loadChecklistsFor(key),
    cachedTitles: async () => [],
    quickCompCache: async () => null,
    liveSearch: async () => ({ ok: true, results: sold(card("hc-116").listing_title_examples), fetchedAt: "2026-11-12T20:00:00.000Z" }),
    storeQuickComp: async () => {},
  });
}

const label = (option: { name: string; serialRun: number | null }) => `${option.name} /${option.serialRun}`;
const LADDER = ["Base /399", "Red /199", "Blue /99", "Black /50", "FOTL Black Ice /50", "Gold /25", "FOTL Green /10", "Green /10", "FOTL Purple /1", "Purple /1"];

describe("the LaPorta patch auto with no serial read (hc-116)", () => {
  it("lists every version on the checklist with its print run, the /10 and the 1/1 included", async () => {
    const { matches, comp } = await lookup("hc-116");
    const top = matches[0];
    assert.equal(top.parallel, "", "nothing is picked for them");
    assert.equal(versionFromSerial(top), null);
    const choices = versionChoicesFor(top);
    assert.deepEqual(choices.map(label).sort(), [...LADDER].sort());
    const { rows, unnamed } = versionRows(choices, top, { status: "done", comp, query: null });
    assert.equal(rows.length, 10);
    assert.deepEqual(versionRowsShown(rows), rows, "a short list shows whole: nothing sits behind Show all");
    // The versions recent sales name come first, with their price; the rest say so.
    assert.deepEqual(rows.slice(0, 2).map((row) => row.name).sort(), ["Blue", "Red"]);
    assert.ok(rows.slice(0, 2).every((row) => row.nSales > 0 && row.lastPriceCents != null));
    assert.ok(rows.slice(2).every((row) => row.nSales === 0 && row.lastPriceCents == null));
    assert.ok(rows.some((row) => row.name === "Green" && row.serialRun === 10), "the /10 is there to pick");
    // Sales that name no version are shown apart, never a row to pick.
    assert.deepEqual(unnamed.map((group) => group.label).sort(), ["/10, parallel not named", "Version not named"]);
  });
});

describe("the same card with its serial read, 03/10 (hc-115)", () => {
  it("only the /10 versions are offered; two share the run, so the collector picks between them", async () => {
    const { matches } = await lookup("hc-115");
    const top = matches[0];
    assert.equal(top.serialRun, 10);
    assert.deepEqual(versionChoicesFor(top).map(label), ["FOTL Green /10", "Green /10"]);
    assert.equal(versionFromSerial(top), null, "two versions at /10: never a guess");
  });

  it("a serial that exactly one version fits picks it", async () => {
    const { matches } = await lookup("hc-115");
    const one = { ...matches[0], versions: matches[0].versions!.filter((option) => option.name !== "FOTL Green") };
    assert.deepEqual(versionChoicesFor(one).map(label), ["Green /10"]);
    assert.deepEqual(versionFromSerial(one), { name: "Green", serialRun: 10 });
    // A slab's version is the collector's to pick (its sales come from reading the label again as that version).
    assert.equal(versionFromSerial({ ...one, grade: { company: "PSA", number: "10", qualifier: "", certNumber: "", authentic: false, autoGrade: "" } }), null);
    // A shaky read of the run picks nothing and shows the whole list.
    const shaky = { ...one, runUnsure: true };
    assert.equal(versionFromSerial(shaky), null);
    assert.equal(versionChoicesFor(shaky).length, 9);
  });
});

describe("the list's rules", () => {
  const base: ScanMatch = {
    catalogId: null,
    playerName: "Test Player",
    sport: "Football",
    yearLabel: "2025",
    setBrand: "Test Set",
    cardNumber: "7",
    parallel: "",
    serialRun: null,
    serialNo: "",
    isRookie: false,
    isAuto: false,
    grade: null,
    score: 0,
    sureness: { player: "sure", year: "sure", set: "sure", number: "sure", parallel: "unsure" },
    parallelOptions: [],
  };
  const many = Array.from({ length: 20 }, (_, index) => ({ name: index === 0 ? "Base" : `Color ${index}`, serialRun: index === 0 ? null : 500 - index }));

  it("a card that only its section lists gets that list: another #, or a player in two sections, stays as it was", async () => {
    const { matches } = await lookup("hc-116");
    assert.ok(matches[0].versions?.length === 10);
    // Without a list of ours, the picker offers what the scan offered.
    assert.deepEqual(versionChoicesFor({ ...base, parallelOptions: [{ name: "Silver", serialRun: null }] }), [{ name: "Silver", serialRun: null }]);
  });

  it("an autograph is never offered an unnumbered Base, and a long list opens on the scan's closest with the rest one tap away", () => {
    const auto = { ...base, isAuto: true, versions: many, parallelOptions: [many[3], many[1]] };
    const choices = versionChoicesFor(auto);
    assert.ok(!choices.some((option) => option.name === "Base"));
    assert.deepEqual(choices.slice(0, 2), [many[3], many[1]], "the scan's closest lead");
    assert.equal(choices.length, 19, "every version is on the list");
    const { rows } = versionRows(choices, auto, undefined);
    assert.ok(rows.length > VERSION_ROWS_SHOWN);
    assert.deepEqual(versionRowsShown(rows).map((row) => row.name), ["Color 3", "Color 1"]);
  });

  it("a parallel only recent sales name joins the list, first", () => {
    const match = { ...base, versions: many.slice(0, 4) };
    const comp = { status: "split" as const, groups: [{ label: "Zebra", nSales: 2, lastPriceCents: 1200, lastSoldAt: null }] };
    const { rows } = versionRows(versionChoicesFor(match), match, { status: "done", comp, query: null });
    assert.deepEqual(rows.map((row) => row.name), ["Zebra", "Base", "Color 1", "Color 2", "Color 3"]);
    assert.equal(rows[0].lastPriceCents, 1200);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withSoldGroups } from "@/components/scan/sheet-parts";
import { loadChecklistsFor } from "@/lib/cards/checklist-load";
import { loadProductData } from "@/lib/cards/product-data";
import type { TrawlSoldResult } from "@/lib/comps/types";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import hardCards from "./hard-cards-v1.json";
import { hardCardBack, type HardCard } from "./hard-cards";
import { lookupLiveSolds } from "./live-solds";
import { readRawCardText } from "./raw-text";
import { UNNAMED_VERSION_LABEL, groupByParallel, isUnnamedLabel, scanSalesFor } from "./scan-sales";

/**
 * The 2023 Illusions Sam LaPorta First Impressions #131 patch auto /10 on the live app
 * (2026-11-18): the sideways serial wasn't read, "First Impressions" showed as a version chip
 * beside "Red", and the price came from unnumbered sales. First Impressions is the insert; a
 * patch card with no run read has no price until its version is picked; and a sale only counts
 * for the parallel or run it names. Nothing is fetched.
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

async function lookup(id: string, titles: readonly string[] = card(id).listing_title_examples) {
  const item = card(id);
  return lookupLiveSolds({ capture: { lines: item.typical_ocr_front, backLines: hardCardBack(item), kind: "card", look: null }, rows: [] }, "patch-sales", {
    directory: SCAN_DIRECTORY,
    products: loadProductData,
    checklists: (key) => loadChecklistsFor(key),
    cachedTitles: async () => [],
    quickCompCache: async () => null,
    liveSearch: async () => ({ ok: true, results: sold(titles), fetchedAt: "2026-11-12T20:00:00.000Z" }),
    storeQuickComp: async () => {},
  });
}

describe("the LaPorta patch auto, its serial missed (hc-116)", () => {
  it("First Impressions is the insert, never the parallel: the parallel and the run stay open", async () => {
    const result = await lookup("hc-116");
    const top = result.matches[0];
    assert.deepEqual([top.playerName, top.setBrand, top.cardNumber, top.insertName], ["Sam LaPorta", "Panini Illusions", "131", "First Impressions"]);
    assert.equal(top.parallel, "");
    assert.equal(top.serialRun, null);
    assert.equal(top.isAuto && top.isRelic, true);
    assert.ok(!top.parallelOptions.some((option) => /first impressions|base/i.test(option.name)));
  });

  it("no sales are shown as this card's price: they show by version and run, to pick, and none is called Base or the insert", async () => {
    const { comp } = await lookup("hc-116");
    assert.equal(comp.status, "split");
    if (comp.status !== "split") return;
    assert.deepEqual(
      comp.groups.map((group) => `${group.label} x${group.nSales}`).sort(),
      ["/10, parallel not named x2", "Blue x1", "Red x3", `${UNNAMED_VERSION_LABEL} x2`],
    );
    // The chips: only versions a title names. Never Base, never the insert, never a run-only group.
    const chips = withSoldGroups([], { status: "done", comp, query: null }, null, false).map((option) => option.name);
    assert.deepEqual(chips.sort(), ["Blue", "Red"]);
  });

  it("most titles naming Red (the /99 that sold last week) still don't make this card Red", async () => {
    const titles = card("hc-116").listing_title_examples.filter((title) => /red/i.test(title));
    const { matches, comp } = await lookup("hc-116", titles);
    assert.equal(matches[0].parallel, "");
    assert.equal(comp.status, "split");
  });

  it("only unnumbered titles: still not this card's price", async () => {
    const titles = card("hc-116").listing_title_examples.filter((title) => !/\/\d/.test(title));
    const { matches, comp } = await lookup("hc-116", titles);
    assert.equal(matches[0].parallel, "");
    assert.equal(comp.status, "split");
    if (comp.status === "split") assert.deepEqual(comp.groups.map((group) => group.label), [UNNAMED_VERSION_LABEL]);
  });
});

describe("the same card with its serial read (hc-115)", () => {
  it("only the /10 sales are its price; the Red /99, the Blue /25 and the unnumbered ones are not", async () => {
    const { matches, comp } = await lookup("hc-115", card("hc-116").listing_title_examples);
    assert.equal(matches[0].serialRun, 10);
    assert.equal(matches[0].parallel, "", "no list names the /10: open, never a guess");
    assert.equal(comp.status, "ok");
    if (comp.status !== "ok") return;
    assert.equal(comp.nSales, 2);
    assert.equal(comp.parallel, "/10, parallel not named");
    assert.deepEqual(comp.groups, [{ label: "/10, parallel not named", nSales: 2 }]);
    // Nothing to offer but the run itself: no chip for another run's color.
    assert.deepEqual(withSoldGroups([], { status: "done", comp, query: null }, 10, false), []);
  });

  it("a /10 title that names its color is the only version offered", async () => {
    const titles = [...card("hc-116").listing_title_examples, "2023 Illusions Sam LaPorta First Impressions RPA Gold 07/10 #131", "Sam LaPorta 2023 Panini Illusions First Impressions Patch Auto Gold /10 #131"];
    const { comp } = await lookup("hc-115", titles);
    assert.ok(comp.status === "ok" || comp.status === "split");
    if (comp.status !== "ok" && comp.status !== "split") return;
    const labels = (comp.groups ?? []).map((group) => group.label).sort();
    assert.deepEqual(labels, ["/10, parallel not named", "Gold"]);
  });
});

describe("a sale counts only for the parallel or run its title names", () => {
  const match = { playerName: "Sam LaPorta", cardNumber: "131", serialRun: null, yearLabel: "2023" };
  const identity = { grade: "Raw", setBrand: "Panini Illusions", parallel: "" };
  const titles = ["2023 Panini Illusions Sam LaPorta #131 Lions", "2023 Panini Illusions Sam LaPorta #131 /10", "2023 Panini Illusions Sam LaPorta #131 03/10 Lions", "2023 Panini Illusions Sam LaPorta #131 Red /99"];

  it("a card with no run read: a title's \"/10\" is its own group, never mixed into Base", () => {
    const groups = groupByParallel(scanSalesFor(match, identity, sold(titles), SCAN_DIRECTORY).kept);
    assert.deepEqual(groups.map((group) => `${group.label} x${group.sales.length}`).sort(), ["/10, parallel not named x2", "Base x1", "Red x1"]);
  });

  it("a patch card is never plain: a title naming nothing is \"Version not named\", and neither it nor a run is a version to pick", () => {
    const groups = groupByParallel(scanSalesFor({ ...match, neverPlain: true }, identity, sold(titles), SCAN_DIRECTORY).kept);
    assert.ok(groups.some((group) => group.label === UNNAMED_VERSION_LABEL));
    assert.ok(!groups.some((group) => group.label === "Base"));
    assert.equal(isUnnamedLabel(UNNAMED_VERSION_LABEL), true);
    assert.equal(isUnnamedLabel("/10, parallel not named"), true);
    assert.equal(isUnnamedLabel("Red"), false);
    assert.equal(isUnnamedLabel("Base"), false);
  });
});

describe("a serial on the front is the card's serial", () => {
  it("is read off the front as the phone gives it: on its own line, spaced out, or beside other text", () => {
    const serial = (lines: string[]) => readRawCardText(lines, SCAN_DIRECTORY, { side: "front" }).serial;
    assert.deepEqual(serial(["SAM LaPORTA", "03/10", "FIRST IMPRESSIONS"]), { number: "3", run: "10" });
    assert.deepEqual(serial(["SAM LaPORTA", "03 / 10"]), { number: "3", run: "10" });
    assert.deepEqual(serial(["LIONS 03/10", "SAM LaPORTA"]), { number: "3", run: "10" });
    assert.equal(serial(["SAM LaPORTA", "FIRST IMPRESSIONS"]), null);
  });
});

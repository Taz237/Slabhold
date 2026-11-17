import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadChecklistsFor } from "@/lib/cards/checklist-load";
import { loadProductData } from "@/lib/cards/product-data";
import type { TrawlSoldResult } from "@/lib/comps/types";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import { scanCompGrade } from "./comp";
import { CONFIRM_COPY } from "./confirm";
import { listingPhotoFor } from "./listing-photo";
import { backMakerOf, setMakerOf } from "./maker";
import { rankScanMatches, scanChecklistKey, type ScanMatchResult } from "./match";
import { readRawCardText } from "./raw-text";
import { scanSalesFor } from "./scan-sales";
import { scanReadFrom, sheetStateFrom } from "./session";

/**
 * The Cameron Boozer 2026-27 Topps Rookie Code #RC-3, scanned front and back: the scan showed
 * "2026-27 O-Pee-Chee #1" with Leaf #1 and 2027-28 Topps #1 as alternates, offered Base, Silver,
 * Refractor and Gold, and compared it with a Leaf listing. Card text and titles are modeled.
 */

const TOPPS_LEGAL = "© 2026 THE TOPPS COMPANY, INC.";
const BOOZER_FRONT = ["ROOKIE CODE", "CAMERON BOOZER", "RC"];
const BOOZER_BACK = ["RC-3", "CAMERON BOOZER", "FORWARD", "Boozer came into the league as", "the No. 1 recruit in", "his high school class.", "TOPPS", TOPPS_LEGAL];
/** Titles a search for him can return: other cards of his, numbered #1, from other sets and makers. */
const JUNK_TITLES = [
  "2026-27 Topps O-Pee-Chee Cameron Boozer #1 Rookie RC",
  "2026-27 O-Pee-Chee Cameron Boozer #1 RC",
  "2025-26 Leaf Cameron Boozer #1 Duke",
  "2027 Topps Cameron Boozer #1 Draft",
].map((title) => ({ title }));

const back = (lines: string[]) => readRawCardText(["CAMERON BOOZER", ...lines, TOPPS_LEGAL], SCAN_DIRECTORY, { side: "back" });

async function scan(front: string[], backLines: string[] | null, titles = JUNK_TITLES): Promise<ScanMatchResult> {
  const read = scanReadFrom({ lines: front, backLines, kind: "card", image: null }, SCAN_DIRECTORY);
  const key = scanChecklistKey(read, SCAN_DIRECTORY);
  const checklists = key ? await loadChecklistsFor(key) : [];
  return rankScanMatches(read, [], { directory: SCAN_DIRECTORY, products: await loadProductData(), soldTitles: titles, checklists });
}

describe("letter-prefixed card numbers", () => {
  it("are read off backs and fronts: RC-3, HS-22, CB-19, with any dash", () => {
    for (const [line, number] of [["RC-3", "RC-3"], ["RC–3", "RC-3"], ["RC - 3", "RC-3"], ["HS-22", "HS-22"], ["CB-19", "CB-19"], ["rc-3", "RC-3"]]) {
      assert.equal(back([line]).cardNumber, number, line);
      assert.equal(readRawCardText(["CAMERON BOOZER", line], SCAN_DIRECTORY, { side: "front" }).cardNumber, number, `front ${line}`);
    }
  });

  it("a bio's '#1' or 'No. 1' is never the card #, and never beats the printed code", () => {
    for (const bio of ["the No. 1 recruit in", "THE NO. 1 RECRUIT IN", "he wore #12 at Duke", "was the No. 3 pick"]) {
      assert.equal(back(["RC-3", bio]).cardNumber, "RC-3", bio);
    }
    // A printed "No. 103" still reads, and so does a # beside a team or a code-less back.
    assert.equal(back(["No. 103"]).cardNumber, "103");
  });

  it("a code run into the bio's first line, the legal line or the next word still reads", () => {
    assert.equal(back(["RC-3 Cameron Boozer came into the league as"]).cardNumber, "RC-3");
    assert.equal(back(["RC-3 © 2026 THE TOPPS COMPANY, INC."]).cardNumber, "RC-3");
    assert.equal(back(["RC-3CAMERON BOOZER"]).cardNumber, "RC-3");
    // Mid-sentence it is bio text: only a hint the checklist must back.
    assert.equal(back(["Boozer joins RC-3 in the set"]).cardNumber, "");
  });

  it("a code with its hyphen lost, or split over two lines, is only a hint", () => {
    for (const lines of [["RC 3"], ["RC3"], ["RC", "3"]]) {
      const read = back(lines);
      assert.notEqual(read.cardNumber, "RC-3", lines.join("/"));
      assert.deepEqual(read.codeHints, ["RC-3"], lines.join("/"));
    }
    // Words, positions and league marks are never hints.
    assert.deepEqual(back(["NBA 75"]).codeHints, []);
    assert.deepEqual(back(["PF", "3"]).codeHints, []);
  });
});

describe("the Boozer Rookie Code RC-3", () => {
  it("reads 2026-27 Topps #RC-3 from front and back, whatever the bio and sold titles say", async () => {
    for (const backLines of [
      BOOZER_BACK,
      ["RC 3", "CAMERON BOOZER", "TOPPS", TOPPS_LEGAL],
      ["RC", "3", "CAMERON BOOZER", "TOPPS", TOPPS_LEGAL],
      ["RC-3 Cameron Boozer came into the league as", "CAMERON BOOZER", "TOPPS", TOPPS_LEGAL],
      ["RC-3", "#1", "CAMERON BOOZER", TOPPS_LEGAL],
    ]) {
      const { matches } = await scan(BOOZER_FRONT, backLines);
      const top = matches[0];
      assert.deepEqual([top?.playerName, top?.yearLabel, top?.setBrand, top?.cardNumber], ["Cameron Boozer", "2026-27", "Topps", "RC-3"], backLines.join(" / "));
      // No other card shows: never #1, never O-Pee-Chee or Leaf, never a season after the © year.
      for (const match of matches) {
        assert.equal(match.cardNumber, "RC-3", backLines.join(" / "));
        assert.doesNotMatch(`${match.setBrand} ${match.yearLabel}`, /o-pee-chee|leaf|2027-28/i);
      }
    }
  });

  it("offers Rookie Code's own parallels (Base is the plain Rookie Code card), never Silver, Refractor or Gold", async () => {
    const top = (await scan(BOOZER_FRONT, BOOZER_BACK)).matches[0];
    assert.equal(top.parallel, "");
    const names = top.parallelOptions.map((option) => option.name);
    assert.ok(names.includes("Purple Rainbow"));
    assert.equal(top.parallelOptions.find((option) => option.name === "Purple Rainbow")?.serialRun, 250);
    for (const name of names) {
      assert.ok(["Base", "Rainbow Foilboard", "Purple Rainbow", "Blue Rainbow", "Green Rainbow", "Gold Rainbow", "Orange Rainbow", "Black Rainbow", "Red Rainbow", "FoilFractor"].includes(name), name);
    }
  });

  it("an insert with no parallel list of its own offers none, never the base set's", async () => {
    // Quest for the Crown (QC-) has no parallels on the page: nothing to pick from beats a made-up list.
    const top = (await scan(["QUEST FOR THE CROWN", "GIANNIS ANTETOKOUNMPO"], ["QC-1", "GIANNIS ANTETOKOUNMPO", "TOPPS", TOPPS_LEGAL], [])).matches[0];
    assert.equal(top?.cardNumber, "QC-1");
    assert.deepEqual(top?.parallelOptions, []);
  });

  it("a front with no set read offers no made-up parallel list", async () => {
    const top = (await scan(["CAMERON BOOZER"], ["CAMERON BOOZER", "RC-7"], [])).matches[0];
    assert.equal(top?.setBrand, "");
    assert.deepEqual(top?.parallelOptions, []);
  });
});

describe("the hard guard", () => {
  it("never shows a set by another maker than the back signs", async () => {
    const { matches } = await scan(BOOZER_FRONT, ["CAMERON BOOZER", "TOPPS", TOPPS_LEGAL], [{ title: "2025-26 Leaf Cameron Boozer #1 Duke" }, { title: "2025-26 Leaf Cameron Boozer #1" }]);
    for (const match of matches) assert.doesNotMatch(match.setBrand, /leaf/i);
  });

  it("nothing fits what the back printed: no guess, 'We couldn't pin this one down'", async () => {
    // A Prizm (Panini) name on a back that signs Topps: every card we could build conflicts.
    const result = await scan(["CAMERON BOOZER", "PRIZM"], ["CAMERON BOOZER", "No. 103", TOPPS_LEGAL], []);
    assert.equal(result.matches.length, 0);
    assert.equal(result.unpinned, true);
    assert.deepEqual(sheetStateFrom(result, true), { kind: "none", offline: false, unpinned: true });
    assert.equal(CONFIRM_COPY.unpinnedTitle, "We couldn't pin this one down");
  });

  it("knows each maker's sets, and leaves the ones it can't place open", () => {
    assert.equal(backMakerOf(["RC-3", TOPPS_LEGAL]), "Topps");
    assert.equal(backMakerOf(["© 2024 Panini America, Inc."]), "Panini");
    assert.equal(backMakerOf(["TORONTO MAPLE LEAFS", "© 2024 The Upper Deck Company"]), "Upper Deck");
    assert.equal(backMakerOf(["no maker here"]), null);
    assert.equal(setMakerOf("Leaf", "2025-26"), "Leaf");
    assert.equal(setMakerOf("Panini Prizm", "2025-26"), "Panini");
    assert.equal(setMakerOf("Bowman Chrome", "2025"), "Topps");
    assert.equal(setMakerOf("Hoops", "2023-24"), "Panini");
    assert.equal(setMakerOf("Hoops", "2025-26"), null);
    assert.equal(setMakerOf("O-Pee-Chee", "2026-27", "Basketball"), null);
    assert.equal(setMakerOf("O-Pee-Chee", "2023-24", "Hockey"), "Upper Deck");
    assert.equal(setMakerOf("Fleer", "1986-87"), null);
  });
});

function sold(title: string, id: string): TrawlSoldResult {
  return {
    title,
    sale_price: 20,
    shipping_price: null,
    currency: "USD",
    condition: "Ungraded",
    condition_raw: null,
    date_sold: "2026-11-10T18:00:00.000Z",
    buying_format: "Auction",
    item_id: id,
    item_link: `https://www.ebay.com/itm/${id}`,
    image_url: `https://i.ebayimg.com/images/g/${id}/s-l500.jpg`,
    details: null,
  } as TrawlSoldResult;
}

describe("sold listings for the card we named", () => {
  it("the compare photo is only from a listing that names the same set and #, and never links out", async () => {
    const top = (await scan(BOOZER_FRONT, BOOZER_BACK)).matches[0];
    const leaf = sold("2025-26 Leaf Cameron Boozer #RC-3 Duke", "leaf");
    const noSet = sold("Cameron Boozer RC-3 rookie", "noset");
    assert.equal(listingPhotoFor(top, [leaf, noSet], SCAN_DIRECTORY), null);
    const photo = listingPhotoFor(top, [leaf, sold("2026-27 Topps Rookie Code Cameron Boozer #RC-3", "topps")], SCAN_DIRECTORY);
    assert.deepEqual(photo, { imageUrl: "https://i.ebayimg.com/images/g/topps/s-l500.jpg", soldAt: "2026-11-10T18:00:00.000Z" });
    // A card with its set or # open: we can't tell any listing is it.
    assert.equal(listingPhotoFor({ ...top, setBrand: "" }, [sold("2026-27 Topps Cameron Boozer #RC-3", "t2")], SCAN_DIRECTORY), null);
  });

  it("a sale of another maker's card never prices this one", async () => {
    const top = (await scan(BOOZER_FRONT, BOOZER_BACK)).matches[0];
    const { kept } = scanSalesFor(top, { grade: scanCompGrade(top), setBrand: top.setBrand, parallel: "" }, [sold("2026 Leaf Cameron Boozer RC-3", "leaf"), sold("2026-27 Topps Cameron Boozer RC-3 Rookie Code", "topps")], SCAN_DIRECTORY);
    assert.deepEqual(kept.map((sale) => sale.itemId), ["topps"]);
  });
});

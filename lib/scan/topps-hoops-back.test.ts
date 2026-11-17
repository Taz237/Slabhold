import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checklistFilesFor, loadChecklistsFor } from "@/lib/cards/checklist-load";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import { rankScanMatches, scanChecklistKey, type ScanMatch } from "./match";
import { scanReadFrom } from "./session";

/**
 * Plain Topps backs and Hoops backs. Both are modeled reads (no real back photo of these cards in
 * the repo yet), written the way a modern back prints: the card #, the name, the team and position,
 * the © line.
 *
 * A plain Topps back (basketball, football) names no product: only "© 2025 THE TOPPS COMPANY". The
 * set comes from the store's Topps checklists for the © year and the year before: exactly one Topps
 * product with this player at this card #, or the set stays open.
 *
 * A Hoops back's year: the © line, or "2024-25 NBA HOOPS" printed as one line. A season alone on a
 * line, or in the stat table, is never the card's year (a stat cell reads the same way). A year the
 * front or the label already printed is never replaced.
 */

const TOPPS_2025 = "© 2025 THE TOPPS COMPANY, INC. ALL RIGHTS RESERVED.";
const TOPPS_2026 = "© 2026 THE TOPPS COMPANY, INC. ALL RIGHTS RESERVED.";
const TOPPS_TM = "TOPPS IS A REGISTERED TRADEMARK OF THE TOPPS COMPANY, INC.";
const PANINI_2025 = "© 2025 Panini America, Inc.";

async function top(front: string[], back: string[], kind: "card" | "slab" = "card"): Promise<ScanMatch | undefined> {
  const read = scanReadFrom({ lines: front, backLines: back, image: null, kind }, SCAN_DIRECTORY);
  const key = scanChecklistKey(read, SCAN_DIRECTORY);
  const checklists = key ? await loadChecklistsFor(key) : [];
  return rankScanMatches(read, [], { directory: SCAN_DIRECTORY, products: null, soldTitles: [], checklists }).matches[0];
}

describe("a plain Topps back: the set from the Topps checklists", () => {
  it("loads every product Topps makes for the © year and the year before, in the card's sport", () => {
    const files = checklistFilesFor({ years: ["2025", "2024"], setBrand: "Topps", sport: "Basketball", family: "topps" });
    for (const file of ["2025-26-basketball-topps", "2025-26-basketball-topps-finest", "2024-25-basketball-topps-chrome", "2025-26-basketball-bowman", "2025-26-basketball-hoops"]) {
      assert.ok(files.includes(file), `${file}: ${files.join(", ")}`);
    }
    // Hoops was Panini's before 2025-26; no other maker and no other sport.
    assert.ok(!files.some((file) => /2024-25-basketball-hoops|prizm|donruss|football|baseball/.test(file)), files.join(", "));
  });

  it("only 2025-26 Hoops (a Topps product now) has him at that #: open, never Hoops or Topps from a plain back", async () => {
    const match = await top(["JOEL EMBIID", "PHILADELPHIA 76ERS"], ["9", "JOEL EMBIID", "76ERS - C", TOPPS_2025, TOPPS_TM]);
    assert.equal(match?.setBrand ?? "", "");
  });

  it("2025-26 Topps #1 Jayson Tatum: only flagship has him at #1, so Topps, 2025-26", async () => {
    const match = (await top(["JAYSON TATUM", "BOSTON CELTICS"], ["1", "JAYSON TATUM", "CELTICS - F", "HT: 6'8\" WT: 210", TOPPS_2025, TOPPS_TM]))!;
    assert.equal(match.playerName, "Jayson Tatum");
    assert.equal(match.setBrand, "Topps");
    assert.equal(match.yearLabel, "2025-26");
    assert.equal(match.cardNumber, "1");
  });

  it("2026 Topps football #264 Cam Ward: Topps, 2026", async () => {
    const match = (await top(["CAM WARD", "TENNESSEE TITANS", "QUARTERBACK"], ["264", "CAM WARD", "TITANS - QB", TOPPS_2026, TOPPS_TM]))!;
    assert.equal(match.setBrand, "Topps");
    assert.equal(match.yearLabel, "2026");
    assert.equal(match.cardNumber, "264");
  });

  it("a real Resurgence back that prints no product (James Cook #11, © 2026): 2025 Topps Resurgence", async () => {
    const back = ["11", "JAMES COOK", "BILLS - RB", "HT: 5'11\" WT: 190", "COLLEGE: GEORGIA", TOPPS_2026, "WWW.TOPPS.COM. CMP138988"];
    const match = (await top(["JAMES COOK", "BUFFALO BILLS"], back))!;
    assert.equal(match.setBrand, "Topps Resurgence");
    assert.equal(match.yearLabel, "2025");
    assert.equal(match.cardNumber, "11");
  });

  it("Cooper Flagg #201 is in flagship and in Finest: the set stays open", async () => {
    const match = await top(["COOPER FLAGG", "DALLAS MAVERICKS", "RC"], ["201", "COOPER FLAGG", "MAVERICKS - F", TOPPS_2025, TOPPS_TM]);
    assert.equal(match?.setBrand ?? "", "");
  });

  it("no Topps © line on the back: the set stays open", async () => {
    const match = await top(["JAYSON TATUM", "BOSTON CELTICS"], ["1", "JAYSON TATUM", "CELTICS - F", "HT: 6'8\" WT: 210"]);
    assert.equal(match?.setBrand ?? "", "");
  });

  it("a back that names Bowman in its legal lines: never a Topps product, open", async () => {
    const match = await top(["JAYSON TATUM", "BOSTON CELTICS"], ["1", "JAYSON TATUM", "CELTICS - F", TOPPS_2025, "BOWMAN IS A REGISTERED TRADEMARK OF THE TOPPS COMPANY, INC."]);
    assert.equal(match?.setBrand ?? "", "");
  });

  it("a # no Topps product has him at: open", async () => {
    const match = await top(["JAYSON TATUM", "BOSTON CELTICS"], ["199", "JAYSON TATUM", "CELTICS - F", TOPPS_2025, TOPPS_TM]);
    assert.equal(match?.setBrand ?? "", "");
  });

  it("baseball is left as it was: a plain Topps baseball back still leaves the set open", async () => {
    const match = await top(["AARON JUDGE", "NEW YORK YANKEES"], ["99", "AARON JUDGE", "YANKEES - OF", TOPPS_2025, TOPPS_TM]);
    assert.equal(match?.setBrand ?? "", "");
  });

  it("a set the card printed is kept: TOPPS CHROME on the front stays Topps Chrome", async () => {
    const match = await top(["TOPPS CHROME", "JAYSON TATUM", "BOSTON CELTICS"], ["1", "JAYSON TATUM", "CELTICS - F", TOPPS_2025, TOPPS_TM]);
    assert.equal(match?.setBrand, "Topps Chrome");
  });
});

describe("a Hoops back: the year from its season line", () => {
  it("2024-25 Hoops #231 Risacher, back prints \"2024-25 NBA HOOPS\" and no ©: 2024-25", async () => {
    const match = (await top(["ZACCHARIE RISACHER", "HAWKS", "RC"], ["No. 231", "ZACCHARIE RISACHER", "FORWARD", "2024-25 NBA HOOPS"]))!;
    assert.equal(match.setBrand, "Hoops");
    assert.equal(match.yearLabel, "2024-25");
    assert.equal(match.cardNumber, "231");
  });

  it("the © line alone (© 2025): 2025-26, and a season line that agrees changes nothing", async () => {
    for (const back of [["210", "MAXIME RAYNAUD", "CENTER", PANINI_2025], ["210", "MAXIME RAYNAUD", "CENTER", "2025-26", PANINI_2025]]) {
      const match = (await top(["HOOPS", "MAXIME RAYNAUD", "KINGS", "RC"], back))!;
      assert.equal(match.setBrand, "Hoops");
      assert.equal(match.yearLabel, "2025-26");
    }
  });

  it("a season line alone with no ©: a stat cell reads the same way, so it is not the year", async () => {
    const match = await top(["HOOPS", "MAXIME RAYNAUD", "KINGS", "RC"], ["210", "MAXIME RAYNAUD", "CENTER", "2025-26"]);
    assert.equal(match?.yearLabel ?? "", "");
  });

  it("a season alone the © disagrees with (2023-24 on a © 2025 back) is not the card's year", async () => {
    const match = await top(["HOOPS", "MAXIME RAYNAUD", "KINGS", "RC"], ["210", "MAXIME RAYNAUD", "CENTER", "2023-24", PANINI_2025]);
    assert.notEqual(match?.yearLabel, "2023-24");
  });

  it("the stat table's season is last season, never the card's year", async () => {
    const match = await top(["HOOPS", "DEVIN BOOKER", "SUNS"], ["1", "DEVIN BOOKER", "GUARD", "2024-25 SUNS 75 25.6 4.1 7.1", PANINI_2025]);
    assert.notEqual(match?.yearLabel, "2024-25");
  });

  it("a year the front printed is never replaced by the back's season line", async () => {
    const match = await top(["2024-25 HOOPS", "ZACCHARIE RISACHER", "HAWKS", "RC"], ["231", "ZACCHARIE RISACHER", "FORWARD", "2025-26", PANINI_2025]);
    assert.equal(match?.yearLabel, "2024-25");
  });

  it("a slab's label year is never replaced by the back's season line", async () => {
    const label = ["2024 HOOPS", "ZACCHARIE RISACHER #231", "PSA", "GEM MT 10", "12345678"];
    const match = await top(label, ["231", "ZACCHARIE RISACHER", "2025-26", PANINI_2025], "slab");
    assert.ok(match?.yearLabel === "2024-25" || match?.yearLabel === "2024", match?.yearLabel);
  });
});

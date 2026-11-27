import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadChecklistsFor } from "@/lib/cards/checklist-load";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import { rankScanMatches, scanChecklistKey, type ScanMatch } from "./match";
import { readRawCardText, readsAsNameLine } from "./raw-text";
import { scanReadFrom } from "./session";

/**
 * 2025-26 Topps x Bob Ross: The Joy of Basketball, base #66 VJ Edgecombe RC (scan miss 84). A
 * standalone Topps product: the card prints THE JOY OF BASKETBALL and a Bob Ross logo, no year and
 * no product line, and signs © 2026 The Topps Company. The OCR lines are the device's, as read.
 */

const SET = "Topps x Bob Ross";

const OCR_FRONT = ["Lopps", "BobRost:", "RC", "SAXERS", "77", "THEJOY OF", "BASKETBALL", "76ERS", "VJ EDGECOMBE"];
const OCR_BACK = [
  "VJ",
  "66",
  "EDGECOMBE",
  "G • PHILADELPHIA 76ERS",
  "THEJ OY OF",
  "On any given night, a",
  "BASKETBALL",
  "basketball court transforms",
  "into a canvas for the",
  "Dobken",
  "NBA's brightest stars.",
  "Players become artists in motion, blending",
  "skill, creativity, athleticism, and emotion from a",
  "palette of extraordinary talent. Every pass, drive,",
  "and shot adds another brushstroke, creating a",
  "masterpiece that is brought to life as the final",
  "buzzer sounds.",
  "censed products and intellectual property of the National Basketbalf",
  "TM. & ©. 2026 The Topps Company, inc. All rights roserved Officrally",
  "issociation, the National Basketbal Players Association, and others For",
  "ges/ledal-copyrigbls, an Bob foas nanie and images",
  "iplete- licessing information and legai. tanguage, visit [www.topps.cam](https://www.topps.cam)",
  "topps",
  "s of Bop H",
  "ore registeres",
  "Bot Rusa la",
];

const CLEAN_FRONT = ["TOPPS", "BOB ROSS", "RC", "SIXERS", "77", "THE JOY OF BASKETBALL", "76ERS", "VJ EDGECOMBE"];
const LEGAL = [
  "TM & © 2026 The Topps Company, Inc. All rights reserved. Officially licensed product of the National Basketball Association.",
  "The Bob Ross name and images are registered trademarks of Bob Ross Inc.",
  "WWW.TOPPS.COM",
];
const CLEAN_BACK = [
  "66",
  "VJ EDGECOMBE",
  "G • PHILADELPHIA 76ERS",
  "THE JOY OF BASKETBALL",
  "On any given night, a basketball court transforms into a canvas for the NBA's brightest stars.",
  ...LEGAL,
];
/** The same back with nothing naming the product: the number, the name, the team and the legal lines. */
const PLAIN_BACK = ["66", "VJ EDGECOMBE", "G • PHILADELPHIA 76ERS", ...LEGAL];

async function top(front: string[], back: string[] | null): Promise<ScanMatch | undefined> {
  const read = scanReadFrom({ lines: front, backLines: back, image: null, kind: "card" }, SCAN_DIRECTORY);
  const key = scanChecklistKey(read, SCAN_DIRECTORY);
  const checklists = key ? await loadChecklistsFor(key) : [];
  return rankScanMatches(read, [], { directory: SCAN_DIRECTORY, products: null, soldTitles: [], checklists }).matches[0];
}

function isTheBaseCard(match: ScanMatch | undefined, label: string) {
  assert.ok(match, label);
  assert.equal(match.playerName, "VJ Edgecombe", label);
  assert.equal(match.yearLabel, "2025-26", label);
  assert.equal(match.setBrand, SET, label);
  assert.equal(match.cardNumber, "66", label);
  assert.equal(match.isRookie, true, label);
  assert.equal(match.sport, "Basketball", label);
  // Open beats wrong: no version, no color, no Base picked for it.
  assert.equal(match.parallel, "", label);
  assert.ok(!match.subset, label);
}

describe("Topps x Bob Ross: The Joy of Basketball #66 VJ Edgecombe", () => {
  it("the device's own OCR lines: 2025-26 Topps x Bob Ross #66, rookie, version open", async () => {
    isTheBaseCard(await top(OCR_FRONT, OCR_BACK), "ocr");
  });

  it("a clean read of the same card: the same result", async () => {
    isTheBaseCard(await top(CLEAN_FRONT, CLEAN_BACK), "clean");
  });

  it("the season is the product's, never 2026-27 from the © line", async () => {
    for (const [front, back] of [[OCR_FRONT, OCR_BACK], [CLEAN_FRONT, CLEAN_BACK], [CLEAN_FRONT, PLAIN_BACK]]) {
      assert.equal((await top(front, back))?.yearLabel, "2025-26");
    }
  });

  it("the jersey 77 on the front is never the card # when the back says 66", async () => {
    for (const [front, back] of [[OCR_FRONT, OCR_BACK], [CLEAN_FRONT, CLEAN_BACK], [["77", "VJ EDGECOMBE", "76ERS", "RC"], PLAIN_BACK]]) {
      const match = await top(front, back);
      assert.equal(match?.cardNumber, "66");
      assert.notEqual(match?.cardNumber, "77");
    }
  });

  it("a back of 66 is the base card: never SP-66 (Beauty is Everywhere) or BT-5 (Budding Talent)", async () => {
    for (const [front, back] of [[OCR_FRONT, OCR_BACK], [CLEAN_FRONT, CLEAN_BACK], [CLEAN_FRONT, PLAIN_BACK]]) {
      const match = await top(front, back);
      assert.equal(match?.cardNumber, "66");
      assert.doesNotMatch(JSON.stringify([match?.cardNumber, match?.subset ?? ""]), /SP-66|BT-5|Beauty|Budding/i);
    }
  });

  it("a plain back (only the Topps © line) still finds it: the one Topps checklist with him at #66", async () => {
    isTheBaseCard(await top(["VJ EDGECOMBE", "76ERS", "RC"], PLAIN_BACK), "plain back");
  });

  it("the front alone names the set and leaves the card # open: 77 is his jersey", async () => {
    const match = await top(OCR_FRONT, null);
    assert.equal(match?.playerName, "VJ Edgecombe");
    assert.equal(match?.setBrand, SET);
    assert.equal(match?.cardNumber ?? "", "");
  });
});

describe("the card has to print the product", () => {
  const sets = (lines: string[], side: "front" | "back") => readRawCardText(lines, SCAN_DIRECTORY, { side }).setNames;

  it("THE JOY OF BASKETBALL names it: whole, glued, split over lines, or with a bio line in between", () => {
    for (const lines of [
      ["THE JOY OF BASKETBALL"],
      ["THE JOY OF", "BASKETBALL"],
      ["THEJOY OF", "BASKETBALL"],
      ["THEJ OY OF", "On any given night, a", "BASKETBALL"],
      ["THEJOYOFBASKETBALL"],
    ]) {
      assert.deepEqual(sets([...lines, "VJ EDGECOMBE"], "back"), [SET], lines.join(" / "));
      assert.deepEqual(sets([...lines, "VJ EDGECOMBE"], "front"), [SET], lines.join(" / "));
    }
  });

  it("a Bob Ross logo names it, clean or the way the device read it", () => {
    for (const logo of ["BOB ROSS", "Bob Ross", "BobRoss", "BobRost:", "BOB ROSS®"]) {
      assert.deepEqual(sets([logo, "RC", "VJ EDGECOMBE", "76ERS"], "front"), [SET], logo);
    }
  });

  it("legal text alone never names it: the Bob Ross trademark line, or the device's scraps of it", () => {
    assert.deepEqual(sets(PLAIN_BACK, "back"), []);
    assert.deepEqual(sets(OCR_BACK.slice(17), "back"), []);
    assert.deepEqual(sets(["VJ EDGECOMBE", "The Bob Ross name and images are trademarks of Bob Ross Inc.", "© 2026 THE TOPPS COMPANY"], "back"), []);
  });

  it("a first name, a sentence or the sport alone never names it", () => {
    for (const lines of [
      ["TOPPS", "BOB GIBSON", "ST. LOUIS CARDINALS"],
      ["TOPPS", "BOBBY ROSS", "COACH"],
      ["BASKETBALL", "VJ EDGECOMBE"],
      ["TOPPS", "He found the joy of basketball again in his second season with the team."],
      ["THE JOY OF", "VJ EDGECOMBE", "PHILADELPHIA 76ERS", "GUARD", "BASKETBALL"],
    ]) {
      assert.ok(!sets(lines, "front").includes(SET), lines.join(" / "));
      assert.ok(!sets(lines, "back").includes(SET), lines.join(" / "));
    }
  });
});

describe("Bob and Ross are still names", () => {
  it("a Bob or a Ross reads as a name line, and names no set", () => {
    for (const name of ["BOB ALLISON", "BOB COUSY", "ROSS CHASTAIN"]) {
      assert.equal(readsAsNameLine(name, SCAN_DIRECTORY), true, name);
      assert.deepEqual(readRawCardText(["TOPPS", name], SCAN_DIRECTORY, { side: "front" }).setNames, ["Topps"], name);
    }
  });
});

describe("the other plain Topps backs are as they were", () => {
  const TOPPS_2025 = "© 2025 THE TOPPS COMPANY, INC. ALL RIGHTS RESERVED.";
  const TOPPS_TM = "TOPPS IS A REGISTERED TRADEMARK OF THE TOPPS COMPANY, INC.";

  it("a unique flagship hit still names Topps", async () => {
    const match = await top(["JAYSON TATUM", "BOSTON CELTICS"], ["1", "JAYSON TATUM", "CELTICS - F", "HT: 6'8\" WT: 210", TOPPS_2025, TOPPS_TM]);
    assert.equal(match?.setBrand, "Topps");
    assert.equal(match?.yearLabel, "2025-26");
    assert.equal(match?.cardNumber, "1");
  });

  it("a # two products share still stays open", async () => {
    const match = await top(["COOPER FLAGG", "DALLAS MAVERICKS", "RC"], ["201", "COOPER FLAGG", "MAVERICKS - F", TOPPS_2025, TOPPS_TM]);
    assert.equal(match?.setBrand ?? "", "");
  });

  it("VJ Edgecombe's flagship rookie (#203) is not pulled into this set", async () => {
    const match = await top(["VJ EDGECOMBE", "PHILADELPHIA 76ERS", "RC"], ["203", "VJ EDGECOMBE", "76ERS - G", TOPPS_2025, TOPPS_TM]);
    assert.notEqual(match?.setBrand, SET);
  });
});

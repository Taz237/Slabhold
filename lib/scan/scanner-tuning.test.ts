import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadChecklistsFor } from "@/lib/cards/checklist-load";
import { SCAN_DIRECTORY } from "@/lib/players/scan-directory";
import { rankScanMatches, scanChecklistKey } from "./match";
import { readRawCardText } from "./raw-text";
import { scanReadFrom } from "./session";

/** Made-up captures in the real shapes. Open beats wrong: each rule has its trap. */

const front = (lines: string[]) => readRawCardText(lines, SCAN_DIRECTORY, { side: "front" });

async function scan(frontLines: string[], backLines: string[] | null) {
  const read = scanReadFrom({ lines: frontLines, backLines, image: null, kind: "card" }, SCAN_DIRECTORY);
  const key = scanChecklistKey(read, SCAN_DIRECTORY);
  const checklists = key ? await loadChecklistsFor(key) : [];
  return { key, top: rankScanMatches(read, [], { directory: SCAN_DIRECTORY, products: null, soldTitles: [], checklists }).matches[0] };
}

describe("a print run alone on its line", () => {
  it("reads '/175' as the run when foil hid the stamped number", () => {
    assert.deepEqual(front(["ALIJAH ARENAS", "USC", "/175"]).serial, { number: "", run: "175" });
    assert.deepEqual(front(["PEJA STOJAKOVIC", "KINGS", "/ 25"]).serial, { number: "", run: "25" });
  });

  it("a full serial still wins, and a slash inside other text is not a run", () => {
    assert.deepEqual(front(["LABARON PHILON", "/175", "162/175"]).serial, { number: "162", run: "175" });
    assert.equal(front(["DRAKE MAYE", "HT 6/4 WT 230"]).serial, null);
    assert.equal(front(["DRAKE MAYE", "RC /149 PATRIOTS"]).serial, null);
    assert.equal(front(["DRAKE MAYE", "/"]).serial, null);
  });
});

describe("a BP- prospect code with the logo missed", () => {
  it("is Bowman, and the year its checklist has the player at that code", async () => {
    const { key, top } = await scan(["AIDAN MILLER", "PHILLIES"], ["BP-27", "AIDAN MILLER", "SS", "TOPPS.COM"]);
    assert.equal(key?.setBrand, "Bowman");
    assert.equal(top?.playerName, "Aidan Miller");
    assert.equal(top?.setBrand, "Bowman");
    assert.equal(top?.yearLabel, "2024");
    assert.equal(top?.cardNumber, "BP-27");
  });

  it("stays open when no Bowman checklist puts the player read at that code", async () => {
    const { top } = await scan(["AIDAN MILLER", "PHILLIES"], ["BP-99", "AIDAN MILLER", "SS", "TOPPS.COM"]);
    assert.equal(top?.setBrand ?? "", "");
    assert.equal(top?.yearLabel ?? "", "");
  });

  it("a printed year that disagrees with the checklist leaves the set open", async () => {
    const { top } = await scan(["AIDAN MILLER", "PHILLIES"], ["BP-27", "AIDAN MILLER", "SS", "© 2023 THE TOPPS COMPANY"]);
    assert.notEqual(top?.setBrand, "Bowman");
  });

  it("a chrome prospect code (BCP-) is not read this way", async () => {
    const { key } = await scan(["AIDAN MILLER", "PHILLIES"], ["BCP-27", "AIDAN MILLER", "SS", "TOPPS.COM"]);
    assert.notEqual(key?.setBrand, "Bowman");
  });
});

describe("the 2024-2026 checklists added to the store", () => {
  it("loads each new set by year and set, with a real player at a known number", async () => {
    const cases: [sport: string, year: string, set: string, number: string, player: string][] = [
      ["Baseball", "2024", "Topps", "1", "Ronald Acuña Jr."],
      ["Football", "2024", "Donruss Optic", "1", ""],
      ["Basketball", "2024-25", "Topps Chrome", "1", ""],
    ];
    for (const [sport, year, setBrand, number, player] of cases) {
      const lists = await loadChecklistsFor({ years: [year], setBrand, sport });
      assert.ok(lists.length > 0, `${year} ${setBrand}`);
      const cards = lists.flatMap((list) => list.sections.flatMap((section) => section.cards));
      assert.ok(cards.length > 500, `${year} ${setBrand}: ${cards.length} cards`);
      if (player) assert.ok(cards.some(([at, name]) => at === number && name === player), `${year} ${setBrand} #${number}`);
    }
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { insiderCsv, parseInsiderPage, parseParallelLine } from "./checklist-insider";

/** A made-up page in the layout Checklist Insider uses. */
const PAGE = `
<h2>2025 Fixture Chrome Football Checklist</h2>
<p>SUBJECT TO CHANGE.</p>
<h3>Base Checklist</h3><p>2 cards.</p><p>Parallels:</p>
<ul><li>Refractor (1:4 Hobby)</li><li>X-Fractor (1:2 Mega)</li><li>Purple Lva Refractor /75 (1:464 Hobby)</li>
<li>Gold Refractor /50 (1:696 Hobby)</li><li>FrozenFractor /-5 (1:6,987 Hobby)</li><li>SuperFractor 1/1 (1:34,585 Hobby)</li></ul>
<p>1 Fixture Player - Arizona Cardinals<br>2 Second Fixture - Buffalo Bills</p>
<h3>Base Rookies Checklist</h3><p>1 card.</p><p><strong>Parallels</strong> :</p><ul><li>Gold Refractor /50 (1:2,000 Hobby)</li></ul>
<p>306 Rookie Fixture - New York Giants RC (eBay)</p>
<h3>Rookies Autographs Checklist</h3><p>Parallels:</p><ul><li>Refractor /499 (odds)</li></ul>
<p>RA-RF Rookie Fixture - New York Giants</p>
<h2>2025 Fixture Chrome Football Team Set Checklist</h2>
<p>101 Not A Card - Should Not Read</p>
`;

describe("a Checklist Insider page", () => {
  it("reads each section's cards and parallels, and stops at the team lists", () => {
    const page = parseInsiderPage(PAGE, "2025 Fixture Chrome Football");
    assert.deepEqual(
      page.cards.map((card) => [card.set, card.number, card.player, card.team, card.rookie]),
      [
        ["Base", "1", "Fixture Player", "Arizona Cardinals", false],
        ["Base", "2", "Second Fixture", "Buffalo Bills", false],
        ["Base Rookies", "306", "Rookie Fixture", "New York Giants", true],
        ["Rookies Autographs", "RA-RF", "Rookie Fixture", "New York Giants", false],
      ],
    );
    assert.deepEqual(
      page.parallels.filter((row) => row.subset === "Base").map((row) => [row.name, row.serialRun]),
      [
        ["Refractor", null],
        ["X-Fractor", null],
        ["Purple Lava Refractor", 75],
        ["Gold Refractor", 50],
        ["FrozenFractor", null],
        ["SuperFractor", 1],
      ],
    );
    assert.equal(page.parallels.find((row) => row.name === "FrozenFractor")?.unsure, true);
    assert.deepEqual(page.parallels.filter((row) => row.subset === "Base Rookies").map((row) => row.serialRun), [50]);
  });

  it("reads a parallel line, and nothing that isn't one", () => {
    assert.deepEqual(parseParallelLine("Teal Refractor /299 (1:117 Hobby; 1:41 Jumbo)"), { name: "Teal Refractor", serialRun: 299 });
    assert.deepEqual(parseParallelLine("Red Lava Refractor /5 ( 1:6,987 Hobby)"), { name: "Red Lava Refractor", serialRun: 5 });
    assert.deepEqual(parseParallelLine("Prism Refractor (1:9 Hobby)"), { name: "Prism Refractor", serialRun: null });
    assert.equal(parseParallelLine("Pack odds - 1:5,247 Mega"), null);
    assert.equal(parseParallelLine("38 cards. Buy on eBay."), null);
  });

  it("writes the checklist CSV the earlier imports used", () => {
    const csv = insiderCsv(parseInsiderPage(PAGE, "2025 Fixture Chrome Football").cards.slice(2, 3));
    assert.equal(csv, "CARD SET,CARD NUMBER,ATHLETE,TEAM,RC\nBase Rookies,306,Rookie Fixture,New York Giants,RC\n");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checklistProductFrom, csvCells, parseChecklistLine, sectionsFromChecklistPage, sectionsFromMakerCsv } from "./checklist-import";
import { CHECKLIST_INDEX, checklistFilesFor, loadChecklistsFor } from "./checklist-load";
import { checklistFileName, checklistNumberKey, playersAt, type ChecklistProduct } from "./checklists";

const PAGE = `
<h3 class="hot-title">Base Set Checklist</h3><div class="checklistdesc">300 cards.</div>
<p><div class="ezcol ezcol-one-half  tablechecklist" style="">338 Sean Clifford - Green Bay Packers<br />
339 C.J. Stroud - Houston Texans RC<br />
340 Dylan Horton &#8211; Houston Texans<br />
341 De&#8217;Von Achane - Miami Dolphins #/99 *</div><div class="ezcol-divider"></div></p>
<h3 class="hot-title">Dual Autographs Set Checklist</h3>
<p><div class="ezcol tablechecklist">DA-1 Bryce Young/C.J. Stroud - Panthers/Texans<br />
PARALLEL CARDS: Gold #/10<br />
DA-2 Will Levis - Tennessee Titans</div></p>`;

describe("the checklist import", () => {
  it("reads a line as number, player and team, without the notes after them", () => {
    assert.deepEqual(parseChecklistLine("339 C.J. Stroud - Houston Texans RC"), { number: "339", player: "C.J. Stroud", team: "Houston Texans" });
    assert.deepEqual(parseChecklistLine("BCP-52 Jesús Made - Milwaukee Brewers (1st)"), { number: "BCP-52", player: "Jesús Made", team: "Milwaukee Brewers" });
    assert.deepEqual(parseChecklistLine("RA-CS C.J. Stroud - Houston Texans #/99 *"), { number: "RA-CS", player: "C.J. Stroud", team: "Houston Texans" });
    assert.deepEqual(parseChecklistLine("12 Shohei Ohtani"), { number: "12", player: "Shohei Ohtani", team: "" });
  });

  it("leaves out anything that isn't one card with one player: nothing is guessed", () => {
    assert.equal(parseChecklistLine("DA-1 Bryce Young/C.J. Stroud - Panthers/Texans"), null);
    assert.equal(parseChecklistLine("PARALLEL CARDS: Gold #/10"), null);
    assert.equal(parseChecklistLine("300 cards."), null);
    assert.equal(parseChecklistLine("All cards not in each parallel."), null);
  });

  it("a team card, a leaders card and an empty slot are nobody", () => {
    assert.equal(parseChecklistLine("382 Minnesota Twins - Team Card"), null);
    assert.equal(parseChecklistLine("US250 *No Card"), null);
    assert.equal(parseChecklistLine("201 AL Home Run Leaders - League Leaders"), null);
    assert.equal(parseChecklistLine("96 Cincinnati Reds TC"), null);
    assert.equal(parseChecklistLine("113 Star Power - Los Angeles Dodgers CC"), null);
    assert.equal(parseChecklistLine("145 NL Nails - National League"), null);
    assert.equal(parseChecklistLine("14 The Yankees Win! - New York Yankees"), null);
    assert.equal(parseChecklistLine("US142 Does Not Exist"), null);
    // A ballpark is nobody; a player whose name is also a place is kept when our list knows him.
    assert.equal(parseChecklistLine("682 Petco Park - San Diego Padres"), null);
    assert.equal(parseChecklistLine("61 Chan Ho Park - Los Angeles Dodgers", (name) => name === "Chan Ho Park")?.player, "Chan Ho Park");
    // A missing dash runs the team into the name: left out, not guessed.
    assert.equal(parseChecklistLine("158 Zion Williamson New Orleans Pelicans"), null);
    assert.deepEqual(parseChecklistLine("468 Wade Boggs- Boston Red Sox"), { number: "468", player: "Wade Boggs", team: "Boston Red Sox" });
    const product = checklistProductFrom({ sport: "Baseball", yearLabel: "2023", product: "Topps", source: "test", read: "2026-11-14" }, [
      { name: "Base", cards: [{ number: "1", player: "Byron Buxton", team: "Minnesota Twins" }, { number: "382", player: "Minnesota Twins", team: "" }] },
    ]);
    assert.deepEqual(product.sections[0].cards.map((card) => card[1]), ["Byron Buxton"]);
  });

  it("reads a checklist page: one section per heading, entities decoded", () => {
    const sections = sectionsFromChecklistPage(PAGE);
    assert.deepEqual(sections.map((section) => [section.name, section.cards.length]), [["Base", 4], ["Dual Autographs", 1]]);
    assert.deepEqual(sections[0].cards[3], { number: "341", player: "De'Von Achane", team: "Miami Dolphins" });
    assert.deepEqual(sections[0].cards[2], { number: "340", player: "Dylan Horton", team: "Houston Texans" });
  });

  it("reads the maker's CSV: a card once, however many parallels repeat it", () => {
    const csv = [
      '"SPORT","YEAR","BRAND","PROGRAM","CARD SET","ATHLETE","TEAM","POSITION","CARD NUMBER","SEQUENCE"',
      '"Basketball","2025","Panini","Prizm","Base","LaBaron Philon","Alabama Crimson Tide","G","103",""',
      '"Basketball","2025","Panini","Prizm","Base Prizms Orange Pulsar","LaBaron Philon","Alabama Crimson Tide","G","103","175"',
      '"Basketball","2025","Panini","Prizm","Base","Smith, John","Somewhere","G","104",""',
      '"Basketball","2025","Panini","Prizm","Sensational Signatures","LaBaron Philon","Alabama Crimson Tide","G","SS-LP","99"',
    ].join("\r\n");
    const sections = sectionsFromMakerCsv(csv);
    assert.deepEqual(sections.map((section) => [section.name, section.cards.map((card) => card.number)]), [["Base", ["103"]], ["Sensational Signatures", ["SS-LP"]]]);
    assert.deepEqual(csvCells('"a, b","c ""d"" e",f'), ["a, b", 'c "d" e', "f"]);
  });
});

const PRIZM: ChecklistProduct = checklistProductFrom(
  { sport: "Football", yearLabel: "2023", product: "Panini Prizm", source: "test", read: "2026-11-14" },
  [
    { name: "Base", cards: [{ number: "339", player: "C.J. Stroud", team: "Houston Texans" }, { number: "1", player: "Kyler Murray", team: "Arizona Cardinals" }] },
    { name: "Fireworks", cards: [{ number: "1", player: "Jalen Hurts", team: "Philadelphia Eagles" }] },
  ],
);

describe("the checklist store", () => {
  it("finds who is on a card number, for the same year and set, however the number is written", () => {
    assert.equal(checklistNumberKey("#BCP-52"), checklistNumberKey("bcp 52"));
    assert.deepEqual(playersAt([PRIZM], { yearLabel: "2023", setBrand: "Prizm", cardNumber: "#339" }).map((hit) => [hit.player, hit.team, hit.section]), [["C.J. Stroud", "Houston Texans", "Base"]]);
  });

  it("returns every section's player at a number two sections share, and nobody for another year, set or sport", () => {
    assert.deepEqual(playersAt([PRIZM], { yearLabel: "2023", setBrand: "Panini Prizm", cardNumber: "1" }).map((hit) => hit.player), ["Kyler Murray", "Jalen Hurts"]);
    assert.deepEqual(playersAt([PRIZM], { yearLabel: "2024", setBrand: "Panini Prizm", cardNumber: "339" }), []);
    assert.deepEqual(playersAt([PRIZM], { yearLabel: "2023", setBrand: "Panini Select", cardNumber: "339" }), []);
    assert.deepEqual(playersAt([PRIZM], { yearLabel: "2023", setBrand: "Panini Prizm", cardNumber: "339", sport: "Basketball" }), []);
  });

  it("every file in the index loads, holds the cards the index counts, and logs where it came from", async () => {
    assert.ok(CHECKLIST_INDEX.length > 0);
    for (const entry of CHECKLIST_INDEX) {
      assert.equal(entry.file, checklistFileName(entry), entry.file);
      assert.ok(entry.source.trim(), `${entry.file}: no source`);
      assert.match(entry.read, /^\d{4}-\d{2}-\d{2}$/, entry.file);
      const [product] = (await loadChecklistsFor({ years: [entry.yearLabel], setBrand: entry.product, sport: entry.sport })).filter((item) => item.product === entry.product && item.yearLabel === entry.yearLabel);
      assert.ok(product, `${entry.file} did not load`);
      assert.equal(product.sections.reduce((sum, section) => sum + section.cards.length, 0), entry.cards, entry.file);
      for (const section of product.sections) for (const [number, player] of section.cards) assert.ok(number && player && !/[/&]/.test(player), `${entry.file}: ${number} ${player}`);
    }
  });

  it("picks only the files for the year and set a scan read", () => {
    const entries = [
      { file: "a", sport: "Football", yearLabel: "2023", product: "Panini Prizm", source: "s", read: "2026-11-14", cards: 1 },
      { file: "b", sport: "Basketball", yearLabel: "2023-24", product: "Panini Prizm", source: "s", read: "2026-11-14", cards: 1 },
      { file: "c", sport: "Football", yearLabel: "2024", product: "Panini Prizm", source: "s", read: "2026-11-14", cards: 1 },
      { file: "d", sport: "Football", yearLabel: "2023", product: "Panini Select", source: "s", read: "2026-11-14", cards: 1 },
    ];
    assert.deepEqual(checklistFilesFor({ years: ["2023"], setBrand: "Prizm" }, entries), ["a", "b"]);
    assert.deepEqual(checklistFilesFor({ years: ["2023"], setBrand: "Prizm", sport: "Basketball" }, entries), ["b"]);
    assert.deepEqual(checklistFilesFor({ years: ["2024", "2023"], setBrand: "Panini Select" }, entries), ["d"]);
  });
});

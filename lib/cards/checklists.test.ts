import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checklistProductFrom, csvCells, parseChecklistLine, sectionsFromChecklistPage, sectionsFromMakerCsv } from "./checklist-import";
import { CHECKLIST_INDEX, checklistFilesFor, loadChecklistsFor } from "./checklist-load";
import { baseSetHits, checklistFileName, checklistNumberKey, isBaseSection, playersAt, sectionNamedOnCard, type ChecklistProduct } from "./checklists";

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

  it("a real one-word name loads when the line names its team: Ludacris, Ichiro, MIYAVI", () => {
    assert.deepEqual(parseChecklistLine("136 Ludacris - Music"), { number: "136", player: "Ludacris", team: "Music" });
    assert.deepEqual(parseChecklistLine("CLA-I Ichiro - Seattle Mariners"), { number: "CLA-I", player: "Ichiro", team: "Seattle Mariners" });
    assert.deepEqual(parseChecklistLine("FPA-MIY MIYAVI - Los Angeles Dodgers"), { number: "FPA-MIY", player: "MIYAVI", team: "Los Angeles Dodgers" });
    assert.deepEqual(parseChecklistLine("FP-7 Neymar - LoanDepot Park"), { number: "FP-7", player: "Neymar", team: "LoanDepot Park" });
    // The maker's CSV hands the line over the same way.
    const csv = ["CARD SET,CARD NUMBER,ATHLETE,TEAM", "Base,122,Ludacris,Music", "Base,123,Kevin Durant,Phoenix Suns"].join("\n");
    assert.deepEqual(sectionsFromMakerCsv(csv)[0].cards.map((card) => card.player), ["Ludacris", "Kevin Durant"]);
  });

  it("a one-word line that isn't a person stays out: headers, set names, checklists, team names", () => {
    // No team on the line: a heading or a stray word, never a card.
    assert.equal(parseChecklistLine("136 Ludacris"), null);
    assert.equal(parseChecklistLine("2025 Checklist"), null);
    assert.equal(parseChecklistLine("300 Cards"), null);
    assert.equal(parseChecklistLine("100 Base - Set"), null);
    assert.equal(parseChecklistLine("2023 Prizm - Panini"), null);
    assert.equal(parseChecklistLine("1 Topps - Baseball"), null);
    assert.equal(parseChecklistLine("1 Checklist - Base"), null);
    assert.equal(parseChecklistLine("50 Parallels - Gold"), null);
    assert.equal(parseChecklistLine("10 Rookies - Insert"), null);
    assert.equal(parseChecklistLine("5 Autographs - Hobby"), null);
    // A team named by its nickname is a team card.
    assert.equal(parseChecklistLine("279 Angels - Los Angeles Angels"), null);
    assert.equal(parseChecklistLine("279 Angels - Team Card"), null);
    assert.equal(parseChecklistLine("M-3 Mascot - Baltimore Orioles"), null);
    // Not a word: lower case, initials, a number, too short.
    assert.equal(parseChecklistLine("12 cards - Music"), null);
    assert.equal(parseChecklistLine("12 J.R. - Music"), null);
    assert.equal(parseChecklistLine("12 Al - Music"), null);
    // A team's nickname in the singular is the team ("Tiger" on a Tigers sticker).
    assert.equal(parseChecklistLine("75Z-1 Tiger - Detroit Tigers"), null);
    assert.equal(parseChecklistLine("75Z-2 Cardinal - St. Louis Cardinals"), null);
    // An apostrophe or hyphen in one word is a cut-off name ("D'Angelo" for D'Angelo Russell).
    assert.equal(parseChecklistLine("F-22 D'Angelo - Utah Jazz"), null);
    // Accented letters are letters.
    assert.equal(parseChecklistLine("HS-NE Nenê - Denver Nuggets")?.player, "Nenê");
  });

  it("a one-word name that is the start or end of another player's name in the same set is cut off: left out", () => {
    const product = checklistProductFrom({ sport: "Basketball", yearLabel: "2023-24", product: "Topps Chrome", source: "test", read: "2026-11-17" }, [
      { name: "Base", cards: [{ number: "58", player: "Kawhi Leonard", team: "Los Angeles Clippers" }, { number: "59", player: "Ichiro", team: "Seattle Mariners" }] },
      { name: "Finesse", cards: [{ number: "F-22", player: "Kawhi", team: "Los Angeles Clippers" }, { number: "F-23", player: "Leonard", team: "Los Angeles Clippers" }] },
    ]);
    assert.deepEqual(product.sections.map((section) => section.cards.map((card) => card[1])), [["Kawhi Leonard", "Ichiro"]]);
  });

  it("a one-word name on a variation of someone else's base card is a photo variation (a mascot): left out", () => {
    const product = checklistProductFrom({ sport: "Baseball", yearLabel: "2022", product: "Topps Update", source: "test", read: "2026-11-17" }, [
      { name: "Base", cards: [{ number: "150", player: "Josiah Gray", team: "Washington Nationals" }, { number: "121", player: "Ichiro", team: "Seattle Mariners" }] },
      { name: "Base Variations", cards: [{ number: "150", player: "Screech", team: "Washington Nationals" }, { number: "121", player: "Ichiro", team: "Seattle Mariners" }] },
    ]);
    assert.deepEqual(product.sections.map((section) => section.cards.map((card) => card[1])), [["Josiah Gray", "Ichiro"], ["Ichiro"]]);
  });

  it("on a plain-text checklist page a one-word name loads only for a known one-word athlete: the pages are noisy", () => {
    const page = [
      '<h3 class="hot-title">Base Set Checklist</h3><div class="tablechecklist">1 Ichiro - Seattle Mariners<br />2 Nene - Denver Nuggets<br />3 Mike Trout - Los Angeles Angels</div>',
      '<h3 class="hot-title">Baseball Thrills Checklist</h3><div class="tablechecklist">461 Thrills - Babe Ruth Hits 60th Homer<br />462 Ganymede - Jupiter<br />463 Screech - Washington Nationals</div>',
    ].join("\n");
    assert.deepEqual(sectionsFromChecklistPage(page).map((section) => [section.name, section.cards.map((card) => card.player)]), [["Base", ["Ichiro", "Nene", "Mike Trout"]]]);
  });

  it("a short all-caps word is a placeholder, not a name: TBA, TBD, ACE", () => {
    assert.equal(parseChecklistLine("ASST-OTO TBA - Los Angeles Angels"), null);
    assert.equal(parseChecklistLine("M-28 ACE - Toronto Blue Jays"), null);
    assert.equal(parseChecklistLine("FPA-MIY MIYAVI - Los Angeles Dodgers")?.player, "MIYAVI");
  });

  it("a one-word mascot or cartoon card is no player: its section is left out", () => {
    const csv = [
      "CARD SET,CARD NUMBER,ATHLETE,TEAM",
      "Mascots,M-10,Paws,Detroit Tigers",
      "Mascots Autographs,BCM-GT,Buzz,Georgia Tech",
      "Mickey & Friends Away Jersey,MLBA-21,Goofy,Atlanta Braves",
      "Mickey and Friends Sapphire,MLBA-22,Goofy,New York Mets",
      "1975 Topps Zoo's Who Stick-Ons,75Z-9,Gator,New York Yankees",
      "Stars of Japan,SOJ-7,Ichiro,Seattle Mariners",
    ].join("\n");
    assert.deepEqual(sectionsFromMakerCsv(csv).map((section) => [section.name, section.cards.map((card) => card.player)]), [["Stars of Japan", ["Ichiro"]]]);
    const page = [
      '<h3 class="hot-title">Mascots Checklist</h3><div class="tablechecklist">M-10 Paws - Detroit Tigers</div>',
      '<h3 class="hot-title">Base Set Checklist</h3><div class="tablechecklist">1 Ichiro - Seattle Mariners<br />2 Mike Trout - Los Angeles Angels</div>',
    ].join("\n");
    assert.deepEqual(sectionsFromChecklistPage(page).map((section) => [section.name, section.cards.map((card) => card.player)]), [["Base", ["Ichiro", "Mike Trout"]]]);
  });

  it("reads a checklist page: one section per heading, entities decoded", () => {
    const sections = sectionsFromChecklistPage(PAGE);
    assert.deepEqual(sections.map((section) => [section.name, section.cards.length]), [["Base", 4], ["Dual Autographs", 1]]);
    assert.deepEqual(sections[0].cards[3], { number: "341", player: "De'Von Achane", team: "Miami Dolphins" });
    assert.deepEqual(sections[0].cards[2], { number: "340", player: "Dylan Horton", team: "Houston Texans" });
  });

  it("a tier letter after a name is no part of it: 'Alex Rodriguez A' is Alex Rodriguez", () => {
    assert.deepEqual(parseChecklistLine("TA1 Alex Rodriguez A - New York Yankees"), { number: "TA1", player: "Alex Rodriguez", team: "New York Yankees" });
    assert.deepEqual(parseChecklistLine("GJ-AO Alexander Ovechkin C"), { number: "GJ-AO", player: "Alexander Ovechkin", team: "" });
    assert.equal(parseChecklistLine("1 Ken Griffey Jr. - Seattle Mariners")?.player, "Ken Griffey Jr.");
    assert.equal(parseChecklistLine("323 Will Fuller V - Houston Texans")?.player, "Will Fuller V");
  });

  it("a letter relic or letter patch section is left out: each card is one letter of a nameplate (KY5)", () => {
    const page = [
      '<h3 class="hot-title">Base Set Checklist</h3><div class="tablechecklist">1 Kevin Youkilis - Boston Red Sox</div>',
      '<h3 class="hot-title">In the Name Letter Relics Checklist</h3><div class="tablechecklist">KY5 Kevin Youkilis I - Boston Red Sox</div>',
      '<h3 class="hot-title">Legendary Letters Commemorative Patch Checklist</h3><div class="tablechecklist">LL1 Babe Ruth B</div>',
    ].join("\n");
    assert.deepEqual(sectionsFromChecklistPage(page).map((section) => section.name), ["Base"]);
  });

  it("reads an older page with no section headings: its checklist blocks are the base set", () => {
    // The layout of Cardboard Connection's vintage pages (1960 Topps): one "Set Checklist" heading, two columns.
    const page = [
      "<h2>1960 Topps Baseball Set Checklist</h2>",
      '<div class="ezcol ezcol-one-half  tablechecklist">1 Early Wynn - Chicago White Sox<br />',
      "7 Master &amp; Mentor - Mays / Rigney<br />",
      "10 Ernie Banks - Chicago Cubs</div>",
      '<div class="ezcol ezcol-one-half ezcol-last tablechecklist">350 Mickey Mantle - New York Yankees<br />',
      "395 Hoyt Wilhelm - Baltimore Orioles</div>",
      "<h3>1960 Topps Baseball Venezuelan</h3><p>Only cards #1-196.</p>",
    ].join("\n");
    const sections = sectionsFromChecklistPage(page);
    assert.deepEqual(sections.map((section) => [section.name, section.cards.map((card) => card.number)]), [["Base", ["1", "10", "350", "395"]]]);
    assert.deepEqual(sections[0].cards[2], { number: "350", player: "Mickey Mantle", team: "New York Yankees" });
  });

  it("an older page with a second headed block: the first is the base set, the next keeps its heading", () => {
    const page = [
      "<h2>1986-87 Fleer Basketball Set Checklist</h2>",
      '<div class="tablechecklist">57 Michael Jordan - Chicago Bulls<br />26 Patrick Ewing - New York Knicks</div>',
      "<h3>Stickers</h3>",
      '<div class="tablechecklist">8 Michael Jordan - Chicago Bulls<br />6 Patrick Ewing - New York Knicks</div>',
    ].join("\n");
    const sections = sectionsFromChecklistPage(page);
    assert.deepEqual(sections.map((section) => [section.name, section.cards.map((card) => card.number)]), [["Base", ["57", "26"]], ["Stickers", ["8", "6"]]]);
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
    // Series 1 and Series 2 are one product in the store ("Topps", "Upper Deck"): a card that reads its series loads it.
    const flagship = [
      { file: "t", sport: "Baseball", yearLabel: "2025", product: "Topps", source: "s", read: "2026-11-17", cards: 1 },
      { file: "tu", sport: "Baseball", yearLabel: "2025", product: "Topps Update", source: "s", read: "2026-11-17", cards: 1 },
      { file: "ud", sport: "Hockey", yearLabel: "2025-26", product: "Upper Deck", source: "s", read: "2026-11-17", cards: 1 },
    ];
    assert.deepEqual(checklistFilesFor({ years: ["2025"], setBrand: "Topps Series 1" }, flagship), ["t"]);
    assert.deepEqual(checklistFilesFor({ years: ["2025"], setBrand: "Topps Series 2" }, flagship), ["t"]);
    assert.deepEqual(checklistFilesFor({ years: ["2025-26"], setBrand: "Upper Deck Series 2" }, flagship), ["ud"]);
    assert.deepEqual(checklistFilesFor({ years: ["2025"], setBrand: "Topps Update" }, flagship), ["tu"]);
    // "NBA Hoops", as the card and sellers print it, is the set Add card calls "Hoops".
    const hoops = [{ file: "h", sport: "Basketball", yearLabel: "2024-25", product: "Hoops", source: "s", read: "2026-11-17", cards: 1 }];
    assert.deepEqual(checklistFilesFor({ years: ["2024-25"], setBrand: "NBA Hoops" }, hoops), ["h"]);
    // No year read: every year of the set up to 1980 in that sport, and never across sports.
    const vintage = [
      { file: "t52", sport: "Baseball", yearLabel: "1952", product: "Topps", source: "s", read: "2026-11-15", cards: 1 },
      { file: "t80", sport: "Baseball", yearLabel: "1980", product: "Topps", source: "s", read: "2026-11-15", cards: 1 },
      { file: "t81", sport: "Baseball", yearLabel: "1981", product: "Topps", source: "s", read: "2026-11-15", cards: 1 },
      { file: "f61", sport: "Basketball", yearLabel: "1961-62", product: "Fleer", source: "s", read: "2026-11-15", cards: 1 },
    ];
    assert.deepEqual(checklistFilesFor({ years: [], setBrand: "Topps", sport: "Baseball" }, vintage), ["t52", "t80"]);
    // A letter code (BP-27, US175) is a modern card's: every year.
    assert.deepEqual(checklistFilesFor({ years: [], setBrand: "Topps", sport: "Baseball", allYears: true }, vintage), ["t52", "t80", "t81"]);
    assert.deepEqual(checklistFilesFor({ years: [], setBrand: "Fleer", sport: "Basketball" }, vintage), ["f61"]);
    assert.deepEqual(checklistFilesFor({ years: [], setBrand: "Topps" }, vintage), []);
    assert.deepEqual(checklistFilesFor({ years: [], setBrand: "Prizm", sport: "Basketball" }, entries), []);
  });

  it("knows the base set's sections from a variation, an autograph or an insert", () => {
    for (const name of ["Base", "Base Rookies", "Base Paper", "Base Chrome", "Base Sapphire", "Base Prospects", "Base Chrome Prospects", "Base Young Guns", "Base Young Guns Rookies"]) assert.ok(isBaseSection(name), name);
    for (const name of ["Base Image Variation", "Base Chrome Autographs", "Base Rookie Variations Prizms Silver", "Base RetroFractor", "Fireworks", "Prizm Autographs", "Baseball Stars Autographs", "Chrome Prospects"]) assert.ok(!isBaseSection(name), name);
  });

  it("a section's name on the card: the whole name, or the name without 'Autographs', never just the set's own words", () => {
    assert.ok(sectionNamedOnCard("Deep Space", "Panini Prizm", "PRIZM DEEP SPACE NO. 24"));
    assert.ok(sectionNamedOnCard("Fireworks Autographs", "Panini Prizm", "PRIZM FIREWORKS NO. 24"));
    assert.ok(!sectionNamedOnCard("Prizm Autographs", "Panini Prizm", "PRIZM NO. 24 2025-26 PANINI - PRIZM BASKETBALL"));
    assert.ok(!sectionNamedOnCard("Rookie Autographs", "Panini Prizm", "PRIZM RC ROOKIE NO. 24"));
    assert.ok(!sectionNamedOnCard("Fireworks", "Panini Prizm", "PRIZM NO. 24"));
  });

  it("the 2024-and-later files: the page each came from is logged, never a file name, and the spot cards are who the page says", async () => {
    const added = CHECKLIST_INDEX.filter((entry) => entry.source.includes("checklistinsider.com"));
    assert.equal(added.length, 112);
    for (const entry of CHECKLIST_INDEX) assert.doesNotMatch(entry.source, /\.csv\b/i, entry.file);
    // Upper Deck Series 1 and Series 2 are one product, with both pages logged.
    for (const year of ["2024-25", "2025-26"]) {
      const deck = CHECKLIST_INDEX.find((entry) => entry.product === "Upper Deck" && entry.yearLabel === year);
      assert.match(deck?.source ?? "", /series-1-hockey \+ https:\/\/www\.checklistinsider\.com\/.*series-2-hockey$/, year);
    }
    const at = async (sport: string, yearLabel: string, setBrand: string, cardNumber: string) =>
      playersAt(await loadChecklistsFor({ years: [yearLabel], setBrand, sport }), { yearLabel, setBrand, cardNumber, sport });
    const only = async (sport: string, yearLabel: string, setBrand: string, cardNumber: string) => [...new Set((await at(sport, yearLabel, setBrand, cardNumber)).map((hit) => hit.player))];
    assert.deepEqual(await only("Basketball", "2025-26", "Panini Prizm", "103"), ["Labaron Philon"]);
    assert.deepEqual(await only("Football", "2024", "Panini Prizm", "329"), ["Drake Maye"]);
    assert.deepEqual(await only("Hockey", "2025-26", "Upper Deck", "205"), ["Ivan Demidov"]);
    assert.deepEqual(await only("Baseball", "2025", "Bowman", "BCP-22"), ["JJ Wetherholt"]);
    assert.deepEqual(await only("Baseball", "2025", "Topps Chrome", "221"), ["Max Muncy"]);
    assert.deepEqual(await only("Basketball", "2025-26", "Topps Chrome", "251"), ["Cooper Flagg"]);
    assert.deepEqual(await only("Football", "2025", "Topps Chrome", "306"), ["Jaxson Dart"]);
    // The 2024-2026 sets added on 2026-11-17 (Topps Series 1 and 2 are one product, like Upper Deck).
    assert.deepEqual(await only("Baseball", "2024", "Topps", "1"), ["Ronald Acuña Jr."]);
    assert.deepEqual(await only("Baseball", "2025", "Topps", "1"), ["Shohei Ohtani"]);
    assert.deepEqual(await only("Baseball", "2024", "Bowman Draft", "BD-1"), ["Travis Bazzana"]);
    assert.deepEqual(await only("Basketball", "2024-25", "Topps Chrome", "1"), ["Jett Howard"]);
    assert.ok((await only("Football", "2024", "Donruss Optic", "1")).includes("Kyler Murray"));
    // The page's slips, fixed (lib/cards/checklist-insider.ts): "Kale! Mullings", "Kurds Rourke", "Jandae Barron".
    assert.deepEqual(await only("Football", "2025", "Topps Chrome", "309"), ["Kaleb Mullings"]);
    assert.deepEqual(await only("Football", "2025", "Topps Chrome", "307"), ["Kurtis Rourke"]);
    assert.deepEqual(await only("Football", "2025", "Topps Chrome", "359"), ["Jahdae Barron"]);
    // Base Rookies #313 is Pat Bryant only: the etch list's leftover "Antwane Wells Jr." is gone.
    assert.deepEqual(await only("Football", "2025", "Topps Chrome", "313"), ["Pat Bryant"]);
    assert.deepEqual(await only("Football", "2025", "Topps Chrome", "58"), ["Ja'Marr Chase"]);
    const chrome = await loadChecklistsFor({ years: ["2025"], setBrand: "Topps Chrome", sport: "Football" });
    const rookies = chrome.flatMap((product) => product.sections).find((section) => section.name === "Base Rookies");
    assert.equal(rookies?.cards.length, 100);
    assert.ok((await only("Football", "2025", "Topps Chrome", "RA-KMU")).includes("Kaleb Mullings"));
    assert.deepEqual(await only("Football", "2025", "Panini Mosaic", "362"), ["Jaxson Dart"]);
    assert.deepEqual(await only("Football", "2025", "Donruss Optic", "273"), ["Jaxson Dart"]);
    assert.ok((await only("Football", "2025", "Panini Select", "93")).includes("Jaxson Dart"));
    assert.ok((await only("Basketball", "2025-26", "Panini Select", "1")).includes("Giannis Antetokounmpo"));
    assert.deepEqual(await only("Baseball", "2025", "Topps Chrome Update Sapphire", "USC150"), ["Jacob Wilson"]);
    // Topps x Bob Ross: The Joy of Basketball (2026-11-27): the base # and the insert codes are separate rows.
    assert.deepEqual(await only("Basketball", "2025-26", "Topps x Bob Ross", "66"), ["VJ Edgecombe"]);
    assert.deepEqual(await only("Basketball", "2025-26", "Topps x Bob Ross", "SP-66"), ["VJ Edgecombe"]);
    assert.deepEqual(await only("Basketball", "2025-26", "Topps x Bob Ross", "BT-5"), ["VJ Edgecombe"]);
    const bobRoss = await loadChecklistsFor({ years: ["2025-26"], setBrand: "Topps x Bob Ross", sport: "Basketball" });
    assert.equal(bobRoss[0]?.sections.find((section) => section.name === "Base")?.cards.length, 105);
    // The page lists two #USC45 cards, as Topps printed them.
    assert.deepEqual(await only("Baseball", "2025", "Topps Chrome Update Sapphire", "USC45"), ["Tommy Pham", "Cal Raleigh"]);
    assert.deepEqual(await only("Football", "2025", "Topps Resurgence", "11"), ["James Cook"]);
    assert.deepEqual(await only("Basketball", "2025-26", "Bowman U Best", "69"), ["Cameron Boozer"]);
    assert.deepEqual(await only("Basketball", "2025-26", "Bowman U Best", "97"), ["Cayden Boozer"]);
    // One-word names (2026-11-17): the checklist names Ludacris, Ichiro and MIYAVI where the parser used to drop them.
    assert.deepEqual(await only("Basketball", "2025-26", "Panini Prizm", "136"), ["Ludacris"]);
    assert.deepEqual(await only("Basketball", "2025-26", "Panini Donruss", "122"), ["Ludacris"]);
    assert.deepEqual(await only("Baseball", "2025", "Topps", "SOJ-7"), ["Ichiro"]);
    assert.deepEqual(await only("Baseball", "2025", "Topps Update", "FPA-MIY"), ["MIYAVI"]);
    // Mascots and cartoon characters stay out: 2025 Topps Mascots M-10 (Paws) has no player.
    assert.deepEqual(await only("Baseball", "2025", "Topps", "M-10"), []);
    // The 2023-2026 sets added the same day.
    assert.deepEqual(await only("Basketball", "2023-24", "Panini Prizm", "136"), ["Victor Wembanyama"]);
    assert.ok((await only("Basketball", "2025-26", "Topps", "201")).includes("Cooper Flagg"));
    assert.ok((await only("Basketball", "2024-25", "Hoops", "1")).includes("Devin Booker"));
    assert.ok((await only("Football", "2023", "Donruss Optic", "1")).includes("Anquan Boldin"));
    assert.ok((await only("Football", "2024", "Topps Resurgence", "1")).includes("Kurt Warner"));
    assert.ok((await only("Football", "2026", "Topps", "264")).includes("Cam Ward"));
    assert.ok((await only("Baseball", "2026", "Topps Chrome", "1")).includes("Shohei Ohtani"));
    assert.ok((await only("Baseball", "2024", "Topps Heritage", "1")).includes("Ronald Acuña Jr."));
    assert.deepEqual(await only("Basketball", "2025-26", "Bowman U Best", "9"), ["AJ Dybantsa"]);
    assert.deepEqual(await only("Football", "2025", "Bowman U Best", "1"), ["Avery Johnson"]);
    // The page's slips, fixed: "Tarris Reed JR." and "Zakiyah Johnson" in Game Graphs.
    assert.deepEqual(await only("Basketball", "2025-26", "Bowman U Best", "GG-TR"), ["Tarris Reed Jr."]);
    assert.deepEqual(await only("Basketball", "2025-26", "Bowman U Best", "GG-ZJ"), ["ZaKiyah Johnson"]);

    // 2025-26 Prizm #24: thirteen cards share the number, one is in Base.
    const shared = await at("Basketball", "2025-26", "Panini Prizm", "24");
    assert.equal(shared.length, 13);
    assert.deepEqual(baseSetHits(shared, "PRIZM NO. 24").map((hit) => hit.player), ["Sion James"]);
    // The card prints an insert's name: it may be that insert, so the base card is not offered.
    assert.deepEqual(baseSetHits(shared, "PRIZM DEEP SPACE NO. 24"), []);
    // No base card at the number: nobody.
    assert.deepEqual(baseSetHits(shared.filter((hit) => hit.section !== "Base"), "PRIZM NO. 24"), []);
  });
});

import type { BakeoffCase } from "./bakeoff-fixtures";

/**
 * The wide bake-off set: messy OCR the way a phone reads slabs and raw cards
 * across the hobby. Slab labels (PSA, BGS, SGC, CGC) with the cert number on
 * them, Prizm / Optic / Select / Mosaic, Bowman and Bowman Chrome prospects,
 * Topps Chrome, Topps Now, Heritage, Stadium Club, autos and patches, backs
 * with stats and bios, glare, split lines and upside-down reads.
 *
 * The lines are written the way the labels and cards print them. Card numbers
 * and cert numbers are made up in the real shapes; no real collector's data.
 * Scoring is the same as the first set: right, open or wrong. Open beats wrong.
 *
 * No fixture here has a known miss: bakeoff.test.ts fails if any field on any
 * scan reads wrong. A fixture may mark one with knownWrong only while a fix is
 * in flight, and the test fails the day it stops being a miss.
 */

const PANINI_2024 = "© 2024 Panini America, Inc. Printed in the USA.";
const TOPPS_2024 = "© 2024 THE TOPPS COMPANY, INC. ALL RIGHTS RESERVED.";

const KNIGHT_BACK = [
  "BCP-68",
  "RUNNING BACK",
  "WAYNE KNIGHT",
  "UCLA",
  "© 2026 THE TOPPS COMPANY, INC. ALL RIGHTS RESERVED.",
  "TOPPS AND BOWMAN CHROME ARE REGISTERED TRADEMARKS OF THE TOPPS COMPANY, INC.",
  "WWW.TOPPS.COM",
  "CMP#148134",
];

/**
 * These scans call the Maye /149 "Orange". The official 2024 Prizm Football checklist lists Orange
 * at /249 and Red Wave as its only /149, so with the checklist loaded the scan reads Red Wave.
 * Both count until the fixture's own name is settled.
 */
const MAYE_149_ON_CHECKLIST = ["Red Wave"];

export const WIDE_BAKEOFF_CASES: BakeoffCase[] = [
  // ── Slab labels ────────────────────────────────────────────────────────────
  {
    name: "Slab PSA: Doncic Silver Prizm, one field per line",
    kind: "slab",
    front: ["PSA", "2018 PANINI PRIZM", "#280", "LUKA DONCIC", "SILVER PRIZM", "GEM MT 10", "45678912"],
    back: null,
    truth: { player: "Luka Doncic", year: "2018-19", set: "Panini Prizm", number: "280", parallel: "Silver", run: null, grade: "PSA 10", cert: "45678912" },
  },
  {
    name: "Slab PSA: Doncic, label rows read across (grade on the name line)",
    kind: "slab",
    front: ["2018 PANINI PRIZM #280", "LUKA DONCIC GEM MT", "SILVER PRIZM 10", "PSA", "45678912"],
    back: null,
    truth: { player: "Luka Doncic", year: "2018-19", set: "Panini Prizm", number: "280", parallel: "Silver", run: null, grade: "PSA 10", cert: "45678912" },
  },
  {
    name: "Slab PSA: Doncic, label read upside down (lines reversed)",
    kind: "slab",
    front: ["45678912", "GEM MT 10", "SILVER PRIZM", "LUKA DONCIC", "#280", "2018 PANINI PRIZM", "PSA"],
    back: null,
    truth: { player: "Luka Doncic", year: "2018-19", set: "Panini Prizm", number: "280", parallel: "Silver", run: null, grade: "PSA 10", cert: "45678912" },
  },
  {
    name: "Slab PSA: Herbert Prizm base, no variety line",
    kind: "slab",
    front: ["PSA", "2020 PANINI PRIZM", "#325", "JUSTIN HERBERT", "NM-MT 8", "52345678"],
    back: null,
    truth: { player: "Justin Herbert", year: "2020", set: "Panini Prizm", number: "325", parallel: "Base", run: null, grade: "PSA 8", cert: "52345678" },
  },
  {
    name: "Slab PSA: De La Cruz Chrome Update Refractor, cert first",
    kind: "slab",
    front: ["PSA", "81234567", "2023 TOPPS CHROME UPDATE", "ELLY DE LA CRUZ", "#USC150", "REFRACTOR", "MINT 9"],
    back: null,
    truth: { player: "Elly De La Cruz", year: "2023", set: "Topps Chrome Update", number: "USC150", parallel: "Refractor", run: null, grade: "PSA 9", cert: "81234567" },
  },
  {
    name: "Slab PSA: De La Cruz, variety on the set line, RC on the name line",
    kind: "slab",
    front: ["2023 TOPPS CHROME UPDATE REFRACTOR", "#USC150", "ELLY DE LA CRUZ RC", "PSA", "MINT 9", "81234567"],
    back: null,
    truth: { player: "Elly De La Cruz", year: "2023", set: "Topps Chrome Update", number: "USC150", parallel: "Refractor", run: null, grade: "PSA 9", cert: "81234567" },
  },
  {
    name: "Slab PSA: Chourio Bowman Chrome, PSA's abbreviations and a wrapped set line",
    kind: "slab",
    front: ["PSA", "2022 BOWMAN CHR.", "PROSPECTS", "#BCP-153", "JACKSON CHOURIO", "GEM MT 10", "71234567"],
    back: null,
    truth: { player: "Jackson Chourio", year: "2022", set: "Bowman Chrome", number: "BCP-153", parallel: "Base", run: null, grade: "PSA 10", cert: "71234567" },
  },
  {
    name: "Slab PSA: Soto Topps Update, scanner couldn't tell slab from card",
    kind: null,
    front: ["PSA", "2018 TOPPS UPDATE", "#US300", "JUAN SOTO", "GEM MT 10", "28123456"],
    back: null,
    truth: { player: "Juan Soto", year: "2018", set: "Topps Update", number: "US300", parallel: "Base", run: null, grade: "PSA 10", cert: "28123456" },
  },
  {
    name: "Slab PSA: Williams Prizm, the card # didn't read (only the cert is a number)",
    kind: "slab",
    front: ["2024 PANINI PRIZM", "CALEB WILLIAMS", "RC", "GEM MT 10", "PSA", "98765432"],
    back: null,
    truth: { player: "Caleb Williams", year: "2024", set: "Panini Prizm", number: "301", parallel: "Base", run: null, grade: "PSA 10", cert: "98765432" },
  },
  {
    name: "Slab PSA: Williams Blue Ice Prizm /99",
    kind: "slab",
    front: ["PSA", "2024 PANINI PRIZM", "#301", "CALEB WILLIAMS", "BLUE ICE PRIZM /99", "GEM MT 10", "99887766"],
    back: null,
    truth: { player: "Caleb Williams", year: "2024", set: "Panini Prizm", number: "301", parallel: "Blue Ice", run: 99, grade: "PSA 10", cert: "99887766" },
  },
  {
    name: "Slab PSA: Wembanyama Tiger Stripe Prizm",
    kind: "slab",
    front: ["PSA", "2023 PANINI PRIZM", "#136", "VICTOR WEMBANYAMA", "TIGER STRIPE PRIZM", "GEM MT 10", "77665544"],
    back: null,
    truth: { player: "Victor Wembanyama", year: "2023-24", set: "Panini Prizm", number: "136", parallel: "Tiger Stripe", run: null, grade: "PSA 10", cert: "77665544" },
  },
  {
    name: "Slab PSA: Daniels Red White Blue Prizm",
    kind: "slab",
    front: ["PSA", "2024 PANINI PRIZM", "#347", "JAYDEN DANIELS", "RED WHITE BLUE PRIZM", "MINT 9", "88776655"],
    back: null,
    truth: { player: "Jayden Daniels", year: "2024", set: "Panini Prizm", number: "347", parallel: "Red White & Blue", run: null, grade: "PSA 9", cert: "88776655" },
  },
  {
    name: "Slab PSA: Burrow Contenders Rookie Ticket auto, dual grade",
    kind: "slab",
    front: ["PSA", "2020 PANINI CONTENDERS", "#103", "JOE BURROW", "ROOKIE TICKET AUTO", "NM-MT 8", "AUTO 10", "55443322"],
    back: null,
    truth: { player: "Joe Burrow", year: "2020", set: "Panini Contenders", number: "103", parallel: "Base", run: null, grade: "PSA 8", cert: "55443322" },
  },
  {
    name: "Slab PSA: Stroud Silver Prizm, the label prints C.J. and our directory says CJ",
    kind: "slab",
    front: ["PSA", "2023 PANINI PRIZM", "#339", "C.J. STROUD", "SILVER PRIZM", "GEM MT 10", "76543210"],
    back: null,
    truth: { player: "CJ Stroud", year: "2023", set: "Panini Prizm", number: "339", parallel: "Silver", run: null, grade: "PSA 10", cert: "76543210" },
  },
  {
    name: "Slab PSA: Condon Bowman Chrome, a prospect our directory doesn't have, wrapped set line",
    kind: "slab",
    front: ["PSA", "2025 BOWMAN CHROME", "PROSPECTS", "#BCP-12", "CHARLIE CONDON", "GEM MT 10", "61234567"],
    back: null,
    truth: { player: "Charlie Condon", year: "2025", set: "Bowman Chrome", number: "BCP-12", parallel: "Base", run: null, grade: "PSA 10", cert: "61234567" },
  },
  {
    name: "Slab BGS: Herbert Silver Prizm, subgrades in words",
    kind: "slab",
    front: ["BGS", "2020 PANINI PRIZM #325", "JUSTIN HERBERT - RC", "SILVER PRIZM", "9.5", "GEM MINT", "CENTERING 9.5 CORNERS 9.5", "EDGES 9.5 SURFACE 10", "0012345678"],
    back: null,
    truth: { player: "Justin Herbert", year: "2020", set: "Panini Prizm", number: "325", parallel: "Silver", run: null, grade: "BGS 9.5", cert: "0012345678" },
  },
  {
    name: "Slab BGS: Herbert, subgrades as a row of numbers",
    kind: "slab",
    front: ["BECKETT", "2020 PANINI PRIZM", "#325 JUSTIN HERBERT", "SILVER PRIZM", "GEM MINT 9.5", "9.5 9.5 9.5 10", "0012345678"],
    back: null,
    truth: { player: "Justin Herbert", year: "2020", set: "Panini Prizm", number: "325", parallel: "Silver", run: null, grade: "BGS 9.5", cert: "0012345678" },
  },
  {
    name: "Slab BGS: Clark Bowman Chrome prospect auto refractor /499",
    kind: "slab",
    front: ["BECKETT", "2023 BOWMAN CHROME", "PROSPECT AUTOGRAPHS #CPA-MC", "MAX CLARK", "REFRACTOR AUTO 432/499", "9.5", "AUTOGRAPH 10", "0015551234"],
    back: null,
    truth: { player: "Max Clark", year: "2023", set: "Bowman Chrome", number: "CPA-MC", parallel: "Refractor", run: 499, grade: "BGS 9.5", cert: "0015551234" },
  },
  {
    name: "Slab SGC: Wembanyama Prizm base, '10 GM'",
    kind: "slab",
    front: ["SGC", "2023-24 PANINI PRIZM", "VICTOR WEMBANYAMA", "#136", "10 GM", "7654321"],
    back: null,
    truth: { player: "Victor Wembanyama", year: "2023-24", set: "Panini Prizm", number: "136", parallel: "Base", run: null, grade: "SGC 10", cert: "7654321" },
  },
  {
    name: "Slab SGC: Trout Topps Update, '9 MT'",
    kind: "slab",
    front: ["SGC", "2011 TOPPS UPDATE", "MIKE TROUT", "#US175", "9 MT", "1357924"],
    back: null,
    truth: { player: "Mike Trout", year: "2011", set: "Topps Update", number: "US175", parallel: "Base", run: null, grade: "SGC 9", cert: "1357924" },
  },
  {
    name: "Slab CGC: Wembanyama Silver Prizm, mixed case, cert labelled",
    kind: "slab",
    front: ["CGC CARDS", "2023 Panini Prizm", "Victor Wembanyama", "Silver Prizm #136", "GEM MINT 10", "Cert #4123456789"],
    back: null,
    truth: { player: "Victor Wembanyama", year: "2023-24", set: "Panini Prizm", number: "136", parallel: "Silver", run: null, grade: "CGC 10", cert: "4123456789" },
  },
  {
    name: "Slab CGC: Bedard Young Guns, player first",
    kind: "slab",
    front: ["CGC", "Connor Bedard", "2023 Upper Deck Series 2", "#451 Young Guns", "MINT 9", "4098765432"],
    back: null,
    truth: { player: "Connor Bedard", year: "2023-24", set: "Upper Deck Series 2", number: "451", parallel: "Base", run: null, grade: "CGC 9", cert: "4098765432" },
  },

  // ── Panini raw cards ───────────────────────────────────────────────────────
  {
    name: "Prizm base: Williams, product line on the back",
    front: ["PRIZM", "CALEB WILLIAMS", "BEARS", "QB", "RC"],
    back: ["No. 301", "CALEB WILLIAMS", "QUARTERBACK", "CHICAGO BEARS", "HT: 6-1 WT: 215", "2024 PANINI - PRIZM FOOTBALL", PANINI_2024],
    truth: { player: "Caleb Williams", year: "2024", set: "Panini Prizm", number: "301", parallel: "", run: null },
  },
  {
    // A lone number on a Panini back is a jersey as often as the card #, so the # stays open.
    name: "Prizm Silver: Daniels, product line and © on one line, a lone number on a Panini back",
    front: ["PRIZM", "JAYDEN DANIELS", "COMMANDERS", "RC"],
    back: ["347", "JAYDEN DANIELS", "QUARTERBACK", "2024 PANINI - PRIZM FOOTBALL © 2024 Panini America, Inc. Printed in the USA."],
    truth: { player: "Jayden Daniels", year: "2024", set: "Panini Prizm", number: "347", parallel: "Silver", run: null },
  },
  {
    name: "Prizm numbered: Maye 045/149, spaced serial",
    front: ["PRIZM", "DRAKE MAYE", "PATRIOTS", "RC", "045 / 149"],
    back: ["No. 329", "DRAKE MAYE", "QUARTERBACK", "2024 PANINI - PRIZM FOOTBALL", PANINI_2024],
    truth: { player: "Drake Maye", year: "2024", set: "Panini Prizm", number: "329", parallel: "Orange", parallelAlso: MAYE_149_ON_CHECKLIST, run: 149 },
  },
  {
    name: "Prizm: Jeanty, card read upside down (both sides reversed)",
    front: ["RC", "RB", "RAIDERS", "ASHTON JEANTY", "PRIZM"],
    back: ["© 2025 Panini America, Inc. Printed in the USA.", "2025 PANINI - PRIZM FOOTBALL", "RUNNING BACK", "ASHTON JEANTY", "No. 310"],
    truth: { player: "Ashton Jeanty", year: "2025", set: "Panini Prizm", number: "310", parallel: "", run: null },
  },
  {
    name: "Prizm: Allen, jersey number on the front, front only",
    front: ["PRIZM", "JOSH ALLEN", "BILLS", "#17 | QB"],
    back: null,
    truth: { player: "Josh Allen", year: "2024", set: "Panini Prizm", number: "31", parallel: "", run: null },
  },
  {
    name: "Prizm WNBA: Clark, PRIZM logo on the front, WNBA product line on the back",
    front: ["PRIZM", "CAITLIN CLARK", "INDIANA FEVER", "RC"],
    back: ["No. 140", "CAITLIN CLARK", "GUARD", "2024 PANINI - PRIZM WNBA", PANINI_2024],
    truth: { player: "Caitlin Clark", year: "2024", set: "Panini Prizm WNBA", number: "140", parallel: "", run: null },
  },
  {
    name: "Prizm Draft Picks: Ward, '#1 OVERALL PICK' on the front, front only",
    front: ["PRIZM", "DRAFT PICKS", "CAM WARD", "MIAMI", "#1 OVERALL PICK"],
    back: null,
    truth: { player: "Cam Ward", year: "2025", set: "Prizm Draft Picks", number: "101", parallel: "", run: null },
  },
  {
    name: "Optic: Nix Rated Rookie, product line on the back",
    front: ["DONRUSS OPTIC", "RATED ROOKIE", "BO NIX", "BRONCOS"],
    back: ["No. 212", "BO NIX", "QUARTERBACK", "2024 PANINI - DONRUSS OPTIC FOOTBALL", PANINI_2024],
    truth: { player: "Bo Nix", year: "2024", set: "Donruss Optic", number: "212", parallel: "", run: null },
  },
  {
    name: "Donruss: Harrison Jr. Rated Rookie",
    front: ["DONRUSS", "RATED ROOKIE", "MARVIN HARRISON JR.", "CARDINALS"],
    back: ["No. 304", "MARVIN HARRISON JR.", "WIDE RECEIVER", "2024 PANINI - DONRUSS FOOTBALL", PANINI_2024],
    truth: { player: "Marvin Harrison Jr.", year: "2024", set: "Panini Donruss", number: "304", parallel: "", run: null },
  },
  {
    name: "Select: Bowers Concourse",
    front: ["SELECT", "CONCOURSE", "BROCK BOWERS", "RAIDERS", "RC"],
    back: ["No. 58", "BROCK BOWERS", "TIGHT END", "2024 PANINI - SELECT FOOTBALL", PANINI_2024],
    truth: { player: "Brock Bowers", year: "2024", set: "Panini Select", number: "58", parallel: "", run: null },
  },
  {
    name: "Select: Hunter, name split over two lines",
    front: ["SELECT", "TRAVIS", "HUNTER", "JAGUARS", "WR/CB", "RC"],
    back: ["No. 12", "TRAVIS HUNTER", "© 2025 Panini America, Inc. Printed in the USA."],
    truth: { player: "Travis Hunter", year: "2025", set: "Panini Select", number: "12", parallel: "", run: null },
  },
  {
    name: "Mosaic: Nabers base",
    front: ["MOSAIC", "MALIK NABERS", "GIANTS", "RC"],
    back: ["No. 277", "MALIK NABERS", "WIDE RECEIVER", "2024 PANINI - MOSAIC FOOTBALL", PANINI_2024],
    truth: { player: "Malik Nabers", year: "2024", set: "Panini Mosaic", number: "277", parallel: "", run: null },
  },
  {
    name: "National Treasures: Daniels rookie patch auto 23/99",
    front: ["NATIONAL TREASURES", "ROOKIE PATCH AUTOGRAPH", "JAYDEN DANIELS", "COMMANDERS", "23/99"],
    back: ["No. 163", "JAYDEN DANIELS", "THE ENCLOSED PLAYER-WORN MATERIAL IS GUARANTEED BY PANINI AMERICA, INC.", "2024 PANINI - NATIONAL TREASURES FOOTBALL", PANINI_2024],
    truth: { player: "Jayden Daniels", year: "2024", set: "Panini National Treasures", number: "163", parallel: "", run: 99 },
  },

  // ── Bowman ─────────────────────────────────────────────────────────────────
  {
    name: "Bowman Chrome: Jenkins 1st, both logos read",
    front: ["BOWMAN CHROME", "1ST BOWMAN", "WALKER JENKINS", "MINNESOTA TWINS", "OF"],
    back: ["BCP-91", "WALKER JENKINS", "OUTFIELD", "HT: 6'3\" WT: 210", "BATS: LEFT THROWS: RIGHT", TOPPS_2024],
    truth: { player: "Walker Jenkins", year: "2024", set: "Bowman Chrome", number: "BCP-91", parallel: "", run: null },
  },
  {
    // Flagship Bowman prints BCP Chrome Prospects too, so the code alone can't say which product this is.
    name: "Bowman: Jenkins, only 1ST BOWMAN read with a BCP code (flagship Bowman has BCP cards too)",
    front: ["1ST BOWMAN", "WALKER JENKINS", "MINNESOTA TWINS", "OF"],
    back: ["BCP-91", "WALKER JENKINS", "OUTFIELD", TOPPS_2024],
    truth: { player: "Walker Jenkins", year: "2024", set: "Bowman", number: "BCP-91", parallel: "", run: null },
  },
  {
    name: "Bowman Chrome: Clark refractor 122/499, REFRACTOR printed on the back",
    front: ["BOWMAN CHROME", "1ST BOWMAN", "MAX CLARK", "DETROIT TIGERS", "OF", "122/499"],
    back: ["BCP-88 REFRACTOR", "MAX CLARK", "OUTFIELD", TOPPS_2024],
    truth: { player: "Max Clark", year: "2024", set: "Bowman Chrome", number: "BCP-88", parallel: "Refractor", run: 499 },
  },
  {
    name: "Bowman Chrome: Griffin prospect auto, letter code CPA-KG",
    front: ["BOWMAN CHROME", "1ST BOWMAN", "KONNOR GRIFFIN", "PITTSBURGH PIRATES", "SS", "TOPPS CERTIFIED AUTOGRAPH ISSUE"],
    back: ["CPA-KG", "KONNOR GRIFFIN", "SHORTSTOP", "© 2025 THE TOPPS COMPANY, INC. ALL RIGHTS RESERVED."],
    truth: { player: "Konnor Griffin", year: "2025", set: "Bowman Chrome", number: "CPA-KG", parallel: "", run: null },
  },
  {
    name: "Bowman: Salas, position pair 'C-1B' above the code",
    front: ["BOWMAN", "1ST BOWMAN", "ETHAN SALAS", "SAN DIEGO PADRES", "C"],
    back: ["ETHAN SALAS", "C-1B", "BP-103", "SAN DIEGO PADRES", "HT: 6-2 WT: 185", TOPPS_2024],
    truth: { player: "Ethan Salas", year: "2024", set: "Bowman", number: "BP-103", parallel: "", run: null },
  },
  {
    name: "Bowman: Wetherholt, 'INF-3B' read and the BP code missed",
    front: ["BOWMAN", "1ST BOWMAN", "JJ WETHERHOLT", "ST. LOUIS CARDINALS"],
    back: ["JJ WETHERHOLT", "INF-3B", "ST. LOUIS CARDINALS", "HT: 5-10 WT: 190", "© 2025 THE TOPPS COMPANY, INC. ALL RIGHTS RESERVED."],
    truth: { player: "JJ Wetherholt", year: "2025", set: "Bowman", number: "BP-15", parallel: "", run: null },
  },
  {
    name: "Bowman: Caglianone, 'SS-38' (OCR's SS-3B) above BP-41",
    front: ["BOWMAN", "1ST BOWMAN", "JAC CAGLIANONE", "KANSAS CITY ROYALS"],
    back: ["JAC CAGLIANONE", "SS-38", "BP-41", "KANSAS CITY ROYALS", "© 2025 THE TOPPS COMPANY, INC. ALL RIGHTS RESERVED."],
    truth: { player: "Jac Caglianone", year: "2025", set: "Bowman", number: "BP-41", parallel: "", run: null },
  },
  {
    name: "Bowman: Condon, a prospect our directory doesn't have",
    front: ["BOWMAN", "1ST BOWMAN", "CHARLIE CONDON", "COLORADO ROCKIES", "3B/OF"],
    back: ["BP-5", "CHARLIE CONDON", "THIRD BASE", "© 2025 THE TOPPS COMPANY, INC. ALL RIGHTS RESERVED."],
    truth: { player: "Charlie Condon", year: "2025", set: "Bowman", number: "BP-5", parallel: "", run: null },
  },
  {
    name: "Bowman Draft: Bazzana, '#1 OVERALL PICK' in the bio",
    front: ["BOWMAN DRAFT", "1ST BOWMAN", "TRAVIS BAZZANA", "CLEVELAND GUARDIANS", "2B"],
    back: ["BD-1", "TRAVIS BAZZANA", "SECOND BASE", "#1 OVERALL PICK 2024 DRAFT", TOPPS_2024],
    truth: { player: "Travis Bazzana", year: "2024", set: "Bowman Draft", number: "BD-1", parallel: "", run: null },
  },
  {
    name: "Bowman Chrome: Anthony, glare turned O into 0 and cut the logo",
    front: ["1ST B0WMAN", "R0MAN ANTH0NY", "B0ST0N RED S0X", "OF"],
    back: ["BCP-142", "ROMAN ANTHONY", "OUTFIELD", "© 2023 THE TOPPS COMPANY, INC. ALL RIGHTS RESERVED."],
    truth: { player: "Roman Anthony", year: "2023", set: "Bowman Chrome", number: "BCP-142", parallel: "", run: null },
  },

  // ── Topps ──────────────────────────────────────────────────────────────────
  {
    name: "Topps Chrome: Skenes, bare number, a factory code and a stat table",
    front: ["TOPPS CHROME", "PAUL SKENES", "PITTSBURGH PIRATES", "P", "RC"],
    back: ["182", "PAUL SKENES", "PITCHER", "HT: 6'6\" WT: 235", "YR CLUB W L ERA G IP SO", "24 PIRATES 11 3 1.96 23 133.0 170", TOPPS_2024, "CODE#CMP048812"],
    truth: { player: "Paul Skenes", year: "2024", set: "Topps Chrome", number: "182", parallel: "", run: null },
  },
  {
    name: "Topps Chrome: Flagg orange /25, saved sales agree",
    front: ["TOPPS CHROME", "COOPER FLAGG", "MAVERICKS", "RC", "07/25"],
    back: null,
    titles: [
      { title: "2025-26 Topps Chrome Cooper Flagg Orange Refractor /25 #201 RC Mavericks", price: 900, soldAt: "2026-11-01" },
      { title: "Cooper Flagg 2025-26 Topps Chrome Orange Refractor 11/25 #201 Rookie", price: 950, soldAt: "2026-10-20" },
      { title: "2025-26 Topps Chrome Cooper Flagg #201 Orange Refractor /25", price: 880, soldAt: "2026-10-11" },
    ],
    truth: { player: "Cooper Flagg", year: "2025-26", set: "Topps Chrome", number: "201", parallel: "Orange Refractor", parallelAlso: ["Orange"], run: 25 },
  },
  {
    name: "Topps Chrome: Acuña, accent in the name, card #1",
    front: ["TOPPS CHROME", "RONALD ACUÑA JR.", "ATLANTA BRAVES", "OF"],
    back: ["#1", "RONALD ACUÑA JR.", "OUTFIELD", TOPPS_2024],
    truth: { player: "Ronald Acuna Jr.", year: "2024", set: "Topps Chrome", number: "1", parallel: "", run: null },
  },
  {
    name: "Topps Update: Wood, bare code US1 on the back",
    front: ["TOPPS", "JAMES WOOD", "WASHINGTON NATIONALS", "OF", "RC"],
    back: ["US1", "JAMES WOOD", "OUTFIELD", "2024 TOPPS UPDATE SERIES", TOPPS_2024],
    truth: { player: "James Wood", year: "2024", set: "Topps Update", number: "US1", parallel: "", run: null },
  },
  {
    name: "Topps flagship: Merrill, a ratio in the bio (21/25 games)",
    front: ["TOPPS", "JACKSON MERRILL", "SAN DIEGO PADRES", "OF", "RC"],
    back: ["#197", "JACKSON MERRILL", "OUTFIELD", "Jackson hit safely in 21/25 games to open the second half of his rookie year.", TOPPS_2024],
    truth: { player: "Jackson Merrill", year: "2024", set: "Topps", number: "197", parallel: "", run: null },
  },
  {
    name: "Topps Now: Ohtani, front only, a sentence with numbers",
    front: ["TOPPS NOW", "SHOHEI OHTANI", "LOS ANGELES DODGERS", "FIRST PLAYER IN MLB HISTORY WITH 50 HR AND 50 SB IN A SEASON"],
    back: null,
    truth: { player: "Shohei Ohtani", year: "2024", set: "Topps Now", number: "718", parallel: "", run: null },
  },
  {
    name: "Heritage: Witt Jr., no brand on the front, set named on the back",
    front: ["BOBBY WITT JR.", "ROYALS", "SHORTSTOP"],
    back: ["147", "BOBBY WITT JR. SS", "KANSAS CITY ROYALS", "HT: 6'1\" WT: 200 BATS: RIGHT THROWS: RIGHT", "COMPLETE MAJOR LEAGUE BATTING RECORD", "2024 TOPPS HERITAGE", TOPPS_2024],
    truth: { player: "Bobby Witt Jr.", year: "2024", set: "Topps Heritage", number: "147", parallel: "", run: null },
  },
  {
    name: "Stadium Club: Rodriguez",
    front: ["STADIUM CLUB", "JULIO RODRIGUEZ", "MARINERS"],
    back: ["#88", "JULIO RODRIGUEZ", "OUTFIELD", "SEATTLE MARINERS", TOPPS_2024],
    truth: { player: "Julio Rodriguez", year: "2024", set: "Topps Stadium Club", number: "88", parallel: "", run: null },
  },

  // ── Traps for the fill rules ───────────────────────────────────────────────
  {
    name: "Topps Chrome: Witt Jr., 'GOLD GLOVE' and 'SILVER SLUGGER' on the back",
    front: ["TOPPS CHROME", "BOBBY WITT JR.", "KANSAS CITY ROYALS", "SS"],
    back: ["#150", "BOBBY WITT JR.", "SHORTSTOP", "2024 GOLD GLOVE WINNER", "SILVER SLUGGER", TOPPS_2024],
    truth: { player: "Bobby Witt Jr.", year: "2024", set: "Topps Chrome", number: "150", parallel: "", run: null },
  },
  {
    name: "Prizm: Burrow, a stat row with a ratio (CMP/ATT 460/652)",
    front: ["PRIZM", "JOE BURROW", "BENGALS", "QB"],
    back: ["No. 61", "JOE BURROW", "QUARTERBACK", "YEAR TEAM G CMP/ATT YDS TD", "2024 BENGALS 17 460/652 4918 43", "2025 PANINI - PRIZM FOOTBALL", "© 2025 Panini America, Inc. Printed in the USA."],
    truth: { player: "Joe Burrow", year: "2025", set: "Panini Prizm", number: "61", parallel: "", run: null },
  },
  {
    name: "Topps Chrome: Judge, a stat table read one cell per line (many lone numbers)",
    front: ["TOPPS CHROME", "AARON JUDGE", "NEW YORK YANKEES", "OF"],
    back: ["AARON JUDGE", "OUTFIELD", "G", "158", "HR", "58", "RBI", "144", "AVG", ".322", TOPPS_2024],
    truth: { player: "Aaron Judge", year: "2024", set: "Topps Chrome", number: "99", parallel: "", run: null },
  },
  {
    name: "Topps Chrome: Henderson, 'No. 1 PROSPECT' in a short line, real number below",
    front: ["TOPPS CHROME", "GUNNAR HENDERSON", "BALTIMORE ORIOLES", "SS"],
    back: ["GUNNAR HENDERSON", "FORMER NO. 1 PROSPECT", "#27", "SHORTSTOP", TOPPS_2024],
    truth: { player: "Gunnar Henderson", year: "2024", set: "Topps Chrome", number: "27", parallel: "", run: null },
  },

  {
    name: "Prizm: Dart, a lone jersey number at the top of a Panini back",
    front: ["PRIZM", "JAXSON DART", "GIANTS", "QB", "RC"],
    back: ["17", "JAXSON DART", "QUARTERBACK", "NEW YORK GIANTS", "© 2025 Panini America, Inc."],
    truth: { player: "Jaxson Dart", year: "2025", set: "Panini Prizm", number: "332", parallel: "", run: null },
  },
  {
    name: "Topps Chrome: Holliday, a lone age under the team line at the bottom of the back",
    front: ["TOPPS CHROME", "JACKSON HOLLIDAY", "BALTIMORE ORIOLES", "2B"],
    back: ["JACKSON HOLLIDAY", "SECOND BASE", "BALTIMORE ORIOLES", "22", TOPPS_2024],
    truth: { player: "Jackson Holliday", year: "2024", set: "Topps Chrome", number: "200", parallel: "", run: null },
  },

  // ── Alternate readings from the phone: they fill an open field, and never make a wrong one ──
  {
    name: "Alternates: Maye, the serial read as 'O45/l49', the next reading is 045/149",
    front: ["PRIZM", "DRAKE MAYE", "PATRIOTS", "RC", "O45/l49"],
    alternates: [[], [], [], [], ["045/149"]],
    back: ["No. 329", "DRAKE MAYE", "QUARTERBACK", "2024 PANINI - PRIZM FOOTBALL", PANINI_2024],
    truth: { player: "Drake Maye", year: "2024", set: "Panini Prizm", number: "329", parallel: "Orange", parallelAlso: MAYE_149_ON_CHECKLIST, run: 149 },
  },
  {
    name: "Alternates: Salas, the code read as '8P-1O3', the next readings agree on BP-103",
    front: ["BOWMAN", "1ST BOWMAN", "ETHAN SALAS", "SAN DIEGO PADRES", "C"],
    back: ["ETHAN SALAS", "8P-1O3", "SAN DIEGO PADRES", TOPPS_2024],
    backAlternates: [[], ["BP-103", "BP-1O3"], [], []],
    truth: { player: "Ethan Salas", year: "2024", set: "Bowman", number: "BP-103", parallel: "", run: null },
  },
  {
    name: "Alternates trap: Maye, two next readings disagree on the run (/149 or /199)",
    front: ["PRIZM", "DRAKE MAYE", "PATRIOTS", "RC", "O45/l49"],
    alternates: [[], [], [], [], ["045/149", "045/199"]],
    back: ["No. 329", "DRAKE MAYE", "QUARTERBACK", "2024 PANINI - PRIZM FOOTBALL", PANINI_2024],
    truth: { player: "Drake Maye", year: "2024", set: "Panini Prizm", number: "329", parallel: "Orange", parallelAlso: MAYE_149_ON_CHECKLIST, run: 149 },
  },
  {
    name: "Alternates trap: Maye, a next reading would change a card # that read clearly",
    front: ["PRIZM", "DRAKE MAYE", "PATRIOTS", "RC", "045/149"],
    alternates: [[], ["DRAKE MAYS"], [], [], ["045/199"]],
    back: ["No. 329", "DRAKE MAYE", "QUARTERBACK", "2024 PANINI - PRIZM FOOTBALL", PANINI_2024],
    backAlternates: [["No. 829"], [], [], [], []],
    truth: { player: "Drake Maye", year: "2024", set: "Panini Prizm", number: "329", parallel: "Orange", parallelAlso: MAYE_149_ON_CHECKLIST, run: 149 },
  },
  {
    name: "Alternates trap: Allen, the only next reading with a number is a jersey line",
    front: ["PRIZM", "JOSH ALLEN", "BILLS", "~17 I QB"],
    alternates: [[], [], [], ["#17 | QB"]],
    back: null,
    truth: { player: "Josh Allen", year: "2024", set: "Panini Prizm", number: "31", parallel: "", run: null },
  },
  {
    name: "Alternates trap: Doncic slab, a next reading turns the cert into a '#' number; the barcode gives the cert",
    kind: "slab",
    front: ["PSA", "2018 PANINI PRIZM", "LUKA DONCIC", "SILVER PRIZM", "GEM MT 10", "4567B912"],
    alternates: [[], [], [], [], [], ["#45678912"]],
    barcodeCert: "45678912",
    back: null,
    truth: { player: "Luka Doncic", year: "2018-19", set: "Panini Prizm", number: "280", parallel: "Silver", run: null, grade: "PSA 10", cert: "45678912" },
  },

  // ── Brand-new products, no sales yet (Donnie's device tests) ───────────────
  {
    // Knight is on the wider player list now (college rosters), so he is no longer "new to us".
    // The same card with a name on no list is in bakeoff-fixtures-players.ts.
    name: "New product: Knight, 2026 Bowman U Chrome 1st Bowman /10, not in our list, SKU on the back",
    front: ["BOWMAN", "1ST", "WAYNE KNIGHT", "RB", "03/10"],
    back: [
      "BCP-68",
      "RUNNING BACK",
      "WAYNE KNIGHT",
      "UCLA",
      "HT: 5-7 WT: 190",
      "Knight ran for 1,046 yards as a sophomore and caught 31 passes out of the backfield.",
      "© 2026 THE TOPPS COMPANY, INC. ALL RIGHTS RESERVED.",
      "TOPPS AND BOWMAN CHROME ARE REGISTERED TRADEMARKS OF THE TOPPS COMPANY, INC.",
      "WWW.TOPPS.COM",
      "CMP#148134",
    ],
    truth: { player: "Wayne Knight", year: "2026", set: "Bowman U Chrome", number: "BCP-68", parallel: "", run: 10, firstBowman: true, auto: false, playerNew: false },
  },
  {
    name: "New product: Knight, the front name unread, the position line above the name on the back",
    front: ["1ST BOWMAN", "03/10"],
    back: ["RUNNING BACK", "WAYNE KNIGHT", "UCLA", "BCP-68", "© 2026 THE TOPPS COMPANY", "TOPPS AND BOWMAN CHROME ARE REGISTERED TRADEMARKS", "WWW.TOPPS.COM", "CMP#148134"],
    truth: { player: "Wayne Knight", year: "2026", set: "Bowman U Chrome", number: "BCP-68", parallel: "", run: 10, firstBowman: true, auto: false, playerNew: false },
  },
  {
    name: "New product: Lemon, 2026 Topps Inception rookie auto variation, no sales yet",
    front: ["INCEPTION", "MAKAI LEMON", "PHILADELPHIA EAGLES", "WR", "RC", "TOPPS CERTIFIED AUTOGRAPH ISSUE"],
    back: [
      "RAV-ML",
      "INCEPTION",
      "MAKAI LEMON",
      "PHILADELPHIA EAGLES",
      "ROOKIE AUTOGRAPH VARIATIONS CARD",
      "FROM 2026 TOPPS INCEPTION FOOTBALL",
      "© 2026 THE TOPPS COMPANY, INC. ALL RIGHTS RESERVED.",
    ],
    truth: { player: "Makai Lemon", year: "2026", set: "Topps Inception", number: "RAV-ML", parallel: "Green", run: null, auto: true, rookie: true, subset: "Rookie Autograph Variations" },
  },
  {
    name: "New product: Lemon, sold titles agree on Green",
    front: ["INCEPTION", "MAKAI LEMON", "PHILADELPHIA EAGLES", "WR", "RC", "TOPPS CERTIFIED AUTOGRAPH ISSUE"],
    back: ["RAV-ML", "INCEPTION", "MAKAI LEMON", "ROOKIE AUTOGRAPH VARIATIONS CARD", "FROM 2026 TOPPS INCEPTION FOOTBALL", "© 2026 THE TOPPS COMPANY, INC."],
    titles: [
      { title: "Makai Lemon 2026 Topps Inception Variation Green Rookie RC Auto #RAV-ML", price: 310, soldAt: "2026-11-02" },
      { title: "2026 Topps Inception Makai Lemon Green Rookie Auto Variation RAV-ML Eagles", price: 285, soldAt: "2026-11-06" },
    ],
    truth: { player: "Makai Lemon", year: "2026", set: "Topps Inception", number: "RAV-ML", parallel: "Green", run: null, auto: true, rookie: true, subset: "Rookie Autograph Variations" },
  },
  {
    name: "New product trap: only QUARTERBACK and a school read, so the player stays open",
    front: ["BOWMAN", "1ST"],
    back: ["QUARTERBACK", "ALABAMA", "© 2026 THE TOPPS COMPANY", "TOPPS AND BOWMAN CHROME ARE REGISTERED TRADEMARKS"],
    truth: { player: "", year: "2026", set: "Bowman U Chrome", number: "BCP-12", parallel: "", run: null },
  },

  // ── Bowman U Chrome is football and basketball only (review of #261) ──────
  {
    name: "Not Bowman U: Condon BCP-12, OUTFIELD on the back and a lone GEORGIA row in the stat table",
    front: ["BOWMAN CHROME", "1ST", "CHARLIE CONDON"],
    back: [
      "BCP-12",
      "CHARLIE CONDON",
      "OUTFIELD",
      "HT: 6-6 WT: 216 BATS: RIGHT THROWS: RIGHT",
      "YR CLUB G AB R H HR RBI AVG",
      "GEORGIA",
      "24 60 229 84 99 37 78 .433",
      "© 2025 THE TOPPS COMPANY, INC. ALL RIGHTS RESERVED.",
      "TOPPS AND BOWMAN CHROME ARE REGISTERED TRADEMARKS OF THE TOPPS COMPANY, INC.",
    ],
    truth: { player: "Charlie Condon", year: "2025", set: "Bowman Chrome", number: "BCP-12", parallel: "", run: null },
  },
  {
    name: "Not Bowman U: a BCP prospect whose team reads as two lines, TEXAS and RANGERS",
    front: ["BOWMAN CHROME", "1ST", "SEBASTIAN WALCOTT", "TEXAS", "RANGERS"],
    back: [
      "BCP-41",
      "SEBASTIAN WALCOTT",
      "TEXAS",
      "RANGERS",
      "© 2025 THE TOPPS COMPANY, INC. ALL RIGHTS RESERVED.",
      "TOPPS AND BOWMAN CHROME ARE REGISTERED TRADEMARKS OF THE TOPPS COMPANY, INC.",
    ],
    truth: { player: "Sebastian Walcott", year: "2025", set: "Bowman Chrome", number: "BCP-41", parallel: "", run: null },
  },
  {
    name: "Not Bowman U: a pitcher new to us, with an LSU line under his name",
    front: ["BOWMAN CHROME", "1ST", "COLE TESTERMAN"],
    back: [
      "BCP-88",
      "COLE TESTERMAN",
      "LSU",
      "PITCHER",
      "© 2025 THE TOPPS COMPANY, INC. ALL RIGHTS RESERVED.",
      "TOPPS AND BOWMAN CHROME ARE REGISTERED TRADEMARKS OF THE TOPPS COMPANY, INC.",
    ],
    truth: { player: "Cole Testerman", year: "2025", set: "Bowman Chrome", number: "BCP-88", parallel: "", run: null, playerNew: true },
  },
  {
    name: "Auto trap: Dart Prizm #332, 'auto-pilot' in the bio is not an autograph",
    front: ["PRIZM", "JAXSON DART", "GIANTS", "QB", "RC"],
    back: ["No. 332", "JAXSON DART", "QUARTERBACK", "Dart was an auto-pilot leader for the offense all season long.", "2025 PANINI - PRIZM FOOTBALL", "© 2025 Panini America, Inc."],
    truth: { player: "Jaxson Dart", year: "2025", set: "Panini Prizm", number: "332", parallel: "", run: null, auto: false, rookie: true },
  },
  {
    name: "Unknown name trap: PRIZM and a name nothing backs, so the player is open and the set still shows",
    front: ["PRIZM", "JOHN DOEMAN"],
    back: null,
    truth: { player: "", year: "2024", set: "Panini Prizm", number: "17", parallel: "", run: null },
  },

  // ── Sapphire Edition: the card often prints nothing to say so ──────────────
  {
    name: "Sapphire: Knight, no SAPPHIRE anywhere and sold titles split, so plain Bowman U Chrome with the quick pick",
    front: ["BOWMAN", "1ST", "WAYNE KNIGHT", "RB", "03/10"],
    back: KNIGHT_BACK,
    titles: [
      { title: "2026 Bowman U Chrome Sapphire Wayne Knight 1st Bowman BCP-68 /10 UCLA", price: 60, soldAt: "2026-11-04" },
      { title: "2026 Bowman U Chrome Wayne Knight 1st Bowman BCP-68 /10 UCLA", price: 35, soldAt: "2026-11-06" },
    ],
    truth: { player: "Wayne Knight", year: "2026", set: "Bowman U Chrome", number: "BCP-68", parallel: "", run: 10, sapphirePick: true, setFromSales: false },
  },
  {
    name: "Sapphire: Knight, most sold titles for BCP-68 /10 say Sapphire",
    front: ["BOWMAN", "1ST", "WAYNE KNIGHT", "RB", "03/10"],
    back: KNIGHT_BACK,
    titles: [
      { title: "2026 Bowman U Chrome Sapphire Wayne Knight 1st Bowman BCP-68 /10 UCLA", price: 60, soldAt: "2026-11-04" },
      { title: "Wayne Knight 2026 Bowman Sapphire Edition 1st BCP-68 03/10", price: 55, soldAt: "2026-11-05" },
      { title: "2026 Bowman U Chrome Wayne Knight 1st Bowman BCP-68 /10 UCLA", price: 35, soldAt: "2026-11-06" },
      // Another card # and another run say nothing about this card.
      { title: "2026 Bowman U Chrome Wayne Knight 1st Bowman BCP-68 /50", price: 12, soldAt: "2026-11-07" },
      { title: "2026 Bowman U Chrome Wayne Knight BCP-12 /10", price: 20, soldAt: "2026-11-07" },
    ],
    truth: { player: "Wayne Knight", year: "2026", set: "Bowman U Chrome Sapphire", number: "BCP-68", parallel: "", run: 10, sapphirePick: false, setFromSales: true },
  },
  {
    name: "Sapphire: Knight, a SAPPHIRE line in the OCR",
    front: ["BOWMAN", "1ST", "SAPPHIRE", "WAYNE KNIGHT", "RB", "03/10"],
    back: KNIGHT_BACK,
    truth: { player: "Wayne Knight", year: "2026", set: "Bowman U Chrome Sapphire", number: "BCP-68", parallel: "", run: 10, sapphirePick: false, setFromSales: false },
  },

  // ── Hockey ─────────────────────────────────────────────────────────────────
  {
    name: "Upper Deck: Celebrini Young Guns, series on the back",
    front: ["UPPER DECK", "YOUNG GUNS", "MACKLIN CELEBRINI", "SHARKS", "C"],
    back: ["#201", "MACKLIN CELEBRINI", "CENTER", "2024-25 UPPER DECK SERIES 1 HOCKEY", "© 2024 The Upper Deck Company. All rights reserved."],
    truth: { player: "Macklin Celebrini", year: "2024-25", set: "Upper Deck Series 1", number: "201", parallel: "", run: null },
  },
];

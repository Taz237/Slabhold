import { checklistProductFrom } from "@/lib/cards/checklist-import";
import type { ChecklistProduct } from "@/lib/cards/checklists";
import type { BakeoffCase } from "./bakeoff-fixtures";

/**
 * The lookup set: scans that prove the player is a lookup once the year, set and card # are
 * read (lib/scan/player-lookup.ts). Every player here is one our player list doesn't have, or
 * has under another spelling: retired players, rookies, NIL and college players, prospects.
 *
 *   A. the checklist names the player at that card #;
 *   B. most sold titles for that year, set and card # name the player;
 *   C. the name the card printed is accepted once A or B agrees with it.
 *
 * The traps are the other half: when no source agrees, the player stays open. Never a name from
 * the wrong year, the wrong set, an insert that shares the number, or a split market.
 *
 * Each case carries the few checklist rows it needs, copied from the real checklist (the store's
 * own files are checked too, in the bake-off's "as production loads them" run). OCR lines and
 * sold titles are made up the way real ones look. The made-up names are on no list.
 */

type Cards = [number: string, player: string, team: string][];

function checklist(sport: string, yearLabel: string, product: string, sections: Record<string, Cards>): ChecklistProduct {
  return checklistProductFrom(
    { sport, yearLabel, product, source: "bake-off fixture", read: "2026-11-14" },
    Object.entries(sections).map(([name, cards]) => ({ name, cards: cards.map(([number, player, team]) => ({ number, player, team })) })),
  );
}

const PANINI_2025 = "© 2025 Panini America, Inc. Printed in the USA.";
const PANINI_2023 = "© 2023 Panini America, Inc. Printed in the USA.";
const PRIZM_NIL_BACK = "2025-26 PANINI - PRIZM NIL BASKETBALL";
const PRIZM_FB_23 = "2023 PANINI - PRIZM FOOTBALL";

/** 2025-26 Panini Prizm (the NIL college product): the rows around #103. */
const PRIZM_NIL = checklist("Basketball", "2025-26", "Panini Prizm", {
  Base: [
    ["102", "Mark Sears", "Alabama Crimson Tide"],
    ["103", "LaBaron Philon", "Alabama Crimson Tide"],
    ["104", "Tobias Okonkwo", "Auburn Tigers"],
  ],
});

/** 2025-26 Panini Prizm #24, as the checklist has it: one base card, and inserts and autographs on the same number. #7 is made up: two base sections that disagree. */
const PRIZM_24 = checklist("Basketball", "2025-26", "Panini Prizm", {
  Base: [["7", "Tobias Okonkwo", "Auburn Tigers"], ["24", "Sion James", "Charlotte Hornets"]],
  "Base Rookies": [["7", "Marek Dvorsky", "Duke Blue Devils"]],
  "Legacy Signatures": [["24", "Anfernee Hardaway", "Orlando Magic"]],
  Penmanship: [["24", "JR Smith", "Cleveland Cavaliers"]],
  "Prizm Autographs": [["24", "Jaden Akins", "Orlando Magic"]],
  "Deep Space": [["24", "Cedric Coward", "Memphis Grizzlies"]],
  Fireworks: [["24", "Neoklis Avdalas", "Virginia Tech Hokies"]],
  Kaleidoscopic: [["24", "Magic Johnson", "Los Angeles Lakers"]],
});

/** 2023 Panini Prizm Football: rows copied from the checklist, with two inserts that reuse low numbers. */
const PRIZM_FB = checklist("Football", "2023", "Panini Prizm", {
  Base: [
    ["16", "Lorenzo Carter", "Atlanta Falcons"],
    ["55", "Chad Johnson", "Cincinnati Bengals"],
    ["80", "Dat Nguyen", "Dallas Cowboys"],
    ["121", "Andre Johnson", "Houston Texans"],
    ["131", "Shaquille Leonard", "Indianapolis Colts"],
    ["179", "Marcus Allen", "Los Angeles Raiders"],
    ["207", "Matt Judon", "New England Patriots"],
    ["215", "Ricky Williams", "New Orleans Saints"],
    ["229", "Allen Lazard", "New York Jets"],
    ["230", "C.J. Mosley", "New York Jets"],
    ["288", "Chigoziem Okonkwo", "Tennessee Titans"],
  ],
  "Base Rookies": [
    ["322", "Dorian Thompson-Robinson", "Cleveland Browns"],
    ["352", "Elijah Dotson", "Los Angeles Chargers"],
    ["359", "Zach Evans", "Los Angeles Rams"],
    ["391", "Kenny McIntosh", "Seattle Seahawks"],
  ],
  Fireworks: [["16", "Tyreek Hill", "Miami Dolphins"]],
  "Sensational Signatures": [["17", "Leroy Kelly", "Cleveland Browns"]],
});

/** The same set a year on: #55 and #80 are other players, and #480 is only here. A scan must never borrow from the wrong year. */
const PRIZM_FB_24 = checklist("Football", "2024", "Panini Prizm", {
  Base: [
    ["55", "Joe Burrow", "Cincinnati Bengals"],
    ["80", "CeeDee Lamb", "Dallas Cowboys"],
    ["480", "Tobias Okonkwo", "Dallas Cowboys"],
  ],
});

/** 2023 Bowman and 2022 Bowman: the same BP numbers are other prospects a year apart. */
const BOWMAN_23 = checklist("Baseball", "2023", "Bowman", {
  "Paper Prospects": [
    ["BP-7", "Mishael Deson", "Baltimore Orioles"],
    ["BP-34", "Abdias De La Cruz", "Arizona Diamondbacks"],
    ["BP-55", "Mairoshendrick Martinus", "Los Angeles Dodgers"],
  ],
});
const BOWMAN_22 = checklist("Baseball", "2022", "Bowman", {
  "Paper Prospects": [
    ["BP-7", "Marco Luciano", "San Francisco Giants"],
    ["BP-34", "Liover Peguero", "Pittsburgh Pirates"],
    ["BP-55", "Luis Matos", "San Francisco Giants"],
  ],
});
const BOWMAN_DRAFT_23 = checklist("Baseball", "2023", "Bowman Draft", { "Base Paper": [["BD-23", "Camden Minacci", "Los Angeles Angels"], ["BD-154", "Jaden Hamm", "Detroit Tigers"]] });
const TOPPS_UPDATE_23 = checklist("Baseball", "2023", "Topps Update", { Base: [["US17", "Rich Hill", "Pittsburgh Pirates"], ["US166", "Matt Barnes", "Miami Marlins"]] });
/** 2023-24 Prizm Draft Picks: #83 is one player; #15 is a different player in a dozen inserts. */
const DRAFT_PICKS_23 = checklist("Basketball", "2023-24", "Prizm Draft Picks", {
  Base: [["15", "Aaron Bradshaw", "Kentucky Wildcats"], ["83", "Dell Curry", "Virginia Tech Hokies"]],
  "College Penmanship": [["15", "Tosan Evbuomwan", "Princeton Tigers"]],
  Fireworks: [["15", "Dereck Lively II", "Duke Blue Devils"]],
});
const BOWMAN_U_FB_23 = checklist("Football", "2023", "Bowman U Chrome", { Base: [["28", "Robby Ashford", "Auburn"], ["43", "Keon Keeley", "Alabama"]] });

const TOPPS_2023 = "© 2023 THE TOPPS COMPANY, INC. ALL RIGHTS RESERVED.";
const BOWMAN_TM = "BOWMAN IS A REGISTERED TRADEMARK OF THE TOPPS COMPANY, INC.";
const DRAFT_PICKS_BACK = "2023-24 PANINI - PRIZM DRAFT PICKS BASKETBALL";

const philonSold = (price: number, soldAt: string, title: string) => ({ title, price, soldAt });
const PHILON_SOLD = [
  philonSold(42, "2026-11-10", "2025-26 Panini Prizm NIL LaBaron Philon #103 Orange Pulsar /175 Alabama"),
  philonSold(38.5, "2026-11-08", "2025-26 Panini Prizm Basketball LaBaron Philon Orange Pulsar Prizm #103 70/175"),
  philonSold(45, "2026-11-05", "LABARON PHILON 2025-26 Prizm #103 Orange Pulsar /175 Alabama Crimson Tide SP"),
  philonSold(40, "2026-11-02", "2025-26 Panini Prizm #103 LaBaron Philon Orange Pulsar /175"),
];

/** A retired or rookie player's Prizm back: the number, the name, the product line. Nothing beside the name. */
const prizmBack = (number: string, name: string | null) => [`NO. ${number}`, ...(name ? [name] : []), "HT: 6-1 WT: 215", PRIZM_FB_23, PANINI_2023];

export const LOOKUP_BAKEOFF_CASES: BakeoffCase[] = [
  // ── The Philon card (2025-26 Panini Prizm NIL #103 Orange Pulsar 70/175) ────
  {
    name: "Philon, Prizm NIL #103 /175: our list has him as 'Jr.', the card prints no Jr., the checklist backs him",
    front: ["PRIZM", "LABARON PHILON", "ALABAMA", "70/175"],
    back: ["NO. 103", "LABARON PHILON", "GUARD", "ALABAMA", PRIZM_NIL_BACK, PANINI_2025],
    checklist: [PRIZM_NIL],
    truth: { player: "Labaron Philon Jr.", year: "2025-26", set: "Panini Prizm", number: "103", parallel: "Orange Pulsar", run: 175, playerSource: "checklist" },
  },
  {
    name: "Philon, no checklist for the set: the sold titles for 2025-26 Prizm #103 /175 name him",
    front: ["PRIZM", "LABARON PHILON", "ALABAMA", "70/175"],
    back: ["NO. 103", "LABARON PHILON", "GUARD", "ALABAMA", PRIZM_NIL_BACK, PANINI_2025],
    live: { atRung: 0, sold: PHILON_SOLD },
    liveTruth: { player: "Labaron Philon Jr.", playerSource: "sales", calls: 1 },
    // On the phone, before the sold search answers, nothing backs the near match: open.
    truth: { player: "", year: "2025-26", set: "Panini Prizm", number: "103", parallel: "Orange Pulsar", run: 175 },
  },
  {
    name: "Philon, glare over the name on both sides: the checklist alone names #103",
    front: ["PRIZM", "ALABAMA", "70/175"],
    back: ["NO. 103", "GUARD", "ALABAMA", PRIZM_NIL_BACK, PANINI_2025],
    checklist: [PRIZM_NIL],
    truth: { player: "Labaron Philon Jr.", year: "2025-26", set: "Panini Prizm", number: "103", parallel: "Orange Pulsar", run: 175, playerSource: "checklist" },
  },
  {
    name: "Philon, the name read with a slip (PHILCN): the checklist's player at #103 agrees",
    front: ["PRIZM", "LABARON PHILCN", "70/175"],
    back: ["NO. 103", "HT: 6-4 WT: 177", PRIZM_NIL_BACK, PANINI_2025],
    checklist: [PRIZM_NIL],
    truth: { player: "Labaron Philon Jr.", year: "2025-26", set: "Panini Prizm", number: "103", parallel: "Orange Pulsar", run: 175, playerSource: "checklist" },
  },
  {
    name: "Philon, no name read and no checklist: 4 sold titles for the card agree on him",
    front: ["PRIZM", "70/175"],
    back: ["NO. 103", "GUARD", "ALABAMA", PRIZM_NIL_BACK, PANINI_2025],
    live: { atRung: 0, sold: PHILON_SOLD },
    liveTruth: { player: "Labaron Philon Jr.", playerSource: "sales", calls: 1 },
    truth: { player: "", year: "2025-26", set: "Panini Prizm", number: "103", parallel: "Orange Pulsar", run: 175 },
  },

  // ── Retired players our list doesn't have ──────────────────────────────────
  {
    name: "Retired: Chad Johnson, Prizm #55, the name alone on the front: the checklist agrees",
    front: ["PRIZM", "CHAD JOHNSON"],
    back: prizmBack("55", "CHAD JOHNSON"),
    checklist: [PRIZM_FB],
    truth: { player: "Chad Johnson", year: "2023", set: "Panini Prizm", number: "55", parallel: "", run: null, playerSource: "checklist" },
  },
  {
    name: "Retired: Dat Nguyen, Prizm #80, the name not read at all: the checklist names #80",
    front: ["PRIZM"],
    back: prizmBack("80", null),
    checklist: [PRIZM_FB],
    truth: { player: "Dat Nguyen", year: "2023", set: "Panini Prizm", number: "80", parallel: "", run: null, playerSource: "checklist" },
  },
  {
    name: "Retired: Marcus Allen, Prizm #179, name on the front only",
    front: ["PRIZM", "MARCUS ALLEN"],
    back: prizmBack("179", null),
    checklist: [PRIZM_FB],
    truth: { player: "Marcus Allen", year: "2023", set: "Panini Prizm", number: "179", parallel: "", run: null, playerSource: "checklist" },
  },
  {
    name: "Retired: Andre Johnson, Prizm #121 Silver auto, the name read with a slip (JOHNSCN)",
    front: ["PRIZM", "ANDRE JOHNSCN"],
    back: prizmBack("121", null),
    checklist: [PRIZM_FB],
    truth: { player: "Andre Johnson", year: "2023", set: "Panini Prizm", number: "121", parallel: "", run: null, playerSource: "checklist" },
  },
  {
    name: "Retired: Ricky Williams, Prizm #215, numbered 12/99, name unread",
    front: ["PRIZM", "12/99"],
    back: prizmBack("215", null),
    checklist: [PRIZM_FB],
    truth: { player: "Ricky Williams", year: "2023", set: "Panini Prizm", number: "215", parallel: "", run: 99, playerSource: "checklist" },
  },

  // ── Rookies ────────────────────────────────────────────────────────────────
  {
    name: "Rookie: Kenny McIntosh, Prizm #391, name alone on both sides",
    front: ["PRIZM", "KENNY MCINTOSH", "RC"],
    back: prizmBack("391", "KENNY MCINTOSH"),
    checklist: [PRIZM_FB],
    truth: { player: "Kenny McIntosh", year: "2023", set: "Panini Prizm", number: "391", parallel: "", run: null, playerSource: "checklist" },
  },
  {
    name: "Rookie: Zach Evans, Prizm #359, name unread",
    front: ["PRIZM", "RC"],
    back: prizmBack("359", null),
    checklist: [PRIZM_FB],
    truth: { player: "Zach Evans", year: "2023", set: "Panini Prizm", number: "359", parallel: "", run: null, playerSource: "checklist" },
  },
  {
    name: "Rookie: Thompson-Robinson, Prizm #322, a hyphenated name split over two lines",
    front: ["PRIZM", "DORIAN", "THOMPSON-ROBINSON", "RC"],
    back: prizmBack("322", null),
    checklist: [PRIZM_FB],
    truth: { player: "Dorian Thompson-Robinson", year: "2023", set: "Panini Prizm", number: "322", parallel: "", run: null, playerSource: "checklist" },
  },
  {
    name: "Rookie: Elijah Dotson, Prizm #352, the name between a team word and the logo",
    front: ["PRIZM", "ELIJAH DOTSON", "CHARGERS"],
    back: prizmBack("352", "ELIJAH DOTSON"),
    checklist: [PRIZM_FB],
    truth: { player: "Elijah Dotson", year: "2023", set: "Panini Prizm", number: "352", parallel: "", run: null, playerSource: "checklist" },
  },

  // ── Veterans the roster file dropped ───────────────────────────────────────
  {
    name: "Veteran: C.J. Mosley, Prizm #230: initials never read as a name line, the checklist names him",
    front: ["PRIZM", "C.J. MOSLEY"],
    back: prizmBack("230", "C.J. MOSLEY"),
    checklist: [PRIZM_FB],
    truth: { player: "C.J. Mosley", year: "2023", set: "Panini Prizm", number: "230", parallel: "", run: null, playerSource: "checklist" },
  },
  {
    name: "Veteran: Okonkwo, Prizm #288, a zero for the last O (OKONKW0)",
    front: ["PRIZM", "CHIGOZIEM OKONKW0"],
    back: prizmBack("288", null),
    checklist: [PRIZM_FB],
    truth: { player: "Chigoziem Okonkwo", year: "2023", set: "Panini Prizm", number: "288", parallel: "", run: null, playerSource: "checklist" },
  },
  {
    name: "Veteran: Shaquille Leonard, Prizm #131, name unread",
    front: ["PRIZM"],
    back: prizmBack("131", null),
    checklist: [PRIZM_FB],
    truth: { player: "Shaquille Leonard", year: "2023", set: "Panini Prizm", number: "131", parallel: "", run: null, playerSource: "checklist" },
  },
  {
    name: "Veteran: Matt Judon, Prizm #207, sold titles and the checklist both name him",
    front: ["PRIZM", "MATT JUDON"],
    back: prizmBack("207", null),
    checklist: [PRIZM_FB],
    titles: [
      { title: "2023 Panini Prizm Matt Judon #207 New England Patriots", price: 1.25, soldAt: "2026-10-01" },
      { title: "2023 Prizm Football #207 Matt Judon Patriots Base", price: 0.99, soldAt: "2026-09-20" },
    ],
    truth: { player: "Matt Judon", year: "2023", set: "Panini Prizm", number: "207", parallel: "", run: null, playerSource: "checklist" },
  },
  {
    name: "Veteran: Allen Lazard, Prizm #229, no name read and no checklist: 3 sold titles for the card name him",
    front: ["PRIZM"],
    back: prizmBack("229", null),
    live: {
      atRung: 0,
      sold: [
        { title: "2023 Panini Prizm Allen Lazard #229 New York Jets", price: 1.5, soldAt: "2026-10-03" },
        { title: "2023 Prizm #229 Allen Lazard Jets", price: 1, soldAt: "2026-09-12" },
        { title: "Allen Lazard 2023 Panini Prizm Football #229", price: 1.25, soldAt: "2026-08-30" },
      ],
    },
    liveTruth: { player: "Allen Lazard", playerSource: "sales", calls: 1 },
    truth: { player: "", year: "2023", set: "Panini Prizm", number: "229", parallel: "", run: null },
  },
  {
    name: "A number an insert shares: Lorenzo Carter, Prizm #16, the printed name picks the base card",
    front: ["PRIZM", "LORENZO CARTER"],
    back: prizmBack("16", null),
    checklist: [PRIZM_FB],
    truth: { player: "Lorenzo Carter", year: "2023", set: "Panini Prizm", number: "16", parallel: "", run: null, playerSource: "checklist" },
  },

  // ── Prospects ──────────────────────────────────────────────────────────────
  {
    name: "Prospect: Martinus, 2023 Bowman BP-55, a long name with a slip; only the © year on the back",
    front: ["BOWMAN", "1ST", "MAIROSHENDRIGK MARTINUS"],
    back: ["BP-55", "HT: 6-2 WT: 180", TOPPS_2023, BOWMAN_TM],
    checklist: [BOWMAN_23, BOWMAN_22],
    truth: { player: "Mairoshendrick Martinus", year: "2023", set: "Bowman", number: "BP-55", parallel: "", run: null, firstBowman: true, playerSource: "checklist" },
  },
  {
    name: "Prospect: Deson, 2023 Bowman BP-7, the name alone on the front",
    front: ["BOWMAN", "1ST", "MISHAEL DESON"],
    back: ["BP-7", "HT: 6-3 WT: 170", TOPPS_2023, BOWMAN_TM],
    checklist: [BOWMAN_23, BOWMAN_22],
    truth: { player: "Mishael Deson", year: "2023", set: "Bowman", number: "BP-7", parallel: "", run: null, firstBowman: true, playerSource: "checklist" },
  },
  {
    name: "Prospect: De La Cruz, 2023 Bowman BP-34, the first name on a line of its own",
    front: ["BOWMAN", "1ST", "ABDIAS", "DE LA CRUZ"],
    back: ["BP-34", "HT: 6-1 WT: 165", TOPPS_2023, BOWMAN_TM],
    checklist: [BOWMAN_23, BOWMAN_22],
    truth: { player: "Abdias De La Cruz", year: "2023", set: "Bowman", number: "BP-34", parallel: "", run: null, firstBowman: true, playerSource: "checklist" },
  },
  {
    name: "Draft pick: Minacci, 2023 Bowman Draft BD-23, numbered 14/150",
    front: ["BOWMAN", "DRAFT", "1ST", "CAMDEN MINACCI", "14/150"],
    back: ["BD-23", "HT: 6-3 WT: 215", TOPPS_2023, BOWMAN_TM],
    checklist: [BOWMAN_DRAFT_23],
    truth: { player: "Camden Minacci", year: "2023", set: "Bowman Draft", number: "BD-23", parallel: "", run: 150, firstBowman: true, playerSource: "checklist" },
  },
  {
    name: "Draft pick: Hamm, 2023 Bowman Draft BD-154, name on the back only",
    front: ["BOWMAN", "DRAFT", "1ST"],
    back: ["BD-154", "JADEN HAMM", "HT: 6-1 WT: 200", TOPPS_2023, BOWMAN_TM],
    checklist: [BOWMAN_DRAFT_23],
    truth: { player: "Jaden Hamm", year: "2023", set: "Bowman Draft", number: "BD-154", parallel: "", run: null, firstBowman: true, playerSource: "checklist" },
  },
  {
    name: "Veteran: Rich Hill, 2023 Topps Update US17, two short words nothing on the card backs",
    front: ["TOPPS", "RICH HILL"],
    back: ["US17", "HT: 6-5 WT: 221", "2023 TOPPS UPDATE SERIES", TOPPS_2023],
    checklist: [TOPPS_UPDATE_23],
    truth: { player: "Rich Hill", year: "2023", set: "Topps Update", number: "US17", parallel: "", run: null, playerSource: "checklist" },
  },

  // ── NIL and college ────────────────────────────────────────────────────────
  {
    name: "NIL: Dell Curry, Prizm Draft Picks #83, name unread: the only player at #83",
    front: ["PRIZM", "DRAFT PICKS"],
    back: ["NO. 83", "HT: 6-4 WT: 190", DRAFT_PICKS_BACK, PANINI_2023],
    checklist: [DRAFT_PICKS_23],
    truth: { player: "Dell Curry", year: "2023-24", set: "Prizm Draft Picks", number: "83", parallel: "", run: null, playerSource: "checklist" },
  },
  {
    name: "NIL: Bradshaw, Prizm Draft Picks #15, a number a dozen inserts share: the printed name picks him",
    front: ["PRIZM", "DRAFT PICKS", "AARON BRADSHAW"],
    back: ["NO. 15", "HT: 7-1 WT: 226", DRAFT_PICKS_BACK, PANINI_2023],
    checklist: [DRAFT_PICKS_23],
    truth: { player: "Aaron Bradshaw", year: "2023-24", set: "Prizm Draft Picks", number: "15", parallel: "", run: null, playerSource: "checklist" },
  },
  {
    name: "NIL: Ashford, 2023 Bowman U Chrome #28, the logo and the name on the front",
    front: ["BOWMAN U", "1ST", "ROBBY ASHFORD"],
    back: ["28", "HT: 6-3 WT: 212", TOPPS_2023, "TOPPS AND BOWMAN CHROME ARE REGISTERED TRADEMARKS OF THE TOPPS COMPANY, INC."],
    checklist: [BOWMAN_U_FB_23],
    truth: { player: "Robby Ashford", year: "2023", set: "Bowman U Chrome", number: "28", parallel: "", run: null, firstBowman: true, playerSource: "checklist" },
  },
  {
    name: "NIL: Keeley, 2023 Bowman U Chrome #43, the name read with a slip (KEELFY)",
    front: ["BOWMAN U", "1ST", "KEON KEELFY"],
    back: ["43", "HT: 6-5 WT: 242", TOPPS_2023, "TOPPS AND BOWMAN CHROME ARE REGISTERED TRADEMARKS OF THE TOPPS COMPANY, INC."],
    checklist: [BOWMAN_U_FB_23],
    truth: { player: "Keon Keeley", year: "2023", set: "Bowman U Chrome", number: "43", parallel: "", run: null, firstBowman: true, playerSource: "checklist" },
  },

  // ── A plain number inserts share: the base card, when nothing on the card says otherwise ──
  {
    name: "Shared number: 2025-26 Prizm #24, no name read: thirteen cards carry #24, one is in Base",
    front: ["PRIZM"],
    back: ["NO. 24", "HT: 6-5 WT: 200", PRIZM_NIL_BACK, PANINI_2025],
    checklist: [PRIZM_24],
    truth: { player: "Sion James", year: "2025-26", set: "Panini Prizm", number: "24", parallel: "", run: null, playerSource: "checklist" },
  },
  {
    name: "Shared number: Prizm #16, no name read, nothing names an insert: the base card",
    front: ["PRIZM"],
    back: prizmBack("16", null),
    checklist: [PRIZM_FB],
    truth: { player: "Lorenzo Carter", year: "2023", set: "Panini Prizm", number: "16", parallel: "", run: null, playerSource: "checklist" },
  },
  {
    name: "Shared number: Prizm Draft Picks #15, no name read: the base card, not the two inserts",
    front: ["PRIZM", "DRAFT PICKS"],
    back: ["NO. 15", "HT: 7-1 WT: 226", DRAFT_PICKS_BACK, PANINI_2023],
    checklist: [DRAFT_PICKS_23],
    truth: { player: "Aaron Bradshaw", year: "2023-24", set: "Prizm Draft Picks", number: "15", parallel: "", run: null, playerSource: "checklist" },
  },
  {
    name: "Shared number: 2025-26 Prizm #24, FIREWORKS and the name read on the front: the insert's player",
    front: ["PRIZM", "FIREWORKS", "NEOKLIS AVDALAS"],
    back: ["NO. 24", "HT: 6-8 WT: 215", PRIZM_NIL_BACK, PANINI_2025],
    checklist: [PRIZM_24],
    truth: { player: "Neoklis Avdalas", year: "2025-26", set: "Panini Prizm", number: "24", parallel: "", run: null, playerSource: "checklist" },
  },

  // ── Traps: nothing agrees, so the player stays open ────────────────────────
  {
    name: "Trap: Prizm Draft Picks #15, no name read, FIREWORKS on the front: an insert shares the number, so open",
    front: ["PRIZM", "DRAFT PICKS", "FIREWORKS"],
    back: ["NO. 15", "HT: 7-1 WT: 226", DRAFT_PICKS_BACK, PANINI_2023],
    checklist: [DRAFT_PICKS_23],
    truth: { player: "", year: "2023-24", set: "Prizm Draft Picks", number: "15", parallel: "", run: null },
  },
  {
    name: "Trap: Bowman BP-55 with no name read and only a © year: 2023's Martinus or 2022's Matos, so open",
    front: ["BOWMAN", "1ST"],
    back: ["BP-55", "HT: 6-2 WT: 180", TOPPS_2023, BOWMAN_TM],
    checklist: [BOWMAN_23, BOWMAN_22],
    truth: { player: "", set: "Bowman", number: "BP-55", parallel: "", run: null, firstBowman: true },
  },
  {
    name: "Trap: #16, no name read, the back names the Fireworks insert (Carter or Hill): open",
    front: ["PRIZM"],
    back: ["NO. 16", "FIREWORKS", "HT: 5-10 WT: 191", PRIZM_FB_23, PANINI_2023],
    checklist: [PRIZM_FB],
    truth: { player: "", year: "2023", set: "Panini Prizm", number: "16", parallel: "", run: null },
  },
  {
    name: "Trap: #24, no name read, a signed card: the base card and three autographs share the number, so open",
    front: ["PRIZM"],
    back: ["NO. 24", "CERTIFIED AUTOGRAPH", PRIZM_NIL_BACK, PANINI_2025],
    checklist: [PRIZM_24],
    truth: { player: "", year: "2025-26", set: "Panini Prizm", number: "24", parallel: "", run: null, auto: true },
  },
  {
    name: "Trap: #7, no name read, two base sections put two players on the number: open",
    front: ["PRIZM"],
    back: ["NO. 7", "HT: 6-5 WT: 200", PRIZM_NIL_BACK, PANINI_2025],
    checklist: [PRIZM_24],
    truth: { player: "", year: "2025-26", set: "Panini Prizm", number: "7", parallel: "", run: null },
  },
  {
    name: "Trap: a printed name nothing backs, and the checklist has someone else at #80: open, never Nguyen",
    front: ["PRIZM", "TOBIAS VANDERSLOOT"],
    back: prizmBack("80", null),
    checklist: [PRIZM_FB],
    truth: { player: "", year: "2023", set: "Panini Prizm", number: "80", parallel: "", run: null },
  },
  {
    name: "Trap: only the © year read (no product line): #55 is Johnson in 2023 and Burrow in 2024, so open",
    front: ["PRIZM"],
    back: ["NO. 55", "HT: 6-1 WT: 215", "© 2024 Panini America, Inc. Printed in the USA."],
    checklist: [PRIZM_FB, PRIZM_FB_24],
    truth: { player: "", set: "Panini Prizm", number: "55", parallel: "", run: null },
  },
  {
    name: "Trap: a number only next year's checklist has (#480) never names this year's card: open",
    front: ["PRIZM"],
    back: prizmBack("480", null),
    checklist: [PRIZM_FB, PRIZM_FB_24],
    truth: { player: "", year: "2023", set: "Panini Prizm", number: "480", parallel: "", run: null },
  },
  {
    name: "Trap: the card # didn't read: no lookup, the player stays open",
    front: ["PRIZM"],
    back: ["HT: 6-1 WT: 215", PRIZM_FB_23, PANINI_2023],
    checklist: [PRIZM_FB],
    truth: { player: "", year: "2023", set: "Panini Prizm", number: "", parallel: "", run: null },
  },
  {
    name: "Trap: sold titles for #103 /175 split between two players, no checklist: open",
    front: ["PRIZM", "70/175"],
    back: ["NO. 103", "GUARD", PRIZM_NIL_BACK, PANINI_2025],
    live: {
      atRung: 0,
      solds: "none",
      sold: [
        philonSold(40, "2026-11-10", "2025-26 Panini Prizm LaBaron Philon #103 Orange Pulsar /175"),
        philonSold(41, "2026-11-09", "2025-26 Panini Prizm LaBaron Philon #103 /175"),
        philonSold(39, "2026-11-08", "2025-26 Panini Prizm Tobias Okonkwo #103 Orange Pulsar /175"),
        philonSold(38, "2026-11-07", "2025-26 Panini Prizm Tobias Okonkwo #103 /175"),
      ],
    },
    liveTruth: { player: "", calls: 1 },
    // The card is the Philon card: the store's real 2025-26 Prizm file names #103 where this case's own setup has no checklist.
    storeTruth: { player: "Labaron Philon Jr." },
    truth: { player: "", year: "2025-26", set: "Panini Prizm", number: "103", parallel: "", run: 175 },
  },
  {
    name: "Trap: sold titles that are last season's #103 (2024-25) never name this season's card: open",
    front: ["PRIZM", "70/175"],
    back: ["NO. 103", "GUARD", PRIZM_NIL_BACK, PANINI_2025],
    live: {
      atRung: 0,
      solds: "none",
      sold: [
        philonSold(12, "2026-11-10", "2024-25 Panini Prizm Jared McCain #103 Orange Pulsar /175"),
        philonSold(11, "2026-11-09", "2024-25 Panini Prizm Jared McCain #103 /175 RC"),
        philonSold(13, "2026-11-08", "2024-25 Prizm Basketball Jared McCain #103 Orange Pulsar /175"),
      ],
    },
    liveTruth: { player: "", calls: 1 },
    // The card is the Philon card: the store's real 2025-26 Prizm file names #103 where this case's own setup has no checklist.
    storeTruth: { player: "Labaron Philon Jr." },
    truth: { player: "", year: "2025-26", set: "Panini Prizm", number: "103", parallel: "", run: 175 },
  },
  {
    name: "Trap: a slab is read off its label, never looked up: the label's name stands",
    kind: "slab",
    front: ["PSA", "2023 PANINI PRIZM", "#80", "TOBIAS VANDERSLOOT", "GEM MT 10", "71234567"],
    back: null,
    checklist: [PRIZM_FB],
    truth: { player: "Tobias Vandersloot", year: "2023", set: "Panini Prizm", number: "80", parallel: "", run: null, grade: "PSA 10", cert: "71234567" },
  },
];

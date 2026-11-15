import type { BakeoffCase } from "./bakeoff-fixtures";

/**
 * The era set: cards from before the scanner's first checklists (2019), read the way the phone reads
 * them. Vintage backs that print no year (1952 Topps signs "T.C.G."), junk-wax and 2000s backs that
 * print the card # bare like a jersey number, and slab labels the phone reads as one line.
 *
 * Every player, year, set and card # here is on the store's own checklist for that year and set
 * (lib/cards/data/checklists/, from Cardboard Connection), and bakeoff.test.ts checks that it still
 * is. Slab truths are what the label prints. OCR lines are modeled on how each card prints, not
 * captured. Cert numbers are made up.
 *
 * The traps: a bare number that is the player's jersey, not a card # the checklist gives him, stays
 * open; so does a year when two years of the set have him at that number.
 */

const FLEER_1986 = "© 1986 FLEER CORP. PRINTED IN U.S.A.";

export const ERA_BAKEOFF_CASES: BakeoffCase[] = [
  {
    name: "Era: 1952 Topps Mantle, T.C.G. and No. 311, no year anywhere",
    front: ["MICKEY MANTLE", "NEW YORK YANKEES"],
    back: ["No. 311", "MICKEY MANTLE", "Outfield: New York Yankees", "T.C.G. PRINTED IN U.S.A."],
    truth: { sport: "Baseball", player: "Mickey Mantle", year: "1952", set: "Topps", number: "311", parallel: "", run: null },
  },
  {
    name: "Era: 1952 Topps Mantle PSA, label read as one line",
    kind: "slab",
    front: ["1952 TOPPS MICKEY MANTLE #311", "NM 7", "PSA", "12345671"],
    back: null,
    truth: { sport: "Baseball", player: "Mickey Mantle", year: "1952", set: "Topps", number: "311", parallel: "Base", run: null },
  },
  {
    name: "Era: 1986-87 Fleer Jordan, a bare 57 on the back and © 1986",
    front: ["MICHAEL JORDAN", "BULLS", "GUARD", "FLEER"],
    back: ["57", "MICHAEL JORDAN", "CHICAGO BULLS", FLEER_1986],
    truth: { sport: "Basketball", player: "Michael Jordan", year: "1986-87", set: "Fleer", number: "57", parallel: "", run: null },
  },
  {
    name: "Era trap: 1986-87 Fleer Jordan, only his jersey 23 bare on the back",
    front: ["MICHAEL JORDAN", "BULLS", "GUARD", "FLEER"],
    back: ["23", "MICHAEL JORDAN", "CHICAGO BULLS", FLEER_1986],
    truth: { sport: "Basketball", player: "Michael Jordan", year: "1986-87", set: "Fleer", number: "", parallel: "", run: null },
  },
  {
    name: "Era: 1986-87 Fleer Jordan PSA",
    kind: "slab",
    front: ["1986 FLEER #57", "MICHAEL JORDAN", "NM-MT 8", "PSA", "12345672"],
    back: null,
    truth: { sport: "Basketball", player: "Michael Jordan", year: "1986-87", set: "Fleer", number: "57", parallel: "Base", run: null },
  },
  {
    name: "Era: 1989 Upper Deck Griffey, a bare 1 on the back",
    front: ["Ken Griffey Jr.", "Upper Deck", "STAR ROOKIE"],
    back: ["1", "KEN GRIFFEY, JR.", "SEATTLE MARINERS", "© 1989 THE UPPER DECK CO."],
    truth: { sport: "Baseball", player: "Ken Griffey Jr.", year: "1989", set: "Upper Deck", number: "1", parallel: "", run: null },
  },
  {
    name: "Era: 1979-80 O-Pee-Chee Gretzky, © year after the maker",
    front: ["WAYNE GRETZKY", "OILERS", "O-PEE-CHEE"],
    back: ["18", "WAYNE GRETZKY", "EDMONTON OILERS", "© O-PEE-CHEE CO. LTD. 1979"],
    truth: { sport: "Hockey", player: "Wayne Gretzky", year: "1979-80", set: "O-Pee-Chee", number: "18", parallel: "", run: null },
  },
  {
    name: "Era: 2011 Topps Update Trout, US175",
    front: ["MIKE TROUT", "ANGELS", "TOPPS"],
    back: ["US175", "MIKE TROUT", "© 2011 THE TOPPS COMPANY, INC."],
    truth: { sport: "Baseball", player: "Mike Trout", year: "2011", set: "Topps Update", number: "US175", parallel: "", run: null },
  },
  {
    name: "Era: 2003-04 Topps Chrome LeBron, bare 111",
    front: ["LEBRON JAMES", "CAVALIERS", "TOPPS CHROME"],
    back: ["111", "LEBRON JAMES", "© 2003 THE TOPPS COMPANY, INC."],
    truth: { sport: "Basketball", player: "LeBron James", year: "2003-04", set: "Topps Chrome", number: "111", parallel: "", run: null },
  },
  {
    name: "Era: 2000 Bowman Brady",
    front: ["TOM BRADY", "PATRIOTS", "BOWMAN"],
    back: ["236", "TOM BRADY", "QUARTERBACK", "© 2000 THE TOPPS COMPANY, INC."],
    truth: { sport: "Football", player: "Tom Brady", year: "2000", set: "Bowman", number: "236", parallel: "", run: null },
  },
  {
    name: "Era: 2018-19 Prizm Doncic, a bare 280 on a Panini back",
    front: ["LUKA DONCIC", "MAVERICKS", "PRIZM", "RC"],
    back: ["280", "LUKA DONCIC", "2018-19 PANINI - PRIZM BASKETBALL", "© 2018 Panini America, Inc."],
    truth: { sport: "Basketball", player: "Luka Doncic", year: "2018-19", set: "Panini Prizm", number: "280", parallel: "", run: null },
  },
  {
    name: "Era: 2017 Prizm Mahomes II, a bare 269 on a Panini back",
    front: ["PATRICK MAHOMES II", "CHIEFS", "PRIZM", "RC"],
    back: ["269", "PATRICK MAHOMES II", "2017 PANINI - PRIZM FOOTBALL", "© 2017 Panini America, Inc."],
    truth: { sport: "Football", player: "Patrick Mahomes II", year: "2017", set: "Panini Prizm", number: "269", parallel: "", run: null },
  },
  {
    name: "Era: 2018 Prizm Doncic Silver PSA, label read as one line",
    kind: "slab",
    front: ["2018 PANINI PRIZM LUKA DONCIC #280", "SILVER PRIZM", "GEM MT 10", "PSA", "12345673"],
    back: null,
    truth: { sport: "Basketball", player: "Luka Doncic", year: "2018-19", set: "Panini Prizm", number: "280", parallel: "Silver", run: null },
  },
  {
    name: "Era: 2000 Bowman Brady PSA, ROOKIE CARD on the label",
    kind: "slab",
    front: ["2000 BOWMAN #236", "TOM BRADY", "ROOKIE CARD", "MINT 9", "PSA", "12345674"],
    back: null,
    truth: { sport: "Football", player: "Tom Brady", year: "2000", set: "Bowman", number: "236", parallel: "Base", run: null },
  },
  {
    name: "Era: 1993 SP Jeter PSA",
    kind: "slab",
    front: ["1993 SP #279", "DEREK JETER", "GEM MT 10", "PSA", "12345675"],
    back: null,
    truth: { sport: "Baseball", player: "Derek Jeter", year: "1993", set: "SP", number: "279", parallel: "Base", run: null },
  },
  {
    name: "Era: 2011 Topps Update Trout PSA",
    kind: "slab",
    front: ["2011 TOPPS UPDATE #US175", "MIKE TROUT", "GEM MT 10", "PSA", "12345676"],
    back: null,
    truth: { sport: "Baseball", player: "Mike Trout", year: "2011", set: "Topps Update", number: "US175", parallel: "Base", run: null },
  },
];

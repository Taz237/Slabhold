import type { BakeoffCase } from "./bakeoff-fixtures";

/**
 * The player-list set: scans that prove the wider player list (lib/players/directory-more.json:
 * retired, college, prospects) only ever helps. A wider-list name confirms the name a card
 * printed on a line of its own, exactly, and nothing else: never a near match, never a name
 * inside other text, never against the card's own sport, never on a slab.
 * An unknown name with no sold title still stays open. OCR lines are made up the way real
 * ones look. The made-up names (Strawburn, Vandersloot, Okonkwo-style) are on no list.
 */

const TOPPS_1987 = "© 1987 TOPPS CHEWING GUM, INC. PRTD. IN U.S.A.";
const TOPPS_2025 = "© 2025 THE TOPPS COMPANY, INC. ALL RIGHTS RESERVED.";
const TOPPS_2026 = "© 2026 THE TOPPS COMPANY, INC. ALL RIGHTS RESERVED.";
const BOWMAN_CHROME_TM = "TOPPS AND BOWMAN CHROME ARE REGISTERED TRADEMARKS OF THE TOPPS COMPANY, INC.";

export const PLAYER_LIST_BAKEOFF_CASES: BakeoffCase[] = [
  // ── Now read: retired, college, prospect ───────────────────────────────────
  {
    name: "Retired: Strawberry, name alone on the front (nothing beside it), no sales",
    front: ["TOPPS", "DARRYL STRAWBERRY"],
    back: ["460", "DARRYL STRAWBERRY", "OUTFIELD", TOPPS_1987],
    truth: { player: "Darryl Strawberry", set: "Topps", number: "460", parallel: "", run: null, playerNew: false },
  },
  {
    name: "Retired: Strawberry, front only, the name with nothing beside it",
    front: ["1987 TOPPS", "DARRYL STRAWBERRY"],
    back: null,
    truth: { player: "Darryl Strawberry", year: "1987", set: "Topps", number: "", parallel: "", run: null, playerNew: false },
  },
  {
    name: "Retired: Kemp, basketball, the season from the list's sport",
    front: ["1996-97 TOPPS CHROME", "SHAWN KEMP"],
    back: null,
    truth: { player: "Shawn Kemp", year: "1996-97", set: "Topps Chrome", number: "", parallel: "", run: null, playerNew: false },
  },
  {
    name: "Retired: Datsyuk, hockey, front only",
    front: ["UPPER DECK", "PAVEL DATSYUK", "CENTER"],
    back: null,
    truth: { player: "Pavel Datsyuk", set: "Upper Deck", number: "", parallel: "", run: null, playerNew: false },
  },
  {
    name: "College: Manning, Bowman U Chrome, school under the name",
    front: ["BOWMAN U", "ARCH MANNING", "QB", "TEXAS"],
    back: ["BCP-16", "QUARTERBACK", "ARCH MANNING", "TEXAS", TOPPS_2026, BOWMAN_CHROME_TM],
    truth: { player: "Arch Manning", year: "2026", set: "Bowman U Chrome", number: "BCP-16", parallel: "", run: null, playerNew: false },
  },
  {
    name: "Prospect: Rainer, Bowman Chrome 1st, name alone on the front",
    front: ["BOWMAN CHROME", "1ST", "BRYCE RAINER"],
    back: ["BCP-41", "BRYCE RAINER", "SHORTSTOP", TOPPS_2025, BOWMAN_CHROME_TM],
    truth: { player: "Bryce Rainer", year: "2025", set: "Bowman Chrome", number: "BCP-41", parallel: "", run: null, firstBowman: true, playerNew: false },
  },

  // ── Still open, still themselves: names on no list ─────────────────────────
  {
    name: "Unknown: a made-up name one letter off a listed one, nothing beside it, no sales: stays open",
    front: ["TOPPS", "DARYL STRAWBERRY"],
    back: null,
    truth: { player: "", set: "Topps", number: "", parallel: "", run: null },
  },
  {
    name: "Unknown: Strawburn beside his position reads as himself, never Strawberry",
    front: ["BOWMAN CHROME", "1ST", "DARRYL STRAWBURN"],
    back: ["BCP-52", "DARRYL STRAWBURN", "OUTFIELD", TOPPS_2025, BOWMAN_CHROME_TM],
    truth: { player: "Darryl Strawburn", year: "2025", set: "Bowman Chrome", number: "BCP-52", parallel: "", run: null, playerNew: true },
  },
  {
    name: "Unknown: Vandersloot, a name on no list, nothing beside it, no sales: stays open",
    front: ["BOWMAN CHROME", "CORBIN VANDERSLOOT"],
    back: null,
    truth: { player: "", set: "Bowman Chrome", number: "", parallel: "", run: null },
  },
  {
    name: "New product: Vandersloot, 2026 Bowman U Chrome 1st Bowman /10, not in our list",
    front: ["BOWMAN", "1ST", "CORBIN VANDERSLOOT", "RB", "03/10"],
    back: [
      "BCP-68",
      "RUNNING BACK",
      "CORBIN VANDERSLOOT",
      "UCLA",
      "HT: 5-7 WT: 190",
      "Vandersloot ran for 1,046 yards as a sophomore and caught 31 passes out of the backfield.",
      TOPPS_2026,
      BOWMAN_CHROME_TM,
      "WWW.TOPPS.COM",
      "CMP#148134",
    ],
    truth: { player: "Corbin Vandersloot", year: "2026", set: "Bowman U Chrome", number: "BCP-68", parallel: "", run: 10, firstBowman: true, auto: false, playerNew: true },
  },

  // ── Traps: a listed name where it isn't the player ─────────────────────────
  {
    name: "Trap: a listed name in the bio (traded for Darryl Strawberry) is not the player",
    front: ["BOWMAN CHROME", "1ST", "CORBIN VANDERSLOOT"],
    back: [
      "BCP-77",
      "CORBIN VANDERSLOOT",
      "OUTFIELD",
      "Grew up watching tapes of Darryl Strawberry and Shawn Kemp with his dad.",
      TOPPS_2025,
      BOWMAN_CHROME_TM,
    ],
    truth: { player: "Corbin Vandersloot", year: "2025", set: "Bowman Chrome", number: "BCP-77", parallel: "", run: null, playerNew: true },
  },
  {
    name: "Trap: a listed name on a line of its own on the back (FAVORITE PLAYER) is not the player",
    front: ["BOWMAN CHROME", "1ST", "CORBIN VANDERSLOOT"],
    back: ["BCP-77", "CORBIN VANDERSLOOT", "OUTFIELD", "FAVORITE PLAYER:", "DARRYL STRAWBERRY", TOPPS_2025, BOWMAN_CHROME_TM],
    truth: { player: "Corbin Vandersloot", year: "2025", set: "Bowman Chrome", number: "BCP-77", parallel: "", run: null, playerNew: true },
  },
  {
    name: "Trap: a roster player's card with a listed name on another line stays the roster player",
    front: ["PRIZM", "JAXSON DART", "GIANTS", "QB", "RC"],
    back: ["332", "JAXSON DART", "QUARTERBACK", "SHAWN KEMP", "© 2025 Panini America, Inc. Printed in the USA."],
    truth: { player: "Jaxson Dart", year: "2025", set: "Panini Prizm", number: "332", parallel: "", run: null },
  },
  {
    name: "Trap: near a roster name (RONDON on a Rodon card) is still the roster player, as before",
    front: ["TOPPS CHROME", "CARLOS RONDON", "NEW YORK YANKEES"],
    back: null,
    truth: { player: "Carlos Rodon", set: "Topps Chrome", number: "", parallel: "", run: null },
  },

  // ── Two sports ─────────────────────────────────────────────────────────────
  {
    name: "Other sport: a basketball-list name on a baseball card (MLB team line) reads as printed, plain year",
    front: ["2025 BOWMAN CHROME", "1ST", "SHAWN KEMP", "SEATTLE MARINERS"],
    back: ["BCP-90", "SHAWN KEMP", "OUTFIELD", TOPPS_2025, BOWMAN_CHROME_TM],
    truth: { player: "Shawn Kemp", year: "2025", set: "Bowman Chrome", number: "BCP-90", parallel: "", run: null, playerNew: true },
  },
  {
    name: "Other sport: a football-list name on a baseball card (pitcher) is not taken from the list",
    front: ["BOWMAN CHROME", "1ST", "AARON CRAVER"],
    back: ["BCP-91", "AARON CRAVER", "PITCHER", TOPPS_2025, BOWMAN_CHROME_TM],
    truth: { player: "Aaron Craver", year: "2025", set: "Bowman Chrome", number: "BCP-91", parallel: "", run: null, playerNew: true },
  },

  // ── Card words ─────────────────────────────────────────────────────────────
  {
    name: "Card words: an insert title that is two everyday words (HOME RUN KINGS) names nobody",
    front: ["TOPPS CHROME", "HOME RUN KINGS", "POWER SURGE"],
    back: null,
    truth: { player: "", set: "Topps Chrome", number: "", parallel: "", run: null },
  },
  {
    name: "Card words: a color and rookie line (GOLD ROOKIE, RED WAVE) names nobody",
    front: ["PRIZM", "GOLD ROOKIE", "RED WAVE", "02/10"],
    back: null,
    truth: { player: "", set: "Panini Prizm", number: "", parallel: "", run: 10 },
  },

  // ── Slabs: the label is read exactly as before ─────────────────────────────
  {
    name: "Slab PSA: a listed retired name on the label is the label's text, as before",
    kind: "slab",
    front: ["PSA", "1987 TOPPS", "#460", "DARRYL STRAWBERRY", "NM-MT 8", "61234567"],
    back: null,
    truth: { player: "Darryl Strawberry", year: "1987", set: "Topps", number: "460", parallel: "", run: null, grade: "PSA 8", cert: "61234567" },
  },
];

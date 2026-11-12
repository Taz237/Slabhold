import type { CatalogCard } from "@/lib/card-catalog";
import type { SoldTitle } from "./match";

/**
 * Real-world scans for the bake-off (lib/scan/bakeoff.test.ts): the OCR lines
 * as Apple Vision gave them on Donnie's phone (front, and the back from the
 * flip), messy on purpose, and the true card. Catalog rows and sold titles are
 * made up the way the real ones look. No real collector's data.
 *
 * Scoring: right, open (we didn't say) or wrong (we said something else).
 * Open beats wrong. The player must always be right.
 */

export type BakeoffTruth = {
  player: string;
  set: string;
  number: string;
  /** The parallel's words, any order: "Pink/Red" matches "Pink Red". */
  parallel: string;
};

export type BakeoffCase = {
  name: string;
  front: string[];
  back: string[] | null;
  kind?: "card" | "slab";
  rows?: CatalogCard[];
  /** Saved sold listings (sold_comps_cache) for the player. Empty: a cold cache. */
  titles?: SoldTitle[];
  truth: BakeoffTruth;
};

const MILLER: BakeoffTruth = { player: "Aidan Miller", set: "Bowman", number: "BP-27", parallel: "Pink/Red" };
const MILLER_FRONT = ["3B", "1ST BOWMAN", "PHILADELPHIA PHILLIES", "137/299", "AIDAN MILLER"];
/** The stylized 1ST BOWMAN logo often doesn't read. */
const MILLER_FRONT_NO_LOGO = ["3B", "PHILADELPHIA PHILLIES", "137/299", "AIDAN MILLER"];

const MILLER_TITLES: SoldTitle[] = [
  { title: "Aidan Miller Bowman 1st Paper Pink/Red #'d 232/299 Phillies BP-27", price: 34.99, soldAt: "2026-10-30" },
  { title: "2024 Bowman 1st Aidan Miller Pink Red /299 BP-27 Phillies Prospect", price: 38, soldAt: "2026-10-12" },
];

export const BAKEOFF_CASES: BakeoffCase[] = [
  {
    name: "Miller, clean front and back",
    front: MILLER_FRONT,
    back: ["AIDAN MILLER", "PHILADELPHIA PHILLIES - 3B", "BP-27", "© 2024 THE TOPPS COMPANY, INC."],
    truth: MILLER,
  },
  {
    name: "Miller, 1ST BOWMAN missed, TOPPS.COM on the back",
    front: MILLER_FRONT_NO_LOGO,
    back: ["AIDAN MILLER", "TOPPS.COM", "BP-27"],
    truth: MILLER,
  },
  {
    name: "Miller, factory SKU and 2024 TOPPS",
    front: MILLER_FRONT_NO_LOGO,
    back: ["AIDAN MILLER", "#CMPO73107", "BP-27", "2024 TOPPS"],
    truth: MILLER,
  },
  {
    name: "Miller, SKU below, © 2024 TOPPS, 1ST BOWMAN read",
    front: MILLER_FRONT,
    back: ["AIDAN MILLER", "BP-27", "#CMPO73107", "© 2024 TOPPS"],
    truth: MILLER,
  },
  {
    name: "Miller, bio 'for-4' above BP-27",
    front: MILLER_FRONT,
    back: ["AIDAN MILLER", "hasn't had to sacrifice his average for-4 power", "BP-27", "2024 TOPPS"],
    truth: MILLER,
  },
  {
    name: "Miller, MLB TOPPS and a position line",
    front: MILLER_FRONT_NO_LOGO,
    back: ["AIDAN MILLER", "SS - 3B", "MLB TOPPS", "BP-27", "OFFICIALLY LICENSED TOPPS", "WWW.TOPPS.COM"],
    truth: MILLER,
  },
  {
    name: "Miller, BOWMAN TOPPS on the back",
    front: MILLER_FRONT_NO_LOGO,
    back: ["AIDAN MILLER", "BOWMAN TOPPS", "BP-27", "TOPPS®"],
    truth: MILLER,
  },
  {
    name: "Miller, front only",
    front: MILLER_FRONT,
    back: null,
    truth: MILLER,
  },
  {
    name: "Miller, no logo, saved Pink/Red /299 sales",
    front: MILLER_FRONT_NO_LOGO,
    back: ["AIDAN MILLER", "TOPPS.COM", "BP-27"],
    titles: MILLER_TITLES,
    truth: MILLER,
  },
  {
    name: "Miller, a Scott Daly catalog row and a Topps SKU row",
    front: MILLER_FRONT,
    back: ["AIDAN MILLER", "BP-27", "2024 TOPPS"],
    rows: [
      { id: "daly", playerName: "Scott Daly", yearLabel: "2024", setBrand: "Topps", cardNumber: "CMPO73107", sport: "Football", parallel: "Base" },
      { id: "CMPO73107", playerName: "Aidan Miller", yearLabel: "2024", setBrand: "Topps", cardNumber: "CMPO73107", sport: "Baseball", parallel: "Base" },
    ],
    truth: MILLER,
  },
  {
    name: "Dart, logo-only Mosaic, saved sales",
    front: ["JAXSON DART", "GIANTS", "QB", "RC", "121/199"],
    back: null,
    rows: [
      { id: "dart-prizm", playerName: "Jaxson Dart", yearLabel: "2025", setBrand: "Panini Prizm", cardNumber: "332", sport: "Football", parallel: "Base", isRookie: true },
    ],
    titles: [
      { title: "Jaxson Dart /199 Rookie 2025 Panini Mosaic - Orange Prizm #362 RC Giants", price: 45, soldAt: "2026-08-05" },
      { title: "2025 Panini Mosaic Jaxson Dart Orange Prizm 88/199 #362 Rookie", price: 52, soldAt: "2026-08-20" },
    ],
    truth: { player: "Jaxson Dart", set: "Panini Mosaic", number: "362", parallel: "Orange" },
  },
  {
    name: "Dart, logo-only Mosaic, cold cache",
    front: ["JAXSON DART", "GIANTS", "QB", "RC", "121/199"],
    back: null,
    truth: { player: "Jaxson Dart", set: "Panini Mosaic", number: "362", parallel: "Orange" },
  },
  {
    name: "Edgecombe, Topps Chrome Instinct /99",
    front: ["VJ EDGECOMBE", "ROOKIE", "INSTINCT", "28/99", "TOPPS CHROME"],
    back: null,
    titles: [
      { title: "2025-26 Topps Chrome VJ Edgecombe Instinct Green Refractor /99 #INS-7 RC 76ers", price: 120, soldAt: "2026-10-30" },
      { title: "VJ Edgecombe 2025-26 Topps Chrome Instinct Green 61/99 Rookie #INS-7", price: 110, soldAt: "2026-10-12" },
    ],
    truth: { player: "VJ Edgecombe", set: "Topps Chrome", number: "INS-7", parallel: "Instinct Green" },
  },
  {
    name: "Brown, Topps Now front",
    front: ["TOPPS NOW", "JAYLEN BROWN", "CELTICS"],
    back: null,
    truth: { player: "Jaylen Brown", set: "Topps Now", number: "NBA-12", parallel: "" },
  },
  {
    name: "McCarthy, Optic Preview Pink, saved sales",
    front: ["J.J. MCCARTHY", "VIKINGS", "RATED ROOKIE"],
    back: ["#303", "J.J. MCCARTHY", "QUARTERBACK", "© 2024 Panini America, Inc."],
    titles: [
      { title: "2024 Panini Donruss Optic Preview Pink J.J. McCarthy #303 RC Vikings", price: 22, soldAt: "2026-11-02" },
      { title: "J.J. McCarthy 2024 Donruss Optic Preview Pink #303 Rated Rookie", price: 19, soldAt: "2026-10-25" },
    ],
    truth: { player: "J.J. McCarthy", set: "Panini Donruss", number: "303", parallel: "Optic Preview Pink" },
  },
];

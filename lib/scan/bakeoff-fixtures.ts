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
  /** The card's print run, when the case checks it (OCR misread /298 for /299). */
  run?: number;
};

/** A mocked Trawl answer: eBay sold titles, served only at this rung of the search ladder (0 = the first). */
export type BakeoffLive = {
  atRung: number;
  sold: { title: string; price: number; soldAt: string; graded?: { grader: string; grade: string } }[];
  /** Rungs where Trawl fails (throttled or down) instead of answering. */
  failAt?: number[];
  /** What the sheet should say, when it isn't a price: "none" (searched, no sales) for a card that truly has none. */
  solds?: "none";
  /** The group the price must come from, when the case checks it ("/299, parallel not named"). */
  pricedFrom?: string;
};

export type BakeoffCase = {
  name: string;
  front: string[];
  back: string[] | null;
  kind?: "card" | "slab";
  rows?: CatalogCard[];
  /** Saved sold listings (sold_comps_cache) for the player. Empty: a cold cache. */
  titles?: SoldTitle[];
  /** What a live eBay search returns, junk included. None: Trawl finds nothing on any rung. */
  live?: BakeoffLive;
  truth: BakeoffTruth;
};

const MILLER: BakeoffTruth = { player: "Aidan Miller", set: "Bowman", number: "BP-27", parallel: "Pink/Red" };
const MILLER_FRONT = ["3B", "1ST BOWMAN", "PHILADELPHIA PHILLIES", "137/299", "AIDAN MILLER"];
/** The stylized 1ST BOWMAN logo often doesn't read. */
const MILLER_FRONT_NO_LOGO = ["3B", "PHILADELPHIA PHILLIES", "137/299", "AIDAN MILLER"];

/** What eBay returns for "Aidan Miller BP-27 /299": the card (as eBay's picture search found it), and junk. */
const MILLER_LIVE: BakeoffLive = {
  atRung: 1,
  sold: [
    { title: "Aidan Miller Bowman 1st Paper Pink/Red #'d 232/299 Phillies BP-27", price: 34.99, soldAt: "2026-11-04" },
    { title: "2024 Bowman 1st Aidan Miller Pink Red /299 BP-27 Phillies Prospect", price: 38, soldAt: "2026-10-28" },
    { title: "2024 Bowman Paper Prospects Aidan Miller Pink/Red 101/299 #BP-27", price: 36, soldAt: "2026-10-20" },
    { title: "2024 Bowman Aidan Miller BP-27 LOT of 5 base prospects", price: 9, soldAt: "2026-10-18" },
    { title: "Aidan Miller BP-27 Bowman 1st REPRINT custom /299", price: 3, soldAt: "2026-10-17" },
    { title: "2024 Bowman Justin Crawford Pink/Red /299 BP-28 Phillies", price: 25, soldAt: "2026-10-16" },
    { title: "2024 Bowman Aidan Miller BP-28 Pink/Red /299", price: 30, soldAt: "2026-10-15" },
    { title: "2024 Bowman 1st Aidan Miller Purple /250 BP-27", price: 45, soldAt: "2026-10-14" },
    { title: "2024 Bowman 1st Aidan Miller Pink Red /299 BP-27 PSA 10", price: 210, soldAt: "2026-10-13", graded: { grader: "PSA", grade: "10" } },
  ],
};

const MILLER_TITLES: SoldTitle[] = [
  { title: "Aidan Miller Bowman 1st Paper Pink/Red #'d 232/299 Phillies BP-27", price: 34.99, soldAt: "2026-10-30" },
  { title: "2024 Bowman 1st Aidan Miller Pink Red /299 BP-27 Phillies Prospect", price: 38, soldAt: "2026-10-12" },
];

export const BAKEOFF_CASES: BakeoffCase[] = [
  {
    name: "Miller, clean front and back",
    front: MILLER_FRONT,
    back: ["AIDAN MILLER", "PHILADELPHIA PHILLIES - 3B", "BP-27", "© 2024 THE TOPPS COMPANY, INC."],
    live: MILLER_LIVE,
    truth: MILLER,
  },
  {
    name: "Miller, 1ST BOWMAN missed, TOPPS.COM on the back",
    front: MILLER_FRONT_NO_LOGO,
    back: ["AIDAN MILLER", "TOPPS.COM", "BP-27"],
    live: MILLER_LIVE,
    truth: MILLER,
  },
  {
    name: "Miller, factory SKU and 2024 TOPPS",
    front: MILLER_FRONT_NO_LOGO,
    back: ["AIDAN MILLER", "#CMPO73107", "BP-27", "2024 TOPPS"],
    live: MILLER_LIVE,
    truth: MILLER,
  },
  {
    name: "Miller, SKU below, © 2024 TOPPS, 1ST BOWMAN read",
    front: MILLER_FRONT,
    back: ["AIDAN MILLER", "BP-27", "#CMPO73107", "© 2024 TOPPS"],
    live: MILLER_LIVE,
    truth: MILLER,
  },
  {
    name: "Miller, bio 'for-4' above BP-27",
    front: MILLER_FRONT,
    back: ["AIDAN MILLER", "hasn't had to sacrifice his average for-4 power", "BP-27", "2024 TOPPS"],
    live: MILLER_LIVE,
    truth: MILLER,
  },
  {
    name: "Miller, MLB TOPPS and a position line",
    front: MILLER_FRONT_NO_LOGO,
    back: ["AIDAN MILLER", "SS - 3B", "MLB TOPPS", "BP-27", "OFFICIALLY LICENSED TOPPS", "WWW.TOPPS.COM"],
    live: MILLER_LIVE,
    truth: MILLER,
  },
  {
    name: "Miller, BOWMAN TOPPS on the back",
    front: MILLER_FRONT_NO_LOGO,
    back: ["AIDAN MILLER", "BOWMAN TOPPS", "BP-27", "TOPPS®"],
    live: MILLER_LIVE,
    truth: MILLER,
  },
  {
    name: "Miller, front only",
    front: MILLER_FRONT,
    back: null,
    live: MILLER_LIVE,
    truth: MILLER,
  },
  {
    name: "Miller, no logo, saved Pink/Red /299 sales",
    front: MILLER_FRONT_NO_LOGO,
    back: ["AIDAN MILLER", "TOPPS.COM", "BP-27"],
    titles: MILLER_TITLES,
    live: MILLER_LIVE,
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
    live: MILLER_LIVE,
    truth: MILLER,
  },
  {
    name: "Miller, one seller's '2024 Topps … Pink' among Pink/Red titles",
    front: MILLER_FRONT_NO_LOGO,
    back: ["AIDAN MILLER", "BP-27", "TOPPS.COM"],
    live: {
      atRung: 1,
      sold: [
        { title: "Aidan Miller Bowman 1st Paper Pink/Red /299 BP-27", price: 35, soldAt: "2026-11-03" },
        { title: "Aidan Miller Bowman 1st Paper Pink/Red /299 BP-27", price: 36, soldAt: "2026-10-27" },
        { title: "2024 Bowman Aidan Miller Pink/Red /299 BP-27", price: 38, soldAt: "2026-10-21" },
        { title: "2024 Topps Aidan Miller BP-27 Pink /299", price: 30, soldAt: "2026-10-30" },
      ],
    },
    truth: MILLER,
  },
  {
    name: "Miller, OCR read 137/298 (the card is /299)",
    front: ["3B", "1ST BOWMAN", "PHILADELPHIA PHILLIES", "137/298", "AIDAN MILLER"],
    back: ["AIDAN MILLER", "TOPPS.COM", "BP-27"],
    live: { ...MILLER_LIVE, atRung: 2 },
    truth: { ...MILLER, run: 299 },
  },
  {
    name: "Miller, rungs a-c empty, Trawl fails on rung d",
    front: MILLER_FRONT,
    back: ["AIDAN MILLER", "TOPPS.COM", "BP-27"],
    live: { atRung: -1, sold: [], failAt: [3], solds: "none" },
    truth: { ...MILLER, parallel: "" },
  },
  {
    name: "Miller, 137/298, only 'Bowman BP-27' answers, 5 unnumbered among 2 /299",
    front: ["3B", "1ST BOWMAN", "PHILADELPHIA PHILLIES", "137/298", "AIDAN MILLER"],
    back: ["AIDAN MILLER", "BP-27"],
    live: {
      atRung: 2,
      pricedFrom: "/299, parallel not named",
      sold: [
        { title: "2024 Bowman Aidan Miller BP-27 /299 Phillies", price: 30, soldAt: "2026-11-08" },
        { title: "Aidan Miller Bowman 1st BP-27 #'d 55/299", price: 32, soldAt: "2026-11-03" },
        { title: "2024 Bowman 1st Aidan Miller BP-27 Phillies", price: 3, soldAt: "2026-11-09" },
        { title: "2024 Bowman 1st Aidan Miller BP-27 Phillies", price: 3.5, soldAt: "2026-11-07" },
        { title: "2024 Bowman 1st Aidan Miller BP-27 Phillies", price: 4, soldAt: "2026-11-05" },
        { title: "2024 Bowman 1st Aidan Miller BP-27 Phillies", price: 4.5, soldAt: "2026-11-02" },
        { title: "2024 Bowman 1st Aidan Miller BP-27 Phillies", price: 5, soldAt: "2026-10-30" },
      ],
    },
    truth: { ...MILLER, parallel: "", run: 299 },
  },
  {
    name: "Miller, /299 sales that name no color",
    front: MILLER_FRONT,
    back: ["AIDAN MILLER", "TOPPS.COM", "BP-27"],
    live: {
      atRung: 1,
      pricedFrom: "/299, parallel not named",
      sold: [
        { title: "2024 Bowman Aidan Miller BP-27 /299", price: 28, soldAt: "2026-11-06" },
        { title: "2024 Bowman 1st Aidan Miller BP-27 12/299", price: 31, soldAt: "2026-11-01" },
      ],
    },
    truth: { ...MILLER, parallel: "", run: 299 },
  },
  {
    name: "Miller, the Nov 12 Fuchsia /299 sales",
    front: MILLER_FRONT,
    back: ["AIDAN MILLER", "TOPPS.COM", "BP-27"],
    live: {
      atRung: 1,
      sold: [
        { title: "2024 Bowman Aidan Miller Fuchsia /299 BP-27 1st", price: 12.99, soldAt: "2026-11-10" },
        { title: "2024 Bowman 1st Aidan Miller BP-27 Fuchsia 88/299", price: 13, soldAt: "2026-11-06" },
        { title: "Aidan Miller 2024 Bowman Fuchsia #BP-27 /299", price: 10, soldAt: "2026-11-02" },
      ],
    },
    truth: { ...MILLER, parallel: "Fuchsia" },
  },
  {
    name: "Miller, front only, one saved '2024 Topps … /299' title",
    front: MILLER_FRONT_NO_LOGO,
    back: null,
    titles: [{ title: "2024 Topps Aidan Miller BP-27 Pink /299", price: 30, soldAt: "2026-10-30" }],
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
    live: {
      atRung: 0,
      sold: [
        { title: "Jaxson Dart /199 Rookie 2025 Panini Mosaic - Orange Prizm #362 RC Giants", price: 45, soldAt: "2026-08-05" },
        { title: "2025 Panini Mosaic Jaxson Dart Orange Prizm 88/199 #362 Rookie", price: 52, soldAt: "2026-08-20" },
        { title: "2025 Panini Prizm Jaxson Dart Blue /199 #332 RC", price: 60, soldAt: "2026-08-22" },
        { title: "Jaxson Dart 2025 Panini Mosaic Orange /199 #362 PSA 10", price: 140, soldAt: "2026-08-21", graded: { grader: "PSA", grade: "10" } },
      ],
    },
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
    live: {
      atRung: 0,
      sold: [
        { title: "2024 Topps Now Jaylen Brown #NBA-12 Finals MVP Celtics", price: 14, soldAt: "2026-06-20" },
        { title: "Jaylen Brown 2024 Topps Now NBA-12 Finals MVP", price: 12, soldAt: "2026-06-25" },
        { title: "2024 Topps Now Jayson Tatum #NBA-11 Finals Celtics", price: 9, soldAt: "2026-06-21" },
      ],
    },
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

import type { CatalogCard } from "@/lib/card-catalog";
import { parallelMatchKey, parallelsForSet } from "@/lib/cards/parallels";
import { parallelsIn, sameSeason, type ProductParallel, type ProductRecord } from "@/lib/cards/product-data";
import { setMatchPhrase } from "@/lib/comps/match";
import type { IndexedDirectoryPlayer } from "@/lib/players/types";
import { compactNorm, normInterest } from "@/lib/social/follow-rank";
import { findPlayers, looksLikeCatalogSku, readRawCardText, type RawCardRead, type RawPlayerHit } from "./raw-text";

export { looksLikeCatalogSku };
import type { SlabLabelRead } from "./slab-label";

/**
 * Checks a scan's read (slab label, or raw card front and back) against our
 * catalog, our cached eBay sold listings and the parallel checklists, and
 * ranks up to 3 cards.
 *
 * What the card prints comes first. When the player's name is read on the
 * card (its nameplate, front or back), every row is that player: a catalog
 * row or a sold listing for someone else never shows. Cached sold titles can
 * identify a card our catalog doesn't have (a Mosaic, an insert, a new
 * prospect), and they can name the set when only a logo was printed.
 *
 * One row per card, never one per parallel. The parallel is decided
 * separately: from the label, a serial run the checklist pins, or a color
 * word, and left open ("") when we can't tell. A field is only "sure" when
 * the card itself says so. Nothing here guesses a card #, year or parallel
 * the card didn't show.
 *
 * rankScanMatches is pure. matchScan adds at most 2 catalog searches.
 */

export type ScanRead =
  | { kind: "slab"; label: SlabLabelRead }
  | {
      kind: "raw";
      front: RawCardRead;
      back?: RawCardRead | null;
      /** The border's color name from the photo (pink, red, purple...), read on the phone. Only breaks ties. */
      border?: string | null;
    };

export type FieldSureness = "sure" | "likely" | "unsure";

export type ScanGrade = {
  company: string;
  number: string;
  qualifier: string;
  /** Private. Never put it in a URL. */
  certNumber: string;
  authentic: boolean;
  autoGrade: string;
};

export type ScanMatch = {
  /** The catalog row this card came from, or null when built from the card alone. */
  catalogId: string | null;
  playerName: string;
  sport: string;
  yearLabel: string;
  setBrand: string;
  cardNumber: string;
  /** "" when we can't tell. The confirm sheet asks. */
  parallel: string;
  serialRun: number | null;
  serialNo: string;
  isRookie: boolean;
  isAuto: boolean;
  /** Slabs only. */
  grade: ScanGrade | null;
  score: number;
  sureness: Record<"player" | "year" | "set" | "number" | "parallel", FieldSureness>;
  /** Likely parallels for the picker, best first. One row when the parallel is sure. */
  parallelOptions: ProductParallel[];
  /** Where a likely parallel came from: the card's print, or sold titles that agree. */
  parallelSource?: "card" | "sales";
  /** The print run read off the card matched no sold title, and 2+ titles agree on a run within 2 of it: theirs is used. */
  runUnsure?: boolean;
};

export type ScanMatchResult = {
  matches: ScanMatch[];
  /** The top match is settled on the phone: no AI step needed. */
  settled: boolean;
};

/** One cached eBay sold listing (sold_comps_cache): the title is what identifies the card. */
export type SoldTitle = {
  title: string;
  price?: number | null;
  soldAt?: string | null;
  /** The grader and grade the listing was saved with, when known. Null for raw. */
  grader?: string | null;
  grade?: string | null;
};

export type RankOptions = {
  directory: readonly IndexedDirectoryPlayer[];
  /** Checklists. Null or empty falls back to the per-set parallel lists. */
  products: readonly ProductRecord[] | null;
  /** Cached sold listings for the player the card names. Never a live search. */
  soldTitles?: readonly SoldTitle[] | null;
};

const MAX_MATCHES = 3;
const MAX_PARALLEL_OPTIONS = 8;
/** Most cached sold titles read per scan. */
const MAX_SOLD_TITLES = 60;
/** Each sold listing that agrees with a card adds this, up to TITLE_SUPPORT_MAX. */
const TITLE_SUPPORT = 6;
const TITLE_SUPPORT_MAX = 18;

/** Label words that mark an autograph or rookie, not a parallel. */
const FLAG_WORDS = new Set(["rookie", "rc", "auto", "autos", "autograph", "autographs", "autographed"]);
/** Label words that name a subset of the set (Prospects, Rookie Ticket, Young Guns), never a parallel. */
const SLAB_SUBSET_WORDS = new Set(["prospect", "prospects", "ticket", "young", "guns", "rated", "1st"]);

/** The parallel words on a slab's variety line: no flags, subset names, stray numbers, or a trailing "Prizm". */
function slabParallelWords(varietyText: string): string[] {
  const kept = words(varietyText).filter((word) => !FLAG_WORDS.has(word) && !SLAB_SUBSET_WORDS.has(word) && !/^\d+$/.test(word));
  // "SILVER PRIZM" is Silver. "PRIZM" alone is the parallel's own name (2012's Prizm), so it stays.
  const colors = kept.filter((word) => word !== "prizm" && word !== "prizms");
  return colors.length > 0 ? colors : kept;
}

type Evidence = {
  slab: boolean;
  players: RawPlayerHit[];
  /** A printed player name (slab label, or a raw card's nameplate) used when the directory doesn't know it. */
  playerText: string;
  /** The card printed the player's name clearly: every row must be this player. */
  playerLocked: boolean;
  /** Read on both the front and the back. */
  playerBothSides: boolean;
  /** From a team line when the player is new to us. */
  sport: string;
  /** An insert the card names, such as Instinct. */
  insert: string;
  /** The border color read from the photo, for ties only. */
  border: string | null;
  yearLabel: string;
  copyrightYear: string;
  setNames: string[];
  /** A slab's printed set when it isn't one of SETS. */
  setText: string;
  cardNumber: string;
  serial: { number: string; run: string } | null;
  /** The read run was replaced by the run sold titles agree on (OCR read /298, titles say /299). */
  runUnsure?: boolean;
  /** Slab: the variety line with flag words removed. Raw: parallel words. */
  parallelWords: string[];
  isRookie: boolean;
  isAuto: boolean;
  grade: ScanGrade | null;
};

function words(text: string): string[] {
  return normInterest(text).split(" ").filter(Boolean);
}

function compactName(name: string): string {
  return compactNorm(normInterest(name));
}

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    // "C.J. STROUD" is C.J. Stroud: a letter after a period starts a word too.
    .replace(/(^|[\s.-])([a-z])/g, (_match, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`);
}

function cardNumberKey(value: string): string {
  return value.replace(/^#/, "").trim().toLowerCase();
}

function startYear(label: string): number | null {
  const match = label.trim().match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}

/** PSA prints 2018 for a 2018-19 basketball card. Add card stores the season. */
function seasonFor(sport: string, yearLabel: string, setBrand = ""): string {
  if (!/^\d{4}$/.test(yearLabel)) return yearLabel;
  if (sport !== "Basketball" && sport !== "Hockey") return yearLabel;
  // The WNBA plays inside one calendar year: a 2024 Prizm WNBA card is 2024, not 2024-25.
  if (/\bwnba\b/i.test(setBrand)) return yearLabel;
  const start = Number(yearLabel);
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

function evidenceFrom(read: ScanRead, directory: readonly IndexedDirectoryPlayer[]): Evidence {
  if (read.kind === "slab") {
    const label = read.label;
    const variety = words(label.varietyText);
    return {
      slab: true,
      players: label.playerText ? findPlayers([label.playerText], directory) : [],
      playerText: label.playerText,
      playerLocked: false,
      playerBothSides: false,
      sport: "",
      insert: "",
      border: null,
      yearLabel: label.yearLabel,
      copyrightYear: "",
      setNames: label.setName ? [label.setName] : [],
      setText: label.setName ? "" : label.setText,
      cardNumber: looksLikeCatalogSku(label.cardNumber) ? "" : label.cardNumber,
      serial: label.serial ?? null,
      parallelWords: slabParallelWords(label.varietyText),
      isRookie: label.isRookie,
      isAuto: Boolean(label.autoGrade) || variety.some((word) => word.startsWith("auto")),
      grade: {
        company: label.grader,
        number: label.gradeNumber,
        qualifier: label.gradeQualifier,
        certNumber: label.certNumber,
        authentic: label.authentic,
        autoGrade: label.autoGrade,
      },
    };
  }
  const sides = [read.front, read.back].filter((side): side is RawCardRead => Boolean(side));
  let players: RawPlayerHit[] = [];
  for (const hit of sides.flatMap((side) => side.players)) {
    const seen = players.find((item) => item.name === hit.name && item.sport === hit.sport);
    if (!seen) players.push({ ...hit });
    else {
      if (hit.score > seen.score) seen.score = hit.score;
      if (hit.nameplate) seen.nameplate = true;
    }
  }
  players.sort((a, b) => b.score - a.score || Number(Boolean(b.nameplate)) - Number(Boolean(a.nameplate)));
  const onBoth = (compact: string) =>
    Boolean(read.back) &&
    [read.front, read.back].every((side) =>
      side!.players.some((hit) => hit.nameplate && compactName(hit.name) === compact) ||
      compactName(side!.printedName) === compact,
    );
  // The nameplate is the card telling us who it is. A name inside other text
  // (a bio line, the background) never outranks it.
  let playerText = "";
  let playerLocked = false;
  const plate = players.filter((hit) => hit.nameplate).sort((a, b) => {
    const both = Number(onBoth(compactName(b.name))) - Number(onBoth(compactName(a.name)));
    return both || b.score - a.score;
  })[0];
  if (plate) {
    players = [plate];
    playerLocked = true;
  } else {
    const printed = [read.front.printedName, read.back?.printedName ?? ""].find(Boolean) ?? "";
    if (printed) {
      players = [];
      playerText = printed;
      playerLocked = true;
    }
  }
  const lockedName = players[0]?.name ?? playerText;
  // The back is where the card # lives. A front number is usually something else.
  const backNumber = read.back?.cardNumber ?? "";
  const cardNumber = backNumber || read.front.cardNumber;
  const setNames = mergedSetNames(sides, cardNumber);
  const parallelWords: string[] = [];
  for (const phrase of sides.flatMap((side) => side.parallelWords)) {
    for (const word of words(phrase)) if (!parallelWords.includes(word)) parallelWords.push(word);
  }
  return {
    slab: false,
    players,
    playerText,
    playerLocked,
    playerBothSides: Boolean(lockedName) && onBoth(compactName(lockedName)),
    sport: sides.map((side) => side.team?.sport ?? "").find(Boolean) ?? "",
    insert: sides.map((side) => side.insert).find(Boolean) ?? "",
    border: read.border ?? null,
    yearLabel: sides.map((side) => side.yearLabel).find(Boolean) ?? "",
    copyrightYear: sides.map((side) => side.copyrightYear).find(Boolean) ?? "",
    setNames,
    setText: "",
    cardNumber,
    serial: sides.map((side) => side.serial).find(Boolean) ?? null,
    parallelWords,
    isRookie: sides.some((side) => side.isRookie),
    isAuto: false,
    grade: null,
  };
}

/** Bowman codes for Chrome prospects and prospect autos (in Bowman Chrome and in flagship Bowman), and codes only in Draft. */
const BOWMAN_CHROME_PREFIXES = new Set(["BCP", "BCPA", "CPA"]);
const BOWMAN_DRAFT_PREFIXES = new Set(["BD", "BDC", "CDA", "BDA"]);

/**
 * The set names both sides printed, best first. A name printed in full on either side
 * ("2024 TOPPS UPDATE SERIES", "PRIZM WNBA") beats a one-word logo guess, and the fuller name
 * beats the shorter one inside it (Topps Update over Topps, Upper Deck Series 1 over Upper Deck).
 */
function mergedSetNames(sides: readonly RawCardRead[], cardNumber: string): string[] {
  const names: string[] = [];
  for (const name of sides.flatMap((side) => side.setNames)) if (!names.includes(name)) names.push(name);
  const printed = new Set(sides.flatMap((side) => side.printedSets ?? []));
  const within = (short: string, long: string) => {
    const a = words(short);
    const b = words(long);
    return b.length > a.length && a.every((word) => b.includes(word));
  };
  const rank = (name: string) => (printed.has(name) ? 0 : 1);
  const ordered = names
    .map((name, index) => ({ name, index }))
    .sort((a, b) => rank(a.name) - rank(b.name) || Number(within(a.name, b.name)) - Number(within(b.name, a.name)) || a.index - b.index)
    .map((item) => item.name);
  // "1ST BOWMAN" is on paper and Chrome alike, and flagship Bowman prints BCP Chrome Prospects and
  // CPA autos too. So with only the Bowman name printed, a BCP, BCPA or CPA code keeps Bowman first
  // and offers Bowman Chrome second; only "BOWMAN CHROME" printed makes it Chrome. A Draft code
  // (BD-1, BDC-12) is only in Bowman Draft.
  if (ordered[0] === "Bowman") {
    const prefix = /^([A-Z]+)-?/i.exec(cardNumber)?.[1]?.toUpperCase() ?? "";
    if (BOWMAN_CHROME_PREFIXES.has(prefix) && !ordered.includes("Bowman Chrome")) return ["Bowman", "Bowman Chrome", ...ordered.slice(1)];
    if (BOWMAN_DRAFT_PREFIXES.has(prefix)) return ["Bowman Draft", ...ordered.filter((name) => name !== "Bowman Draft")];
  }
  return ordered;
}

function bestPlayerName(evidence: Evidence): string {
  return evidence.players[0]?.name ?? (evidence.playerText ? titleCase(evidence.playerText) : "");
}

/** The player the card names (nameplate first), or "" when none was read. */
export function scanPlayerName(read: ScanRead, directory: readonly IndexedDirectoryPlayer[]): string {
  return bestPlayerName(evidenceFrom(read, directory));
}

/** Sets that are only a maker's name: a seller's "Topps" on a Bowman card is the maker. */
const BARE_MAKER_SET = new Set(["Topps", "Upper Deck", "Leaf"]);

/** Checklist prefixes only Bowman prints. A search hint for solds, never the set on the sheet. */
const BOWMAN_ONLY_PREFIXES = new Set(["BP", "BCP", "BDC", "BDP", "BPA", "BCPA", "CPA"]);

/** Most Trawl calls one scan's search ladder makes. */
export const MAX_LADDER_RUNGS = 4;

/**
 * The eBay sold searches for this scan, broadest last, stopping at the first
 * that finds this card's sales:
 *   a. player + set + card # + /run   ("Aidan Miller Bowman BP-27 /299")
 *   b. player + card # + /run         ("Aidan Miller BP-27 /299")
 *   c. player + set + card #          ("Aidan Miller Bowman BP-27")
 *   d. player + card #                ("Aidan Miller BP-27")
 * No "#" and no year: eBay titles often skip them. The set and card # come from
 * the top match only when the card backed them; a Bowman-only checklist code
 * (BP-27) adds "Bowman" to the search, never to the sheet. The printed insert
 * and a slab's grade ride along. The player alone only when nothing else was read.
 */
export function liveSearchLadder(
  read: ScanRead,
  top: ScanMatch | null | undefined,
  directory: readonly IndexedDirectoryPlayer[],
): string[] {
  const evidence = evidenceFrom(read, directory);
  const player = top?.playerName || bestPlayerName(evidence);
  if (!player) return [];
  const known = (field: keyof ScanMatch["sureness"]) => Boolean(top) && top!.sureness[field] !== "unsure";
  const number = top && top.sureness.number === "sure" ? top.cardNumber : !top ? evidence.cardNumber : "";
  const prefix = /^([A-Z]+)-/i.exec(number)?.[1]?.toUpperCase() ?? "";
  const set = known("set") ? top!.setBrand : BOWMAN_ONLY_PREFIXES.has(prefix) ? "Bowman" : "";
  const insert = evidence.insert;
  // A run the sold titles corrected (/298 read, /299 sold) searches as theirs.
  const run = evidence.serial ? `/${top?.runUnsure && top.serialRun ? top.serialRun : evidence.serial.run}` : "";
  const grade = evidence.grade?.company && evidence.grade.number ? `${evidence.grade.company} ${evidence.grade.number}` : "";
  const rung = (...parts: string[]) => [player, ...parts].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const rungs = number
    ? [rung(set, insert, number, run, grade), rung(insert, number, run, grade), rung(set, insert, number, grade), rung(insert, number, grade)]
    : [rung(set, insert, run, grade), rung(insert, run, grade), rung(set, insert, grade)];
  const useful = [...new Set(rungs)].filter((query) => query !== player);
  // Nothing but the name was read: search the player once, and let the titles name the card.
  return (useful.length > 0 ? useful : [player]).slice(0, MAX_LADDER_RUNGS);
}

/** The first rung of the ladder. "" with no player: no search. */
export function liveSearchQuery(
  read: ScanRead,
  top: ScanMatch | null | undefined,
  directory: readonly IndexedDirectoryPlayer[],
): string {
  return liveSearchLadder(read, top, directory)[0] ?? "";
}

/** Up to 2 search_cards queries: the full card, then the player alone. */
export function catalogQueriesFor(read: ScanRead, directory: readonly IndexedDirectoryPlayer[]): string[] {
  const evidence = evidenceFrom(read, directory);
  const player = bestPlayerName(evidence);
  if (!player) return [];
  const full = [player, evidence.yearLabel, evidence.setNames[0] ?? evidence.setText, evidence.cardNumber]
    .filter(Boolean)
    .join(" ");
  return full === player ? [player] : [full, player];
}

type Candidate = {
  catalogId: string | null;
  playerName: string;
  sport: string;
  yearLabel: string;
  setBrand: string;
  cardNumber: string;
  isRookie: boolean;
  /** Catalog rows for this card, by parallel key, so a resolved parallel can keep its row id. */
  rowsByParallel: Map<string, string>;
  /** Cached sold listings that name this exact card. */
  titles?: TitleFacts[];
};

/**
 * Local title checks, kept small on purpose: lib/comps/match is shared with
 * the card pages, and pulling more of it in here grows their bundles.
 */
const TITLE_LOT = /\b(?:lot|lots|reprint|proxy|custom|you\s+pick|complete\s+set|team\s+set)\b|\bx[2-9]\b|\b\d+\s*cards?\b/i;
/** "/199", "#/199", "88/199". A season ("2025/26") is not a run. */
const TITLE_RUN = /(?:(\d{1,4})\s*)?\/\s*(\d{1,4})\b/g;

function titleNamesPlayer(title: string, playerName: string): boolean {
  const name = compactName(playerName);
  return name.length > 0 && compactNorm(normInterest(title)).includes(name);
}

function titleRuns(title: string): number[] {
  const runs: number[] = [];
  for (const match of title.matchAll(TITLE_RUN)) {
    const left = match[1] ? Number(match[1]) : null;
    const right = Number(match[2]);
    if (left != null && left >= 1900 && (right === (left + 1) % 100 || right === left + 1)) continue;
    if (left != null && left > right) continue;
    if (right > 0) runs.push(right);
  }
  return runs;
}

/** What one cached sold title says about the card. */
type TitleFacts = {
  /** Print runs the title names ("/199"). */
  runs: number[];
  /** Color and finish words, upper case ("ORANGE"). */
  colors: string[];
  insert: string;
};

function identityKey(card: { playerName: string; yearLabel: string; setBrand: string; cardNumber: string }): string {
  return [
    compactName(card.playerName),
    startYear(card.yearLabel) ?? "",
    setMatchPhrase(card.setBrand),
    cardNumberKey(card.cardNumber),
  ].join("|");
}

function playerHit(evidence: Evidence, name: string): { score: number } | null {
  const key = compactName(name);
  const hit = evidence.players.find((item) => compactName(item.name) === key);
  if (hit) return hit;
  if (evidence.playerText && compactName(evidence.playerText) === key) return { score: 1 };
  return null;
}

function sameSet(left: string, right: string): boolean {
  const a = setMatchPhrase(left);
  return Boolean(a) && a === setMatchPhrase(right);
}

function setIndex(evidence: Evidence, setBrand: string): number {
  const index = evidence.setNames.findIndex((name) => sameSet(name, setBrand));
  if (index >= 0) return index;
  if (evidence.setText && sameSet(titleCase(evidence.setText), setBrand)) return 0;
  return -1;
}

function copyrightFits(evidence: Evidence, yearLabel: string): boolean {
  const start = startYear(yearLabel);
  const copyright = Number(evidence.copyrightYear);
  return start != null && Boolean(copyright) && (copyright === start || copyright === start + 1);
}

function identityScore(evidence: Evidence, card: Candidate): number {
  let score = 0;
  const hit = playerHit(evidence, card.playerName);
  if (hit) score += 40 * hit.score;
  if (evidence.yearLabel) score += sameSeason(card.yearLabel, evidence.yearLabel) ? 20 : -20;
  else if (copyrightFits(evidence, card.yearLabel)) score += 6;
  const set = setIndex(evidence, card.setBrand);
  if (evidence.setNames.length > 0 || evidence.setText) score += set === 0 ? 20 : set > 0 ? 12 : -10;
  if (evidence.cardNumber) {
    score += cardNumberKey(evidence.cardNumber) === cardNumberKey(card.cardNumber) ? 25 : -25;
  }
  if (evidence.isRookie && card.isRookie) score += 3;
  // The card prints an insert (Instinct): a base catalog row without it is a different card.
  if (evidence.insert && card.catalogId != null) {
    const insert = parallelMatchKey(evidence.insert);
    if (![...card.rowsByParallel.keys()].some((key) => key.includes(insert))) score -= 8;
  }
  return score;
}

type ParallelPick = {
  parallel: string;
  sureness: FieldSureness;
  serialRun: number | null;
  options: ProductParallel[];
  source?: "card" | "sales";
};

const COLOR_WORDS = new Set(["red", "pink", "magenta", "fuchsia", "purple", "blue", "aqua", "green", "yellow", "orange", "gold", "black", "silver", "bronze", "white"]);

/** "PINK RED" → "Pink/Red" (colors only, the way eBay lists them); "GREEN REFRACTOR" → "Green Refractor". */
export function parallelLabel(colorWords: readonly string[]): string {
  const list = colorWords.flatMap((phrase) => words(phrase));
  // One parallel with its own name, not three colors.
  if (list.filter((word) => word !== "and").join(" ") === "red white blue") return "Red White & Blue";
  if (list.length >= 2 && list.every((word) => COLOR_WORDS.has(word))) return list.map((word) => titleCase(word)).join("/");
  return titleCase(list.join(" "));
}

function checklistFor(
  products: readonly ProductRecord[] | null,
  card: Pick<Candidate, "sport" | "yearLabel" | "setBrand">,
): ProductParallel[] {
  const listed = products?.length ? parallelsIn(products, card.sport, card.yearLabel, card.setBrand) : [];
  if (listed.length > 0) return listed;
  return parallelsForSet(card.setBrand).map((name) => ({ name, serialRun: null }));
}

/** The parallel's own words all appear in what the card showed. */
function namedBy(option: ProductParallel, shown: readonly string[]): boolean {
  const own = words(parallelMatchKey(option.name));
  return own.length > 0 && own.every((word) => shown.includes(word));
}

function longestNamed(options: ProductParallel[], shown: readonly string[]): ProductParallel[] {
  const named = options.filter((option) => namedBy(option, shown));
  if (named.length <= 1) return named;
  const longest = Math.max(...named.map((option) => words(option.name).length));
  return named.filter((option) => words(option.name).length === longest);
}

/** Finishes a base chrome card already looks like: the border can't tell them apart. */
const CHROME_FINISH = new Set(["SILVER", "REFRACTOR", "HOLO", "PRIZM", "CHROME", "SHIMMER", "MOJO"]);

/**
 * The color every sold listing with this print run names ("GREEN" from
 * "Green Refractor /99" and "Green 61/99"), or "" when they don't agree or
 * none names one. One listing that disagrees leaves it open.
 */
function titleColor(titles: readonly TitleFacts[], run: number | null, border: string | null = null): string {
  const named = titles
    .filter((item) => item.colors.length > 0 && (run == null ? item.runs.length === 0 : item.runs.includes(run)))
    .map((item) => item.colors.flatMap((phrase) => phrase.split(" ")));
  if (named.length === 0) return "";
  // Most of the sales name one parallel: that's it (Pink/Red /299, with one Base /299 listing that's mislabeled).
  const groups = new Map<string, { words: string[]; count: number }>();
  for (const list of named) {
    const key = [...new Set(list)].sort().join(" ");
    const group = groups.get(key) ?? { words: [...new Set(list)], count: 0 };
    group.count += 1;
    groups.set(key, group);
  }
  const ranked = [...groups.values()].sort((a, b) => b.count - a.count);
  if (ranked[0].count >= 2 && ranked[0].count * 2 > named.length) return ranked[0].words.join(" ");
  // All of them share a color: that much is sure (Green from "Green Refractor" and "Green").
  const shared = named[0].filter((word) => named.every((list) => list.includes(word)));
  if (shared.length > 0) return [...new Set(shared)].join(" ");
  // The titles offer a few parallels at this run: the border's color picks one, only when exactly one fits.
  if (border) {
    // A chrome finish (Silver, Refractor, Holo, Prizm) is never told from the border: base chrome looks the same.
    const fits = ranked.filter(
      (group) =>
        !group.words.some((word) => CHROME_FINISH.has(word.toUpperCase())) &&
        group.words.some((word) => word.toLowerCase() === border.toLowerCase()),
    );
    if (fits.length === 1) return fits[0].words.join(" ");
  }
  return "";
}

/** The one print run the sold titles naming this parallel agree on, or null. */
function titleRunFor(titles: readonly TitleFacts[], parallel: string): number | null {
  const own = words(parallel);
  const runs = new Set<number>();
  for (const item of titles) {
    const shown = item.colors.flatMap((phrase) => words(phrase));
    if (!own.every((word) => shown.includes(word))) continue;
    if (item.runs.length !== 1) return null;
    runs.add(item.runs[0]);
  }
  return runs.size === 1 ? [...runs][0] : null;
}

function pickParallel(evidence: Evidence, checklist: ProductParallel[], titles: readonly TitleFacts[] = []): ParallelPick {
  const runOf = (option: ProductParallel | undefined) => option?.serialRun ?? null;

  if (evidence.slab) {
    // A serial stamped on the label ("432/499", "/99") is the card's run.
    const labelRun = evidence.serial ? Number(evidence.serial.run) : null;
    if (evidence.parallelWords.length === 0) {
      // A numbered card is never Base: with no parallel named, it stays open.
      if (labelRun != null) return { parallel: "", sureness: "unsure", serialRun: labelRun, options: [] };
      const base = checklist.find((option) => parallelMatchKey(option.name) === "base") ?? { name: "Base", serialRun: null };
      return { parallel: "Base", sureness: "sure", serialRun: null, options: [base] };
    }
    const named = longestNamed(checklist, evidence.parallelWords);
    if (named.length === 1) {
      return { parallel: named[0].name, sureness: "sure", serialRun: labelRun ?? runOf(named[0]), options: named };
    }
    // Printed on the label, but not a parallel our lists know: keep the label's words.
    const printed = titleCase(evidence.parallelWords.join(" "));
    return { parallel: printed, sureness: "likely", serialRun: labelRun, options: [{ name: printed, serialRun: labelRun }] };
  }

  const run = evidence.serial ? Number(evidence.serial.run) : null;
  // A color word printed on the card wins. Otherwise a clear sold title for this print run can pin one.
  const printedColor = evidence.parallelWords.length > 0;
  // Sold titles may pick a parallel only for a card with a read print run. An unnumbered card's
  // base can look like its Silver/Refractor (Prizm, Optic, Select, Mosaic), so titles never flip it.
  const soldColor = run != null ? titleColor(titles, run, evidence.border) : "";

  // A printed insert is the card's own name (Instinct), not a guess. Its color comes from the card or a sold title.
  if (evidence.insert) {
    const color = printedColor ? titleCase(evidence.parallelWords.join(" ")) : soldColor ? parallelLabel([soldColor]) : "";
    const name = color ? `${evidence.insert} ${color}` : evidence.insert;
    const options: ProductParallel[] = [{ name, serialRun: run }];
    if (name !== evidence.insert) options.push({ name: evidence.insert, serialRun: run });
    return { parallel: name, sureness: "likely", serialRun: run, options };
  }

  const fitsRun = run == null ? checklist : checklist.filter((option) => option.serialRun === run || option.runVaries);
  if (run != null && fitsRun.length === 1) {
    return { parallel: fitsRun[0].name, sureness: "sure", serialRun: run, options: fitsRun };
  }
  const named = longestNamed(fitsRun, evidence.parallelWords);
  if (named.length === 1) {
    return { parallel: named[0].name, sureness: "likely", serialRun: run ?? runOf(named[0]), options: named };
  }
  // The card prints its parallel ("REFRACTOR" on the back) and its run, and our list has no runs
  // for this set: the printed word is the parallel when it names exactly one on the list.
  if (run != null && fitsRun.length === 0 && printedColor) {
    const printedOnCard = longestNamed(checklist, evidence.parallelWords);
    if (printedOnCard.length === 1 && parallelMatchKey(printedOnCard[0].name) !== "base") {
      const option = { name: printedOnCard[0].name, serialRun: run };
      return { parallel: option.name, sureness: "likely", serialRun: run, options: [option], source: "card" };
    }
  }
  if (!printedColor && soldColor && named.length === 0) {
    const fromList = longestNamed(fitsRun.length > 0 ? fitsRun : checklist, words(soldColor));
    const pinned = fromList.length === 1 ? fromList[0].name : parallelLabel([soldColor]);
    return { parallel: pinned, sureness: "likely", serialRun: run, options: [{ name: pinned, serialRun: run }], source: "sales" };
  }
  // A numbered card is never Base, and with no checklist run that fits, any color would be a guess:
  // leave it open with no chips. The print run the card showed still shows on the sheet.
  const pool = run != null && fitsRun.length === 0 ? [] : fitsRun;
  const ordered = [
    ...named,
    ...pool.filter((option) => !named.includes(option) && parallelMatchKey(option.name) === "base"),
    ...pool.filter((option) => !named.includes(option) && parallelMatchKey(option.name) !== "base"),
  ];
  return { parallel: "", sureness: "unsure", serialRun: run, options: ordered.slice(0, MAX_PARALLEL_OPTIONS) };
}

function sureness(evidence: Evidence, card: Candidate, parallel: ParallelPick): ScanMatch["sureness"] {
  const hit = playerHit(evidence, card.playerName);
  const inDirectory = evidence.players.some((item) => compactName(item.name) === compactName(card.playerName));
  const printedOnly = !evidence.slab && !inDirectory && !evidence.playerBothSides;
  const player: FieldSureness =
    !hit ? "unsure" : hit.score === 1 && (inDirectory || !evidence.slab) && !printedOnly ? "sure" : "likely";
  const year: FieldSureness =
    evidence.yearLabel && sameSeason(card.yearLabel, evidence.yearLabel)
      ? "sure"
      : copyrightFits(evidence, card.yearLabel)
        ? "likely"
        : "unsure";
  const index = setIndex(evidence, card.setBrand);
  const set: FieldSureness =
    index < 0 ? "unsure" : evidence.slab && !evidence.setText ? "sure" : index === 0 ? "likely" : "unsure";
  const number: FieldSureness =
    evidence.cardNumber && cardNumberKey(evidence.cardNumber) === cardNumberKey(card.cardNumber) ? "sure" : "unsure";
  return { player, year, set, number, parallel: parallel.sureness };
}

function synthesized(evidence: Evidence): Candidate | null {
  const playerName = bestPlayerName(evidence);
  if (!playerName) return null;
  const setBrand = evidence.setNames[0] ?? (evidence.setText ? titleCase(evidence.setText) : "");
  // No year on the front: the back's © year is usually the card's year (marked likely, not sure).
  const year = evidence.yearLabel || (evidence.slab ? "" : evidence.copyrightYear);
  // A clearly printed name with a print run still shows the player, with the set and number open.
  if (!year && !setBrand && !evidence.cardNumber && !(evidence.playerLocked && evidence.serial)) return null;
  const sport = evidence.players[0]?.sport ?? evidence.sport;
  return {
    catalogId: null,
    playerName,
    sport,
    yearLabel: seasonFor(sport, year, setBrand),
    setBrand,
    cardNumber: evidence.cardNumber,
    isRookie: evidence.isRookie,
    rowsByParallel: new Map(),
  };
}

/** Every field the card showed agrees with this catalog card. */
function covers(card: Candidate, built: Candidate): boolean {
  if (compactName(card.playerName) !== compactName(built.playerName)) return false;
  if (built.yearLabel && !sameSeason(card.yearLabel, built.yearLabel)) return false;
  if (built.setBrand && !sameSet(card.setBrand, built.setBrand)) return false;
  if (built.cardNumber && cardNumberKey(card.cardNumber) !== cardNumberKey(built.cardNumber)) return false;
  return true;
}

function candidatesFrom(rows: readonly CatalogCard[], evidence: Evidence): Candidate[] {
  const byIdentity = new Map<string, Candidate>();
  for (const row of rows) {
    if (!playerHit(evidence, row.playerName)) continue;
    // A row whose number is a catalog SKU is junk: it never shows, not even as an alternative.
    if (looksLikeCatalogSku(row.cardNumber)) continue;
    const key = identityKey(row);
    let card = byIdentity.get(key);
    if (!card) {
      card = {
        catalogId: row.id,
        playerName: row.playerName,
        sport: row.sport,
        yearLabel: row.yearLabel,
        setBrand: row.setBrand,
        cardNumber: row.cardNumber,
        isRookie: row.isRookie === true,
        rowsByParallel: new Map(),
      };
      byIdentity.set(key, card);
    }
    const parallelKey = parallelMatchKey(row.parallel || "Base");
    if (!card.rowsByParallel.has(parallelKey)) card.rowsByParallel.set(parallelKey, row.id);
    if (parallelKey === "base") card.catalogId = row.id;
  }
  const candidates = [...byIdentity.values()];
  const built = synthesized(evidence);
  // A printed insert (Instinct) is its own card: a base catalog row doesn't cover it.
  const coveredBy = (card: Candidate) => covers(card, built!) && (!evidence.insert || card.catalogId == null);
  if (built && !candidates.some(coveredBy)) candidates.push(built);
  return candidates;
}

/**
 * Cards named by cached sold listings for the player the card prints. The
 * title gives the year, set, card # and print run, so a card our catalog
 * doesn't have (a Mosaic, an insert) can still be found. Only titles with that
 * player's name count, and only ones that name a year and a set.
 */
function titleCandidates(
  evidence: Evidence,
  titles: readonly SoldTitle[],
  directory: readonly IndexedDirectoryPlayer[],
): Candidate[] {
  const playerName = bestPlayerName(evidence);
  if (!playerName) return [];
  const sport = evidence.players[0]?.sport ?? evidence.sport;
  const printedNumber = cardNumberKey(evidence.cardNumber);
  const printedRun = evidence.serial ? Number(evidence.serial.run) : null;

  // Every title for this player (and the printed # and run, when read), with or without a year or a set.
  const parsed = titles
    .slice(0, MAX_SOLD_TITLES)
    .map((sold) => (typeof sold?.title === "string" ? sold.title.trim() : ""))
    .filter((title) => title && !TITLE_LOT.test(title) && titleNamesPlayer(title, playerName))
    .map((title) => {
      const read = readRawCardText([title], directory);
      return { title, read, number: cardNumberKey(read.cardNumber), runs: titleRuns(title) };
    })
    .filter((item) => (!printedNumber || !item.number || item.number === printedNumber))
    .filter((item) => printedRun == null || item.runs.length === 0 || item.runs.includes(printedRun));

  // A seller's bare "Topps" is the maker, not the set, when the card is a Bowman one: a Bowman-only
  // code (BP-27) or any matching title that names Bowman.
  const bowmanCard = (number: string) =>
    BOWMAN_ONLY_PREFIXES.has(/^([a-z]+)-/.exec(number)?.[1]?.toUpperCase() ?? "") ||
    parsed.some((item) => item.number === number && item.read.setNames.some((name) => /^bowman/i.test(name)));
  const titleSet = (item: (typeof parsed)[number]) => {
    const set = item.read.setNames[0] ?? "";
    if (BARE_MAKER_SET.has(set) && bowmanCard(item.number || printedNumber)) return "";
    return set;
  };

  const groups = new Map<string, { set: string; number: string; years: Map<string, number>; isRookie: boolean }>();
  for (const item of parsed) {
    const set = titleSet(item);
    if (!set) continue;
    const key = `${setMatchPhrase(set)}|${item.number}`;
    const group = groups.get(key) ?? { set, number: item.read.cardNumber, years: new Map(), isRookie: false };
    if (item.read.yearLabel) group.years.set(item.read.yearLabel, (group.years.get(item.read.yearLabel) ?? 0) + 1);
    if (item.read.isRookie) group.isRookie = true;
    groups.set(key, group);
  }

  // No title names a set ("Aidan Miller Pink/Red /299 BP-27"): they still count toward the parallel of
  // the card the scan built, for its # and run.
  if (groups.size === 0) return [];
  return [...groups.values()].map((group) => {
    // The year most titles give; titles that skip it still count toward everything else.
    const year = [...group.years.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? (evidence.yearLabel || evidence.copyrightYear);
    const number = cardNumberKey(group.number);
    // Agreement is counted across ALL matching titles for this card: no year, no set, or a maker's
    // bare name on a Bowman card all count; a title naming another set doesn't.
    const facts = parsed
      .filter((item) => !number || !item.number || item.number === number)
      .filter((item) => {
        const set = titleSet(item);
        return !set || sameSet(set, group.set);
      })
      .map((item) => ({ runs: item.runs, colors: item.read.parallelWords, insert: item.read.insert }));
    return {
      catalogId: null,
      playerName,
      sport,
      yearLabel: seasonFor(sport, year, group.set),
      setBrand: group.set,
      cardNumber: group.number,
      isRookie: group.isRookie,
      rowsByParallel: new Map(),
      titles: facts,
    };
  });
}

/** How far an OCR'd print run can be from the run sold titles agree on (/298 for /299). */
const RUN_MISREAD = 2;

/**
 * The read print run when a sold title backs it. When none does but 2+ titles for this player
 * (and card #, when read) agree on one run within 2 of it, the titles' run: OCR misread a digit.
 * The read run then counts as unsure.
 */
function withAgreedRun(evidence: Evidence, titles: readonly SoldTitle[], directory: readonly IndexedDirectoryPlayer[]): Evidence {
  const playerName = bestPlayerName(evidence);
  if (!evidence.serial || !playerName || titles.length === 0) return evidence;
  const read = Number(evidence.serial.run);
  if (!Number.isInteger(read) || read <= 0) return evidence;
  const printedNumber = cardNumberKey(evidence.cardNumber);
  const runs = titles
    .slice(0, MAX_SOLD_TITLES)
    .map((sold) => (typeof sold?.title === "string" ? sold.title.trim() : ""))
    .filter((title) => title && !TITLE_LOT.test(title) && titleNamesPlayer(title, playerName))
    .filter((title) => !printedNumber || cardNumberKey(readRawCardText([title], directory).cardNumber) === printedNumber)
    .map((title) => titleRuns(title));
  if (runs.some((list) => list.includes(read))) return evidence;
  const counts = new Map<number, number>();
  for (const list of runs) {
    for (const run of new Set(list)) if (run !== read && Math.abs(run - read) <= RUN_MISREAD) counts.set(run, (counts.get(run) ?? 0) + 1);
  }
  const agreed = [...counts.entries()].filter(([, count]) => count >= 2);
  if (agreed.length !== 1) return evidence;
  return { ...evidence, serial: { ...evidence.serial, run: String(agreed[0][0]) }, runUnsure: true };
}

/** Facts from matching titles that name no set and no other card #, for the card the scan built. */
function looseTitleFacts(
  evidence: Evidence,
  titles: readonly SoldTitle[],
  directory: readonly IndexedDirectoryPlayer[],
): TitleFacts[] {
  const playerName = bestPlayerName(evidence);
  const printedNumber = cardNumberKey(evidence.cardNumber);
  if (!playerName || !printedNumber) return [];
  const printedRun = evidence.serial ? Number(evidence.serial.run) : null;
  return titles
    .slice(0, MAX_SOLD_TITLES)
    .map((sold) => (typeof sold?.title === "string" ? sold.title.trim() : ""))
    .filter((title) => title && !TITLE_LOT.test(title) && titleNamesPlayer(title, playerName))
    .map((title) => ({ title, read: readRawCardText([title], directory), runs: titleRuns(title) }))
    .filter((item) => cardNumberKey(item.read.cardNumber) === printedNumber && item.read.setNames.length === 0)
    .filter((item) => printedRun == null || item.runs.includes(printedRun))
    .map((item) => ({ runs: item.runs, colors: item.read.parallelWords, insert: item.read.insert }));
}

/** Catalog and sold-listing candidates for the same card become one, keeping the catalog row. */
function mergeTitleCandidates(candidates: Candidate[], fromTitles: Candidate[]): Candidate[] {
  const out = [...candidates];
  for (const card of fromTitles) {
    const key = identityKey(card);
    const same = out.find((item) => identityKey(item) === key);
    if (same) same.titles = [...(same.titles ?? []), ...(card.titles ?? [])];
    else out.unshift(card);
  }
  return out;
}

/** How much the cached sold listings back this card: more listings, a matching print run, the printed insert. */
function titleScore(evidence: Evidence, card: Candidate): number {
  const titles = card.titles ?? [];
  if (titles.length === 0) return 0;
  let score = Math.min(TITLE_SUPPORT_MAX, TITLE_SUPPORT * titles.length);
  const run = evidence.serial ? Number(evidence.serial.run) : null;
  if (run != null) {
    if (titles.some((item) => item.runs.includes(run))) score += 12;
    else if (titles.every((item) => item.runs.length > 0)) score -= 6;
  }
  if (evidence.insert) {
    score += titles.some((item) => item.insert === evidence.insert) ? 10 : -6;
  }
  return score;
}

export function rankScanMatches(
  read: ScanRead,
  rows: readonly CatalogCard[],
  options: RankOptions,
): ScanMatchResult {
  const evidence = withAgreedRun(evidenceFrom(read, options.directory), options.soldTitles ?? [], options.directory);
  const fromTitles = evidence.slab && !bestPlayerName(evidence) ? [] : titleCandidates(evidence, options.soldTitles ?? [], options.directory);
  const merged = mergeTitleCandidates(candidatesFrom(rows, evidence), fromTitles);
  if (fromTitles.length === 0 && !(evidence.slab && !bestPlayerName(evidence))) {
    const loose = looseTitleFacts(evidence, options.soldTitles ?? [], options.directory);
    for (const card of merged) {
      if (!card.titles?.length && card.playerName === bestPlayerName(evidence)) card.titles = loose;
    }
  }
  const scored = merged.map((card) => {
    const parallel = pickParallel(evidence, checklistFor(options.products, card), card.titles);
    // A slab label prints no run: when every sold title for this parallel names the same one, use it.
    if (parallel.serialRun == null && parallel.parallel && card.titles?.length) {
      parallel.serialRun = titleRunFor(card.titles, parallel.parallel);
    }
    const parallelBonus = parallel.sureness === "sure" ? 10 : parallel.sureness === "likely" ? 5 : 0;
    const rowId = parallel.parallel ? card.rowsByParallel.get(parallelMatchKey(parallel.parallel)) : undefined;
    const match: ScanMatch = {
      catalogId: rowId ?? card.catalogId,
      playerName: card.playerName,
      sport: card.sport,
      yearLabel: card.yearLabel,
      setBrand: card.setBrand,
      cardNumber: card.cardNumber,
      parallel: parallel.parallel,
      serialRun: parallel.serialRun,
      serialNo: evidence.serial?.number ?? "",
      isRookie: card.isRookie || evidence.isRookie,
      isAuto: evidence.isAuto,
      grade: evidence.grade,
      score: identityScore(evidence, card) + titleScore(evidence, card) + parallelBonus,
      sureness: sureness(evidence, card, parallel),
      parallelOptions: parallel.options,
      ...(parallel.source ? { parallelSource: parallel.source } : {}),
      ...(evidence.runUnsure ? { runUnsure: true } : {}),
    };
    return match;
  });

  // The card printed this player's name: never show anyone else.
  const locked = evidence.playerLocked ? compactName(bestPlayerName(evidence)) : "";
  const matches = scored
    .filter((match) => !locked || compactName(match.playerName) === locked)
    .sort((a, b) => b.score - a.score || Number(b.catalogId != null) - Number(a.catalogId != null))
    .slice(0, MAX_MATCHES);
  const top = matches[0];
  const settled = Boolean(
    top &&
      top.sureness.player !== "unsure" &&
      (evidence.slab || top.sureness.player === "sure") &&
      top.sureness.year !== "unsure" &&
      top.sureness.set !== "unsure" &&
      top.sureness.number === "sure" &&
      top.sureness.parallel === "sure",
  );
  return { matches, settled };
}

export type MatchScanDeps = {
  directory: readonly IndexedDirectoryPlayer[];
  /** search_cards. Null means the search failed; the card's own read still counts. */
  search: (query: string, signal: AbortSignal) => Promise<CatalogCard[] | null>;
  /** Checklists. A failure falls back to the per-set lists. */
  products: () => Promise<readonly ProductRecord[]>;
  /**
   * Cached eBay sold listings (sold_comps_cache) whose titles name this player.
   * A cache read only: never Trawl, never a live eBay search. Null on failure.
   */
  soldTitles?: (playerName: string, signal: AbortSignal) => Promise<SoldTitle[] | null>;
  signal: AbortSignal;
};

/** Searches the catalog (at most 2 calls) and ranks. Null once aborted, e.g. by a retake. */
export async function matchScan(read: ScanRead, deps: MatchScanDeps): Promise<ScanMatchResult | null> {
  const rows = new Map<string, CatalogCard>();
  for (const query of catalogQueriesFor(read, deps.directory)) {
    if (deps.signal.aborted) return null;
    const found = await deps.search(query, deps.signal);
    if (deps.signal.aborted) return null;
    for (const row of found ?? []) rows.set(row.id, row);
  }
  let soldTitles: SoldTitle[] | null = null;
  const player = bestPlayerName(evidenceFrom(read, deps.directory));
  if (player && deps.soldTitles) {
    try {
      soldTitles = await deps.soldTitles(player, deps.signal);
    } catch {
      soldTitles = null;
    }
    if (deps.signal.aborted) return null;
  }
  let products: readonly ProductRecord[] | null = null;
  try {
    products = await deps.products();
  } catch {
    products = null;
  }
  if (deps.signal.aborted) return null;
  return rankScanMatches(read, [...rows.values()], { directory: deps.directory, products, soldTitles });
}

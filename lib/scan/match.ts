import type { CatalogCard } from "@/lib/card-catalog";
import { parallelMatchKey, parallelsForSet } from "@/lib/cards/parallels";
import { parallelsIn, sameSeason, type ProductParallel, type ProductRecord } from "@/lib/cards/product-data";
import { setMatchPhrase } from "@/lib/comps/match";
import type { IndexedDirectoryPlayer } from "@/lib/players/types";
import { compactNorm, normInterest } from "@/lib/social/follow-rank";
import { findPlayers, type RawCardRead, type RawPlayerHit } from "./raw-text";
import type { SlabLabelRead } from "./slab-label";

/**
 * Checks a scan's read (slab label, or raw card front and back) against our
 * catalog and parallel checklists, and ranks up to 3 cards.
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
  | { kind: "raw"; front: RawCardRead; back?: RawCardRead | null };

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
};

export type ScanMatchResult = {
  matches: ScanMatch[];
  /** The top match is settled on the phone: no AI step needed. */
  settled: boolean;
  /** What was read, as a text key (lib/scan/fixes.ts). Lets a fix be recorded and learned from. */
  readKey?: string;
};

export type RankOptions = {
  directory: readonly IndexedDirectoryPlayer[];
  /** Checklists. Null or empty falls back to the per-set parallel lists. */
  products: readonly ProductRecord[] | null;
};

const MAX_MATCHES = 3;
const MAX_PARALLEL_OPTIONS = 8;

/** Label words that mark an autograph or rookie, not a parallel. */
const FLAG_WORDS = new Set(["rookie", "rc", "auto", "autos", "autograph", "autographs", "autographed"]);

type Evidence = {
  slab: boolean;
  players: RawPlayerHit[];
  /** A slab's printed player name, used when the directory doesn't know it. */
  playerText: string;
  yearLabel: string;
  copyrightYear: string;
  setNames: string[];
  /** A slab's printed set when it isn't one of SETS. */
  setText: string;
  cardNumber: string;
  serial: { number: string; run: string } | null;
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
    .replace(/(^|[\s-])([a-z])/g, (_match, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`);
}

function cardNumberKey(value: string): string {
  return value.replace(/^#/, "").trim().toLowerCase();
}

function startYear(label: string): number | null {
  const match = label.trim().match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}

/** PSA prints 2018 for a 2018-19 basketball card. Add card stores the season. */
function seasonFor(sport: string, yearLabel: string): string {
  if (!/^\d{4}$/.test(yearLabel)) return yearLabel;
  if (sport !== "Basketball" && sport !== "Hockey") return yearLabel;
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
      yearLabel: label.yearLabel,
      copyrightYear: "",
      setNames: label.setName ? [label.setName] : [],
      setText: label.setName ? "" : label.setText,
      cardNumber: label.cardNumber,
      serial: null,
      parallelWords: variety.filter((word) => !FLAG_WORDS.has(word)),
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
  const players: RawPlayerHit[] = [];
  for (const hit of sides.flatMap((side) => side.players)) {
    const seen = players.find((item) => item.name === hit.name && item.sport === hit.sport);
    if (!seen) players.push(hit);
    else if (hit.score > seen.score) seen.score = hit.score;
  }
  players.sort((a, b) => b.score - a.score);
  const setNames: string[] = [];
  for (const name of sides.flatMap((side) => side.setNames)) if (!setNames.includes(name)) setNames.push(name);
  const parallelWords: string[] = [];
  for (const phrase of sides.flatMap((side) => side.parallelWords)) {
    for (const word of words(phrase)) if (!parallelWords.includes(word)) parallelWords.push(word);
  }
  // The back is where the card # lives. A front number is usually something else.
  const backNumber = read.back?.cardNumber ?? "";
  return {
    slab: false,
    players,
    playerText: "",
    yearLabel: sides.map((side) => side.yearLabel).find(Boolean) ?? "",
    copyrightYear: sides.map((side) => side.copyrightYear).find(Boolean) ?? "",
    setNames,
    setText: "",
    cardNumber: backNumber || read.front.cardNumber,
    serial: sides.map((side) => side.serial).find(Boolean) ?? null,
    parallelWords,
    isRookie: sides.some((side) => side.isRookie),
    isAuto: false,
    grade: null,
  };
}

function bestPlayerName(evidence: Evidence): string {
  return evidence.players[0]?.name ?? (evidence.playerText ? titleCase(evidence.playerText) : "");
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
};

export function identityKey(card: { playerName: string; yearLabel: string; setBrand: string; cardNumber: string }): string {
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
  return score;
}

type ParallelPick = {
  parallel: string;
  sureness: FieldSureness;
  serialRun: number | null;
  options: ProductParallel[];
};

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

function pickParallel(evidence: Evidence, checklist: ProductParallel[]): ParallelPick {
  const runOf = (option: ProductParallel | undefined) => option?.serialRun ?? null;

  if (evidence.slab) {
    if (evidence.parallelWords.length === 0) {
      const base = checklist.find((option) => parallelMatchKey(option.name) === "base") ?? { name: "Base", serialRun: null };
      return { parallel: "Base", sureness: "sure", serialRun: null, options: [base] };
    }
    const named = longestNamed(checklist, evidence.parallelWords);
    if (named.length === 1) {
      return { parallel: named[0].name, sureness: "sure", serialRun: runOf(named[0]), options: named };
    }
    // Printed on the label, but not a parallel our lists know: keep the label's words.
    const printed = titleCase(evidence.parallelWords.join(" "));
    return { parallel: printed, sureness: "likely", serialRun: null, options: [{ name: printed, serialRun: null }] };
  }

  const run = evidence.serial ? Number(evidence.serial.run) : null;
  const fitsRun = run == null ? checklist : checklist.filter((option) => option.serialRun === run || option.runVaries);
  if (run != null && fitsRun.length === 1) {
    return { parallel: fitsRun[0].name, sureness: "sure", serialRun: run, options: fitsRun };
  }
  const named = longestNamed(fitsRun, evidence.parallelWords);
  if (named.length === 1) {
    return { parallel: named[0].name, sureness: "likely", serialRun: run ?? runOf(named[0]), options: named };
  }
  const ordered = [
    ...named,
    ...fitsRun.filter((option) => !named.includes(option) && parallelMatchKey(option.name) === "base"),
    ...fitsRun.filter((option) => !named.includes(option) && parallelMatchKey(option.name) !== "base"),
  ];
  return { parallel: "", sureness: "unsure", serialRun: run, options: ordered.slice(0, MAX_PARALLEL_OPTIONS) };
}

function sureness(evidence: Evidence, card: Candidate, parallel: ParallelPick): ScanMatch["sureness"] {
  const hit = playerHit(evidence, card.playerName);
  const inDirectory = evidence.players.some((item) => compactName(item.name) === compactName(card.playerName));
  const player: FieldSureness = !hit ? "unsure" : hit.score === 1 && (inDirectory || !evidence.slab) ? "sure" : "likely";
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
  if (!evidence.yearLabel && !setBrand && !evidence.cardNumber) return null;
  const sport = evidence.players[0]?.sport ?? "";
  return {
    catalogId: null,
    playerName,
    sport,
    yearLabel: seasonFor(sport, evidence.yearLabel),
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
  if (built && !candidates.some((card) => covers(card, built))) candidates.push(built);
  return candidates;
}

export function rankScanMatches(
  read: ScanRead,
  rows: readonly CatalogCard[],
  options: RankOptions,
): ScanMatchResult {
  const evidence = evidenceFrom(read, options.directory);
  const scored = candidatesFrom(rows, evidence).map((card) => {
    const parallel = pickParallel(evidence, checklistFor(options.products, card));
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
      score: identityScore(evidence, card) + parallelBonus,
      sureness: sureness(evidence, card, parallel),
      parallelOptions: parallel.options,
    };
    return match;
  });

  const matches = scored
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
  let products: readonly ProductRecord[] | null = null;
  try {
    products = await deps.products();
  } catch {
    products = null;
  }
  if (deps.signal.aborted) return null;
  return rankScanMatches(read, [...rows.values()], { directory: deps.directory, products });
}

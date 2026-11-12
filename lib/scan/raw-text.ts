import { SETS, parseYearLabel } from "@/lib/card-options";
import { POPULAR_INSERTS, insertKey } from "@/lib/cards/data/popular-inserts";
import type { IndexedDirectoryPlayer } from "@/lib/players/types";
import { compactNorm, normInterest } from "@/lib/social/follow-rank";

/**
 * Reads OCR lines from the front or back of a raw card: the player (from the
 * bundled directory, forgiving OCR slips), year, card #, serial number,
 * rookie mark, set words, parallel words and popular inserts.
 * Pure: the caller passes the directory. The matcher checks all of it
 * against the catalog and checklists later, so this only reports what it saw.
 */

export type RawPlayerHit = {
  name: string;
  sport: string;
  team?: string;
  /** 1 for an exact name match, lower for a near match. */
  score: number;
  /** The OCR text the name was read from. */
  line: string;
  /** The line is the name and nothing else: the card's nameplate, not a word in the background or the bio. */
  nameplate?: boolean;
};

export type RawCardRead = {
  /** Up to 3, best first. Empty when no full name was read. */
  players: RawPlayerHit[];
  /**
   * A line that reads as a person's name on its own (a nameplate), title-cased,
   * even when the directory doesn't know the player yet (new prospects). "" when none.
   */
  printedName: string;
  /** A team line on the card, from the directory's teams. Gives the sport when the player is new to us. */
  team: { name: string; sport: string } | null;
  /** "2023-24" or "2017", only when printed next to a brand. */
  yearLabel: string;
  /** The © year on a back. Often the release year, not the card year. */
  copyrightYear: string;
  /** Without the leading # or NO. Also a printed code such as BP-27 or INS-13. */
  cardNumber: string;
  /** A stamped serial such as 12/99. */
  serial: { number: string; run: string } | null;
  isRookie: boolean;
  /** Up to 3 names from SETS, best first. */
  setNames: string[];
  /** Color and finish words, such as REFRACTOR or CRACKED ICE. */
  parallelWords: string[];
  /** A popular insert named on the card, such as Kaboom. */
  insert: string;
  side: "front" | "back" | "unknown";
  /** The cleaned lines the read used. */
  lines: string[];
};

const MAX_LINES = 60;
const MAX_LINE_LENGTH = 200;
const MAX_PLAYERS = 3;
const MAX_SETS = 3;
const MAX_GRAM_WORDS = 4;
/** Shorter names need an exact match, because a near match is too often someone else. */
const FUZZY_MIN_LENGTH = 6;
/** Near matches are tried on 2 and 3 word runs. Longer runs only match exactly. */
const FUZZY_MAX_WORDS = 3;
const FUZZY_MAX_LENGTH = 28;

const PARALLEL_WORDS = [
  // A Donruss parallel family (Optic Preview Pink), not the Donruss Optic set.
  "OPTIC PREVIEW",
  "CRACKED ICE",
  "MAGENTA",
  "FUCHSIA",
  "AQUA",
  "YELLOW",
  "BRONZE",
  "GOLD VINYL",
  "SUPERFRACTOR",
  "X-FRACTOR",
  "XFRACTOR",
  "REFRACTOR",
  "SILVER",
  "GOLD",
  "RED",
  "BLUE",
  "GREEN",
  "ORANGE",
  "PURPLE",
  "PINK",
  "BLACK",
  "HOLO",
  "MOJO",
  "WAVE",
  "SHIMMER",
  "SCOPE",
  "HYPER",
  "LAZER",
  "LASER",
  "ATOMIC",
  "SAPPHIRE",
  "SPECKLE",
  "DISCO",
  "TIGER",
  "SNAKESKIN",
  "CAMO",
  "VELOCITY",
  "PULSAR",
  "NEON",
] as const;

/** Set words too common to name a set on their own. */
const GENERIC_SET_WORDS = new Set(["panini", "topps", "bowman", "upper", "deck", "series", "1", "2", "draft", "picks", "s", "the"]);

/** Words a back prints and a front rarely does. */
const BACK_WORDS = new Set([
  "ht", "wt", "born", "bats", "throws", "gp", "pts", "reb", "ast", "avg", "hr", "rbi", "era", "yds", "td", "season", "career",
]);

const CARD_NUMBER = /(?:#|\bNO\.)\s*([A-Z0-9]+(?:-[A-Z0-9]+)*)/gi;
/**
 * A card # printed as a code with no # in front: BP-27 (Bowman prospects),
 * INS-13, BCP-50, TC-7. Letters, a hyphen, then digits. Heights (6-7) and
 * seasons (2024-25) have no letters in front, so they never match.
 */
const CODE_NUMBER = /\b([A-Z]{1,5}\d?)\s?[-–—‐]\s?(\d{1,4}[A-Z]?)\b/g;
/**
 * Letters that look like a code prefix but are words from a bio or a stat
 * line: "average for-4 power", "a .414", "born June-4", "round-1". Never a
 * card #. A lone A or I is an article or pronoun, not a set code.
 */
const NOT_CODE_PREFIX = new Set([
  "A", "I", "AN", "AS", "AT", "BE", "BY", "DO", "GO", "HE", "IF", "IN", "IS", "IT", "ME", "MY", "NO", "OF", "ON", "OR",
  "SO", "TO", "UP", "WE", "AGE", "ALL", "AND", "ANY", "ARE", "BUT", "CAN", "DAY", "DID", "FOR", "GOT", "HAD", "HAS",
  "HER", "HIM", "HIS", "HOW", "ITS", "LED", "MAY", "NEW", "NOT", "NOW", "OFF", "OLD", "ONE", "OUR", "OUT", "OWN",
  "PER", "PUT", "RAN", "RUN", "SAW", "SET", "SHE", "THE", "TOO", "TOP", "TRY", "TWO", "USE", "VIA", "WAS", "WAY",
  "WHO", "WHY", "WIN", "WON", "YET", "YOU", "ALSO", "BEEN", "BORN", "BOTH", "EACH", "EVEN", "FROM", "GAME", "HAVE",
  "HITS", "INTO", "JUST", "LAST", "LIKE", "MADE", "MORE", "MOST", "MUCH", "ONLY", "OVER", "SAID", "SOME", "SUCH",
  "THAN", "THAT", "THEM", "THEN", "THEY", "THIS", "TIME", "VERY", "WENT", "WERE", "WHAT", "WHEN", "WILL", "WITH",
  "YEAR", "AFTER", "AGAIN", "COULD", "EVERY", "FIRST", "GAMES", "OTHER", "ROUND", "SINCE", "THEIR", "THERE",
  "THESE", "THREE", "WHERE", "WHICH", "WHILE", "WOULD", "YEARS", "JAN", "FEB", "MAR", "APR", "JUN", "JUL", "AUG",
  "SEP", "SEPT", "OCT", "NOV", "DEC", "JUNE", "JULY", "MARCH", "APRIL",
]);
/** Checklist code prefixes we know (Bowman prospects, inserts, update). Preferred over any other code. */
const KNOWN_CODE_PREFIX = new Set([
  "BP", "BCP", "BDC", "BDP", "BPA", "CPA", "BCPA", "INS", "US", "USC", "TC", "SP", "RPA", "RA", "FS", "NBA", "TN",
  "SS", "CA", "BS", "TP", "PD",
]);
/** A sentence (five words or more) on a scanned card: a bio or a stat note, never where the card # sits. */
function proseLine(line: string): boolean {
  return line.split(/\s+/).filter((word) => /[a-z]/i.test(word)).length >= 5;
}
/** Copyright and maker lines name the company, not the set. */
const MAKER_LINE = /©|\(c\)|copyright|topps company|panini america|upper deck company/i;
/**
 * A back line that only names the maker, with or without a year or ©:
 * "2024 TOPPS", "TOPPS", "THE TOPPS COMPANY", "PANINI AMERICA, INC.". It says
 * who printed the card, not the set: a Bowman back says Topps. Fronts are
 * read as printed, so a Topps front still reads Topps.
 */
const MAKER_ONLY_LINE =
  /^(?:©|\(c\))?\s*(?:\d{4}\s*)?(?:the\s+)?(?:topps|panini|upper\s+deck|leaf)(?:\s+(?:company|co\.?|america|inc\.?|llc|international))*[\s.,]*(?:inc\.?)?\s*$/i;
/**
 * Insert marks the scanner reads, on top of the Add card popular inserts.
 * Scanner-only, so Add card's insert chips don't change.
 */
const SCAN_INSERTS = ["Instinct"] as const;
/** Words that rule a line out as a person's name. */
const NOT_NAME_WORDS = new Set([
  "rookie", "rc", "rated", "card", "cards", "1st", "first", "prospect", "prospects", "draft", "edition", "briefing",
  "company", "inc", "america", "league", "team", "all", "star", "stars", "world", "series", "finals", "mvp", "debut",
  "auto", "autograph", "autographs", "signed", "game", "used", "patch", "relic", "the", "of", "and", "now", "chrome",
  "refractor", "prizm", "mosaic", "optic", "select", "base", "insert", "parallel", "numbered", "limited", "baseball",
  "basketball", "football", "hockey", "soccer", "college", "university", "state", "pick", "picks", "round",
]);
const SERIAL = /(?<![\d/])(\d{1,4})\s*\/\s*(\d{1,4})(?![\d/])/;
const COPYRIGHT = /(?:©|\(c\)|copyright)\s*(\d{4})/i;
const MAKER_YEAR = /\b(\d{4})\b/;

/**
 * A catalog code that can't be a printed card #: a long run of digits or a
 * long code with no hyphen (CMPO73107). Card numbers look like 280, US50,
 * BP-27, INS-13 or CPA-AM. Never shown as a card #, from any source.
 */
export function looksLikeCatalogSku(value: string): boolean {
  const text = value.trim().replace(/^#/, "");
  if (!text || /[-–—]/.test(text)) return false;
  return /\d{5,}/.test(text) || (text.length >= 8 && /[a-z]/i.test(text) && /\d/.test(text));
}
const YEAR_TOKEN = /\b(\d{4}(?:\s*-\s*\d{2})?)\s+(\S+)/g;

function emptyRead(): RawCardRead {
  return {
    players: [],
    printedName: "",
    team: null,
    yearLabel: "",
    copyrightYear: "",
    cardNumber: "",
    serial: null,
    isRookie: false,
    setNames: [],
    parallelWords: [],
    insert: "",
    side: "unknown",
    lines: [],
  };
}

function cleanLines(lines: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    if (typeof raw !== "string") continue;
    const line = raw.slice(0, MAX_LINE_LENGTH).replace(/\s+/g, " ").trim();
    if (!line) continue;
    out.push(line);
    if (out.length >= MAX_LINES) break;
  }
  return out;
}

/** In a word that mixes letters and digits, 0, 1 and 5 are usually O, L and S. */
function fixOcrLetters(line: string): string {
  return line
    .split(" ")
    .map((word) =>
      /[a-z]/i.test(word) && /\d/.test(word)
        ? word.replace(/0/g, "o").replace(/1/g, "l").replace(/5/g, "s")
        : word,
    )
    .join(" ");
}

/** Edit distance, or max + 1 once it is clearly over max. */
function boundedDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      current.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length];
}

type DirectoryIndex = {
  byCompact: Map<string, IndexedDirectoryPlayer[]>;
  /** Near-match candidates by the first 2 and the last 3 letters, so one slip anywhere still finds them. */
  byHead: Map<string, IndexedDirectoryPlayer[]>;
  byTail: Map<string, IndexedDirectoryPlayer[]>;
};

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

const indexCache = new WeakMap<readonly IndexedDirectoryPlayer[], DirectoryIndex>();

function directoryIndex(directory: readonly IndexedDirectoryPlayer[]): DirectoryIndex {
  const cached = indexCache.get(directory);
  if (cached) return cached;
  const byCompact = new Map<string, IndexedDirectoryPlayer[]>();
  const byHead = new Map<string, IndexedDirectoryPlayer[]>();
  const byTail = new Map<string, IndexedDirectoryPlayer[]>();
  for (const player of directory) {
    if (!player.compact) continue;
    push(byCompact, player.compact, player);
    push(byHead, player.compact.slice(0, 2), player);
    push(byTail, player.compact.slice(-3), player);
  }
  const index = { byCompact, byHead, byTail };
  indexCache.set(directory, index);
  return index;
}

type Gram = { words: string[]; line: string };

/** 2 to 4 word runs from each line, and runs that cross into the next line. */
function nameGrams(lines: string[]): Gram[] {
  const tokens = lines.map((line) => normInterest(fixOcrLetters(line)).split(" ").filter(Boolean));
  const grams: Gram[] = [];
  const add = (words: string[], line: string) => {
    if (words.length >= 2 && words.length <= MAX_GRAM_WORDS) grams.push({ words, line });
  };
  tokens.forEach((words, i) => {
    for (let start = 0; start < words.length; start += 1) {
      for (let size = 2; size <= MAX_GRAM_WORDS && start + size <= words.length; size += 1) {
        add(words.slice(start, start + size), lines[i]);
      }
    }
    const next = tokens[i + 1];
    if (!next || next.length === 0) return;
    const line = `${lines[i]} ${lines[i + 1]}`;
    for (let tail = 1; tail <= Math.min(2, words.length); tail += 1) {
      for (let head = 1; head <= Math.min(2, next.length); head += 1) {
        add([...words.slice(words.length - tail), ...next.slice(0, head)], line);
      }
    }
  });
  return grams;
}

/** Directory players named in these lines, best first. Also used for a slab label's player line. */
export function findPlayers(lines: string[], directory: readonly IndexedDirectoryPlayer[]): RawPlayerHit[] {
  const index = directoryIndex(directory);
  const best = new Map<string, RawPlayerHit & { order: number }>();
  const lineCompacts = new Set(lines.map((line) => compactNorm(normInterest(fixOcrLetters(line)))));
  const offer = (player: IndexedDirectoryPlayer, score: number, line: string, order: number, compact: string) => {
    const key = `${player.name}|${player.sport}`;
    const nameplate = lineCompacts.has(compact);
    const seen = best.get(key);
    if (seen && (seen.score > score || (seen.score === score && (seen.nameplate || !nameplate)))) return;
    const hit: RawPlayerHit & { order: number } = { name: player.name, sport: player.sport, score, line, order };
    if (player.team) hit.team = player.team;
    if (nameplate) hit.nameplate = true;
    best.set(key, hit);
  };

  nameGrams(lines).forEach((gram, order) => {
    const compact = compactNorm(gram.words.join(" "));
    const exact = index.byCompact.get(compact);
    if (exact) {
      for (const player of exact) offer(player, 1, gram.line, order, compact);
      return;
    }
    if (gram.words.length > FUZZY_MAX_WORDS) return;
    if (compact.length < FUZZY_MIN_LENGTH || compact.length > FUZZY_MAX_LENGTH) return;
    const max = compact.length <= 8 ? 1 : 2;
    const candidates = new Set([
      ...(index.byHead.get(compact.slice(0, 2)) ?? []),
      ...(index.byTail.get(compact.slice(-3)) ?? []),
    ]);
    for (const player of candidates) {
      if (Math.abs(player.compact.length - compact.length) > max) continue;
      const distance = boundedDistance(compact, player.compact, max);
      if (distance > max) continue;
      offer(player, 1 - distance / Math.max(compact.length, player.compact.length), gram.line, order, compact);
    }
  });

  return [...best.values()]
    // An exact nameplate beats a name found inside other text (a bio, the background).
    .sort((a, b) => b.score - a.score || Number(Boolean(b.nameplate)) - Number(Boolean(a.nameplate)) || a.order - b.order)
    .slice(0, MAX_PLAYERS)
    .map((hit) => {
      const out: RawPlayerHit = { name: hit.name, sport: hit.sport, score: hit.score, line: hit.line };
      if (hit.team) out.team = hit.team;
      if (hit.nameplate) out.nameplate = true;
      return out;
    });
}

/** First word of every SETS name, so "2017 TOPPS" is a card year and "2019 NYY" is not. */
const BRAND_WORDS = new Set(SETS.map((name) => normInterest(name).split(" ")[0]));

function readYear(lines: string[]): string {
  for (const line of lines) {
    for (const match of line.matchAll(YEAR_TOKEN)) {
      const next = normInterest(match[2]).split(" ")[0] ?? "";
      if (!BRAND_WORDS.has(next)) continue;
      const parsed = parseYearLabel(match[1].replace(/\s+/g, ""));
      if (parsed) return parsed.yearLabel;
    }
  }
  return "";
}

function readSerial(lines: string[]): RawCardRead["serial"] {
  for (const line of lines) {
    const match = SERIAL.exec(line);
    if (!match) continue;
    const number = Number(match[1]);
    const run = Number(match[2]);
    if (number >= 1 && run >= 1 && number <= run) return { number: String(number), run: String(run) };
  }
  return null;
}

function hasPhrase(lineWords: string[][], phrase: string[]): boolean {
  return lineWords.some((words) => {
    for (let start = 0; start + phrase.length <= words.length; start += 1) {
      if (phrase.every((word, i) => words[start + i] === word)) return true;
    }
    return false;
  });
}

function readSets(lineWords: string[][]): string[] {
  const present = new Set(lineWords.flat());
  const scored: { name: string; score: number; order: number }[] = [];
  const printed: string[][] = [];
  SETS.forEach((name) => {
    const words = normInterest(name).split(" ");
    if (hasPhrase(lineWords, words)) printed.push(words);
  });
  // "TOPPS NOW" is Topps Now, not also plain Topps: a set inside a longer printed set doesn't count on its own.
  const inLonger = (words: string[]) =>
    printed.some((other) => other.length > words.length && hasPhrase([other], words));
  SETS.forEach((name, order) => {
    const words = normInterest(name).split(" ");
    if (hasPhrase(lineWords, words)) {
      if (!inLonger(words)) scored.push({ name, score: words.length + 1, order });
      return;
    }
    const distinct = words.filter((word) => !GENERIC_SET_WORDS.has(word));
    const matched = distinct.filter((word) => present.has(word)).length;
    if (matched === 0) return;
    scored.push({ name, score: matched - 0.1 * (words.length - matched), order });
  });
  const names = scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((item) => item.name);
  // "Optic Preview" is a parallel on a Donruss card, the same rule card-page comps use.
  if (hasPhrase(lineWords, ["optic", "preview"])) {
    const kept = names.filter((name) => !/optic/i.test(name) && name !== "Panini Donruss");
    return ["Panini Donruss", ...kept].slice(0, MAX_SETS);
  }
  return names.slice(0, MAX_SETS);
}

function readParallelWords(lineWords: string[][]): string[] {
  const found: string[] = [];
  for (const label of PARALLEL_WORDS) {
    if (hasPhrase(lineWords, normInterest(label).split(" "))) found.push(label);
  }
  return found;
}

function readInsert(lines: string[]): string {
  const text = ` ${insertKey(lines.join(" "))} `;
  for (const item of POPULAR_INSERTS) {
    for (const name of [item.name, ...item.aliases]) {
      if (text.includes(` ${insertKey(name)} `)) return item.name;
    }
  }
  for (const name of SCAN_INSERTS) {
    if (text.includes(` ${insertKey(name)} `)) return name;
  }
  return "";
}

type TeamIndex = Map<string, { name: string; sport: string }>;
const teamCache = new WeakMap<readonly IndexedDirectoryPlayer[], { teams: TeamIndex; nicknames: Set<string> }>();

/** Every team in the directory, by its words, and each team's last word (Phillies, Giants, 76ers). */
function teamIndex(directory: readonly IndexedDirectoryPlayer[]) {
  const cached = teamCache.get(directory);
  if (cached) return cached;
  const teams: TeamIndex = new Map();
  const nicknames = new Set<string>();
  for (const player of directory) {
    if (!player.team) continue;
    const key = normInterest(player.team);
    if (!key) continue;
    if (!teams.has(key)) teams.set(key, { name: player.team, sport: player.sport });
    const last = key.split(" ").pop();
    if (last) nicknames.add(last);
  }
  const index = { teams, nicknames };
  teamCache.set(directory, index);
  return index;
}

function readTeam(lineWords: string[][], directory: readonly IndexedDirectoryPlayer[]): RawCardRead["team"] {
  const { teams } = teamIndex(directory);
  for (const words of lineWords) {
    // "PHILADELPHIA PHILLIES - 3B": the team can share a line with a position.
    for (let size = Math.min(words.length, 4); size >= 2; size -= 1) {
      for (let start = 0; start + size <= words.length; start += 1) {
        const team = teams.get(words.slice(start, start + size).join(" "));
        if (team) return team;
      }
    }
  }
  return null;
}

const SET_WORDS = new Set(SETS.flatMap((name) => normInterest(name).split(" ")));
const PARALLEL_WORD_SET = new Set(PARALLEL_WORDS.flatMap((label) => normInterest(label).split(" ")));

/**
 * A nameplate: a short line that is only a person's name. Two or three words
 * of letters, no digits, and nothing a card prints that isn't a name (team,
 * set, color, rookie and maker words). Kept even when the directory doesn't
 * know the player, so a new prospect still reads as themselves.
 */
function readPrintedName(lines: string[], directory: readonly IndexedDirectoryPlayer[]): string {
  const { teams, nicknames } = teamIndex(directory);
  for (const line of lines) {
    if (/\d/.test(line) || line.length > 32) continue;
    const words = normInterest(line).split(" ").filter(Boolean);
    if (words.length < 2 || words.length > 3) continue;
    if (!words.every((word) => /^[a-z]+$/.test(word) && word.length >= 2)) continue;
    if (teams.has(words.join(" ")) || nicknames.has(words[words.length - 1])) continue;
    if (words.some((word) => NOT_NAME_WORDS.has(word) || SET_WORDS.has(word) || PARALLEL_WORD_SET.has(word) || BACK_WORDS.has(word))) {
      continue;
    }
    return line
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
      .replace(/(^|[\s-])([a-z])/g, (_match, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`);
  }
  return "";
}

function readSide(lines: string[], lineWords: string[][], copyrightYear: string): RawCardRead["side"] {
  if (lines.length === 0) return "unknown";
  if (copyrightYear || lines.some((line) => /©|copyright|panini america|topps company/i.test(line))) {
    return "back";
  }
  const backWords = lineWords.flat().filter((word) => BACK_WORDS.has(word)).length;
  if (backWords >= 2 || lines.length > 12) return "back";
  return "front";
}

/** A code whose letters are a word from a bio or a stat line: "FOR-4", "A-414", "JUNE-4". */
function wordCode(number: string): boolean {
  const prefix = /^([A-Z]+)\d?-/.exec(number)?.[1];
  return Boolean(prefix && NOT_CODE_PREFIX.has(prefix));
}

/**
 * The printed card #: "#280" or "NO. 280" first, then a code like BP-27. A
 * SKU (CMPO73107) and a word code from the bio (FOR-4, A-414, JUNE-4) are
 * skipped and the search goes on. Of the codes left, a known checklist prefix
 * (BP, INS, BCP, US, TC, SP) wins. On a scanned card, a sentence-length line
 * is a bio and never holds the card #. Nothing left: the number stays open.
 */
function readCardNumber(lines: string[], scanned: boolean): string {
  const usable = (line: string) => !(scanned && proseLine(line));
  for (const line of lines) {
    if (!usable(line)) continue;
    for (const match of line.matchAll(CARD_NUMBER)) {
      const number = match[1].toUpperCase();
      if (!looksLikeCatalogSku(number) && !wordCode(number)) return number;
    }
  }
  const codes: string[] = [];
  for (const line of lines) {
    if (MAKER_LINE.test(line) || !usable(line)) continue;
    // OCR often reads the hyphen as an en or em dash, or puts a space beside it: BP–27, BP - 27.
    for (const match of line.toUpperCase().matchAll(CODE_NUMBER)) {
      const number = `${match[1]}-${match[2]}`;
      if (!looksLikeCatalogSku(number) && !wordCode(number)) codes.push(number);
    }
  }
  return codes.find((number) => KNOWN_CODE_PREFIX.has(/^([A-Z]+)/.exec(number)?.[1] ?? "")) ?? codes[0] ?? "";
}

export function readRawCardText(
  lines: readonly string[],
  directory: readonly IndexedDirectoryPlayer[],
  options: { side?: "front" | "back" } = {},
): RawCardRead {
  const read = emptyRead();
  const clean = cleanLines(lines);
  read.lines = clean;
  if (clean.length === 0) return read;

  const lineWords = clean.map((line) => normInterest(line).split(" ").filter(Boolean));
  // The back's maker lines name the company, not the set, and their year is the © year.
  const maker = (line: string) => MAKER_LINE.test(line) || (options.side === "back" && MAKER_ONLY_LINE.test(line));
  const printed = clean.filter((line) => !maker(line));

  read.players = findPlayers(clean, directory);
  read.printedName = readPrintedName(clean, directory);
  read.team = readTeam(lineWords, directory);
  read.yearLabel = readYear(printed);
  read.copyrightYear =
    clean.map((line) => COPYRIGHT.exec(line)?.[1] ?? "").find(Boolean) ??
    "";
  if (!read.copyrightYear && options.side === "back") {
    read.copyrightYear = clean.filter((line) => MAKER_ONLY_LINE.test(line)).map((line) => MAKER_YEAR.exec(line)?.[1] ?? "").find(Boolean) ?? "";
  }
  read.cardNumber = readCardNumber(clean, Boolean(options.side));
  read.serial = readSerial(clean);
  read.isRookie = clean.some((line) => /\b(RC|ROOKIE)\b/i.test(line));
  read.setNames = readSets(lineWords.filter((_words, i) => !maker(clean[i])));
  read.parallelWords = readParallelWords(lineWords);
  read.insert = readInsert(clean);
  read.side = readSide(clean, lineWords, read.copyrightYear);
  return read;
}

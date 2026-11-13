import { SETS, parseYearLabel } from "@/lib/card-options";
import { POPULAR_INSERTS, insertKey } from "@/lib/cards/data/popular-inserts";
import type { IndexedDirectoryPlayer } from "@/lib/players/types";
import { compactNorm, normInterest } from "@/lib/social/follow-rank";
import { schoolOnLine } from "./schools";

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
  /**
   * The name is from the wider list (retired, college, prospects). It is only ever an exact name on a
   * line of its own, and the matcher uses it only to confirm the name the card printed.
   */
  more?: true;
};

export type RawCardRead = {
  /** Up to 3, best first. Empty when no full name was read. */
  players: RawPlayerHit[];
  /**
   * A line that reads as a person's name on its own (a nameplate), title-cased,
   * even when the directory doesn't know the player yet (new prospects). "" when none.
   */
  printedName: string;
  /**
   * The printed name sits beside the card's position, team or school line: the header of a back or
   * the nameplate of a front. A name-like line with nothing beside it could be any two words.
   */
  printedNameAnchored: boolean;
  /** A team line on the card, from the directory's teams. Gives the sport when the player is new to us. */
  team: { name: string; sport: string } | null;
  /** A college the card prints as its team (UCLA, Alabama): a Bowman U or draft-picks card. "" when none. */
  school: string;
  /** The school line sits beside the name or the position line (the header), not in a stat table or a bio. */
  schoolInHeader: boolean;
  /**
   * Something on this side says Baseball: the product line, a team, a baseball position line
   * (OF, SS, PITCHER, INFIELD), or a line that is an MLB nickname ("RANGERS").
   */
  baseballSign: boolean;
  /** The sport a position line ("RUNNING BACK") or the product line ("... FOOTBALL") gives. "" when none. */
  sportHint: string;
  /** "2023-24" or "2017", only when printed next to a brand. */
  yearLabel: string;
  /** The © year on a back. Often the release year, not the card year. */
  copyrightYear: string;
  /** Without the leading # or NO. Also a printed code such as BP-27 or INS-13. */
  cardNumber: string;
  /**
   * Letter codes the side prints on a short line (RAV-ML, CPA-AM). One is the card # only when
   * its last letters are the player's initials: the matcher checks, since the name may be on the other side.
   */
  letterCodes: string[];
  /** The card says it is signed: "CERTIFIED AUTOGRAPH ISSUE", "AUTOGRAPH", or an autograph checklist code. */
  isAuto: boolean;
  /** The insert or variation the back names ("Rookie Autograph Variations"). "" when none. */
  subset: string;
  /** A stamped serial such as 12/99. */
  serial: { number: string; run: string } | null;
  isRookie: boolean;
  /** The "1ST BOWMAN" mark: "1ST BOWMAN" on a line, or a "1ST" line on a card that prints Bowman. */
  firstBowman: boolean;
  /** Up to 3 names from SETS, best first. */
  setNames: string[];
  /** The names in setNames the side printed in full ("TOPPS UPDATE"), not guessed from one logo word. */
  printedSets: string[];
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
  // One parallel, not Red and Blue.
  "RED WHITE AND BLUE",
  "RED WHITE BLUE",
  "TIGER STRIPE",
  "CRACKED ICE",
  // Bowman's Sky Blue Border: its own parallel, not Blue.
  "SKY BLUE",
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
  "CA", "BS", "TP", "PD",
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
    printedNameAnchored: false,
    team: null,
    school: "",
    schoolInHeader: false,
    baseballSign: false,
    sportHint: "",
    letterCodes: [],
    isAuto: false,
    subset: "",
    firstBowman: false,
    yearLabel: "",
    copyrightYear: "",
    cardNumber: "",
    serial: null,
    isRookie: false,
    setNames: [],
    printedSets: [],
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
  /** The wider list, exact names only. Never in byHead or byTail: a wider-list name is never a near match. */
  moreByCompact: Map<string, IndexedDirectoryPlayer[]>;
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
  const moreByCompact = new Map<string, IndexedDirectoryPlayer[]>();
  for (const player of directory) {
    if (!player.compact) continue;
    if (player.more) {
      push(moreByCompact, player.compact, player);
      continue;
    }
    push(byCompact, player.compact, player);
    push(byHead, player.compact.slice(0, 2), player);
    push(byTail, player.compact.slice(-3), player);
  }
  const index = { byCompact, byHead, byTail, moreByCompact };
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
    if (player.more) hit.more = true;
    best.set(key, hit);
  };
  /**
   * The wider list (retired, college, prospects) is asked last and counts for less: only an exact name,
   * only on a line that is that name and nothing else, only a line that reads as a name (no set, color,
   * team or rookie word), and only when the roster file has nobody for those words, exact or near.
   */
  const offerMore = (gram: Gram, order: number, compact: string) => {
    if (!lineCompacts.has(compact)) return;
    const more = index.moreByCompact.get(compact);
    if (!more || !readsAsNameLine(gram.line, directory)) return;
    for (const player of more) offer(player, 1, gram.line, order, compact);
  };

  nameGrams(lines).forEach((gram, order) => {
    const compact = compactNorm(gram.words.join(" "));
    const exact = index.byCompact.get(compact);
    if (exact) {
      for (const player of exact) offer(player, 1, gram.line, order, compact);
      return;
    }
    let near = false;
    if (gram.words.length <= FUZZY_MAX_WORDS && compact.length >= FUZZY_MIN_LENGTH && compact.length <= FUZZY_MAX_LENGTH) {
      const max = compact.length <= 8 ? 1 : 2;
      const candidates = new Set([
        ...(index.byHead.get(compact.slice(0, 2)) ?? []),
        ...(index.byTail.get(compact.slice(-3)) ?? []),
      ]);
      for (const player of candidates) {
        if (Math.abs(player.compact.length - compact.length) > max) continue;
        const distance = boundedDistance(compact, player.compact, max);
        if (distance > max) continue;
        near = true;
        offer(player, 1 - distance / Math.max(compact.length, player.compact.length), gram.line, order, compact);
      }
    }
    if (!near) offerMore(gram, order, compact);
  });

  const plain = (hit: RawPlayerHit & { order: number }): RawPlayerHit => {
    const out: RawPlayerHit = { name: hit.name, sport: hit.sport, score: hit.score, line: hit.line };
    if (hit.team) out.team = hit.team;
    if (hit.nameplate) out.nameplate = true;
    if (hit.more) out.more = true;
    return out;
  };
  const found = [...best.values()];
  return [
    ...found
      .filter((hit) => !hit.more)
      // An exact nameplate beats a name found inside other text (a bio, the background).
      .sort((a, b) => b.score - a.score || Number(Boolean(b.nameplate)) - Number(Boolean(a.nameplate)) || a.order - b.order)
      .slice(0, MAX_PLAYERS),
    // Wider-list names ride after the roster-file ones, which are picked exactly as before.
    ...found.filter((hit) => hit.more).sort((a, b) => a.order - b.order).slice(0, MAX_PLAYERS),
  ].map(plain);
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

function readSerial(lines: string[], scanned = false): RawCardRead["serial"] {
  for (const line of lines) {
    // On a scanned card, a ratio in a bio sentence ("hit safely in 21/25 games") or in a stat row
    // ("17 460/652 4918 43") is not a stamped serial.
    if (scanned && (proseLine(line) || statRow(line))) continue;
    const match = SERIAL.exec(line);
    if (!match) continue;
    const number = Number(match[1]);
    const run = Number(match[2]);
    if (number >= 1 && run >= 1 && number <= run) return { number: String(number), run: String(run) };
  }
  return null;
}

/** A line with three or more numbers besides the ratio: a row of a stat table. */
function statRow(line: string): boolean {
  const rest = line.replace(SERIAL, " ");
  return (rest.match(/(?<![\w.])\d[\d,.]*(?![\w])/g) ?? []).length >= 3;
}

function hasPhrase(lineWords: string[][], phrase: string[]): boolean {
  return lineWords.some((words) => {
    for (let start = 0; start + phrase.length <= words.length; start += 1) {
      if (phrase.every((word, i) => words[start + i] === word)) return true;
    }
    return false;
  });
}

/** Sets a single word never guesses. */
const RULE_ONLY_SETS = new Set(["Bowman U Chrome", "Bowman U Chrome Sapphire", "Bowman Draft Sapphire"]);

/** Sets that are only a maker's name. On a back they're legal text; anywhere, a product name beats them. */
const BARE_MAKER_SETS = new Set(["Topps", "Upper Deck", "Leaf"]);

/** Who makes a set, from its first word. Bowman is a Topps product; Donruss, Hoops and Score are Panini. */
function makerOf(name: string): string {
  const first = normInterest(name).split(" ")[0] ?? "";
  if (first === "topps" || first === "bowman" || first === "bowman's" || first === "bowmans") return "topps";
  if (["panini", "donruss", "prizm", "hoops", "court", "score"].includes(first)) return "panini";
  if (["upper", "o", "fleer", "skybox"].includes(first)) return "upper deck";
  return first;
}

/** Maker words printed on this side: TOPPS.COM, PANINI AMERICA, UPPER DECK... */
function printedMakers(lineWords: string[][]): Set<string> {
  const makers = new Set<string>();
  for (const words of lineWords) {
    if (words.includes("topps")) makers.add("topps");
    if (words.includes("panini")) makers.add("panini");
    if (hasPhrase([words], ["upper", "deck"])) makers.add("upper deck");
  }
  return makers;
}

function readSets(lineWords: string[][], options: { back?: boolean } = {}): { names: string[]; printed: string[] } {
  const present = new Set(lineWords.flat());
  const makers = printedMakers(lineWords);
  const scored: { name: string; score: number; order: number; phrase: boolean }[] = [];
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
      if (!inLonger(words)) scored.push({ name, score: words.length + 1, order, phrase: true });
      return;
    }
    // Named only in full or by the college rule (lib/scan/match.ts): "CHROME" alone never guesses it.
    if (RULE_ONLY_SETS.has(name)) return;
    const distinct = words.filter((word) => !GENERIC_SET_WORDS.has(word));
    const matched = distinct.filter((word) => present.has(word)).length;
    if (matched === 0) return;
    // "TOPPS CERTIFIED" is legal text, not Panini Certified: a one-word guess at another maker's set doesn't count.
    if (makers.size > 0 && !makers.has(makerOf(name))) return;
    // A set missing one of its own words is a weaker guess than one missing only a maker word:
    // "DONRUSS" is Panini Donruss, not Donruss Optic; "PRIZM" with "DRAFT PICKS" is Prizm Draft Picks.
    const missingOwn = distinct.length - matched;
    const missingCommon = words.filter((word) => GENERIC_SET_WORDS.has(word) && !present.has(word)).length;
    scored.push({ name, score: matched - 0.5 * missingOwn - 0.1 * missingCommon, order, phrase: false });
  });
  let ranked = scored.sort((a, b) => b.score - a.score || a.order - b.order);
  // On a back, a bare maker name is legal text (TOPPS.COM, MLB TOPPS, PRINTED IN USA TOPPS), never the set.
  if (options.back) ranked = ranked.filter((item) => !BARE_MAKER_SETS.has(item.name));
  // Anywhere, a product name beats its bare maker: BOWMAN TOPPS is Bowman.
  if (ranked.some((item) => !BARE_MAKER_SETS.has(item.name) && item.phrase)) {
    ranked = ranked.filter((item) => !BARE_MAKER_SETS.has(item.name));
  }
  const names = ranked.map((item) => item.name);
  const printedNames = ranked.filter((item) => item.phrase).map((item) => item.name);
  // "Optic Preview" is a parallel on a Donruss card, the same rule card-page comps use.
  if (hasPhrase(lineWords, ["optic", "preview"])) {
    const kept = names.filter((name) => !/optic/i.test(name) && name !== "Panini Donruss");
    const top = ["Panini Donruss", ...kept].slice(0, MAX_SETS);
    return { names: top, printed: printedNames.filter((name) => top.includes(name)) };
  }
  const top = names.slice(0, MAX_SETS);
  return { names: top, printed: printedNames.filter((name) => top.includes(name)) };
}

/**
 * Team names and awards with a color or finish word in them. Taken out before the parallel is
 * read, so "RED SOX", "Tulane Green Wave" and "GOLD GLOVE" are never a parallel.
 */
export const COLOR_NAME_PHRASES =
  /\b(?:(?:tulane\s+)?green\s+wave|(?:dallas|(?:minnesota\s+)?north)\s+stars|red\s+sox|white\s+sox|blue\s+jays|red\s+wings|blue\s+jackets|golden\s+(?:knights|state|bears|gophers|eagles|hurricane)|green\s+bay|crimson\s+tide|blue\s+devils|red\s+raiders|red\s+storm|scarlet\s+knights|black\s+knights|orange\s+crush|gold(?:en)?\s+gloves?|silver\s+slugger|gold\s+medal(?:ist)?|silver\s+medal(?:ist)?|bronze\s+medal(?:ist)?|red\s+zone|blue[\s-]chip|green\s+monster)\b/gi;

/** Color and finish words in the order the card (or title) prints them: "Pink/Red" stays Pink, Red. */
function readParallelWords(lineWords: string[][]): string[] {
  const flat = lineWords.flat();
  const found: string[] = [];
  for (const label of PARALLEL_WORDS) {
    if (hasPhrase(lineWords, normInterest(label).split(" "))) found.push(label);
  }
  // A phrase inside a longer one found is the same parallel: Tiger in Tiger Stripe, Red in Red White Blue.
  const wordsOf = (label: string) => normInterest(label).split(" ");
  const kept = found.filter(
    (label) => !found.some((other) => other !== label && wordsOf(other).length > wordsOf(label).length && hasPhrase([wordsOf(other)], wordsOf(label))),
  );
  const at = (label: string) => flat.indexOf(wordsOf(label)[0] ?? "");
  return kept.sort((a, b) => at(a) - at(b));
}

/** The words to read colors from: no team names, no awards, and on a scanned card no bio sentences. */
function colorLineWords(lines: string[], directory: readonly IndexedDirectoryPlayer[], scanned: boolean): string[][] {
  const { teams } = teamIndex(directory);
  return lines
    .filter((line) => !(scanned && proseLine(line)))
    .map((line) => {
      const words = normInterest(fixOcrLetters(line).replace(COLOR_NAME_PHRASES, " ")).split(" ").filter(Boolean);
      // A team the directory knows ("BOSTON RED SOX", "TORONTO BLUE JAYS") is not a color either.
      for (let size = Math.min(words.length, 4); size >= 2; size -= 1) {
        for (let start = 0; start + size <= words.length; start += 1) {
          if (teams.has(words.slice(start, start + size).join(" "))) words.splice(start, size);
        }
      }
      return words;
    });
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

/** A word a card or a sold title prints that is never part of a person's name: set, color, rookie and maker words. */
export function cardWord(word: string): boolean {
  const key = word.toLowerCase();
  return NOT_NAME_WORDS.has(key) || SET_WORDS.has(key) || PARALLEL_WORD_SET.has(key) || BACK_WORDS.has(key);
}

/**
 * A line that can be a person's name: two or three words of letters, no digits, and nothing a card
 * prints that isn't a name (a position, a school, a team, or a set, color, rookie, maker or back word).
 */
export function readsAsNameLine(line: string, directory: readonly IndexedDirectoryPlayer[]): boolean {
  if (/\d/.test(line) || line.length > 32) return false;
  // "RUNNING BACK", "WIDE RECEIVER", "SS / 3B": where he plays, never who he is. Nor is a school.
  if (positionLine(line) || schoolOnLine(line)) return false;
  const words = normInterest(line).split(" ").filter(Boolean);
  if (words.length < 2 || words.length > 3) return false;
  if (!words.every((word) => /^[a-z]+$/.test(word) && word.length >= 2)) return false;
  const { teams, nicknames } = teamIndex(directory);
  if (teams.has(words.join(" ")) || nicknames.has(words[words.length - 1])) return false;
  return !words.some((word) => NOT_NAME_WORDS.has(word) || SET_WORDS.has(word) || PARALLEL_WORD_SET.has(word) || BACK_WORDS.has(word));
}

/**
 * A nameplate: a short line that is only a person's name. Two or three words
 * of letters, no digits, and nothing a card prints that isn't a name (team,
 * set, color, rookie and maker words). Kept even when the directory doesn't
 * know the player, so a new prospect still reads as themselves.
 */
function readPrintedName(lines: string[], directory: readonly IndexedDirectoryPlayer[]): { name: string; anchored: boolean } {
  const isTeam = (line: string) => Boolean(readTeam([normInterest(line).split(" ").filter(Boolean)], directory)) || Boolean(schoolOnLine(line));
  const names: { line: string; index: number }[] = [];
  lines.forEach((line, index) => {
    if (readsAsNameLine(line, directory)) names.push({ line, index });
  });
  // The header prints the name beside the position or the team: that line wins over any other.
  const beside = names.find(({ index }) =>
    [lines[index - 1], lines[index + 1]].some((item) => Boolean(item) && (positionLine(item!) || isTeam(item!))),
  );
  const picked = beside ?? names[0];
  if (!picked) return { name: "", anchored: false };
  const name = picked.line
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|[\s-])([a-z])/g, (_match, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`);
  return { name, anchored: Boolean(beside) };
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

const POSITIONS = new Set(["SS", "C", "P", "LF", "CF", "RF", "DH", "OF", "IF", "1B", "2B", "3B", "RHP", "LHP", "SP", "RP"]);
/** Position words that are never a checklist prefix: "SS-38" is OCR's SS-3B, "INF-3B" a position line. */
const POSITION_ONLY = new Set(["SS", "C", "P", "LF", "CF", "RF", "DH", "OF", "IF", "INF", "UT", "UTL", "UTIL", "RHP", "LHP", "RP"]);
/** Every position a card prints beside a jersey number: "#17 | QB", "G-F #23". */
const JERSEY_POSITIONS = new Set([
  ...POSITIONS, "INF", "UT", "QB", "RB", "FB", "HB", "WR", "TE", "K", "LB", "ILB", "OLB", "MLB", "CB", "DB", "S", "FS", "DE", "DT",
  "DL", "OL", "OT", "OG", "EDGE", "PG", "SG", "SF", "PF", "G", "F", "LW", "RW", "D",
]);

/**
 * A code whose letters are a word from a bio or a stat line ("FOR-4",
 * "A-414", "JUNE-4"), or a position line ("SS-3B", "INF-3B", OCR's "SS-38").
 */
function wordCode(number: string): boolean {
  const prefix = /^([A-Z]+)\d?-/.exec(number)?.[1];
  if (prefix && NOT_CODE_PREFIX.has(prefix)) return true;
  const [left, right] = number.split("-");
  if (POSITIONS.has(left ?? "") && POSITIONS.has(right ?? "")) return true;
  // A base (1B, 2B, 3B) after the hyphen, or a position word in front, is where he plays.
  return /^[1-3]B$/.test(right ?? "") || POSITION_ONLY.has(left ?? "");
}

/** "#1 OVERALL PICK", "NO. 1 PROSPECT", "#3 SEED": a rank, never the card #. */
const RANK_AFTER = /^\s*(?:overall|pick|draft|prospect|seed|ranked|rank|in\b|on\b|among|all[\s-]time)/i;

/** "#17 | QB", "QB #17", "#23 G-F": a jersey number beside a position, never the card #. */
function jerseyLine(line: string, matched: string): boolean {
  const rest = line.replace(matched, " ").split(/[\s|/,·•-]+/).filter(Boolean);
  return rest.length > 0 && rest.length <= 3 && rest.every((word) => JERSEY_POSITIONS.has(word.toUpperCase()));
}

/** Auto and relic checklists number with letters: CPA-KG, BCPA-MC, RA-JW. */
const LETTER_CODE = /\b(CPA|BCPA|BPA|CDA|BDA|CRA|RPA|RA|FSA)\s?[-–—‐]\s?([A-Z]{2,4})\b/;
/** A known checklist code printed with no hyphen, alone on its line: US1, USC150. */
const BARE_CODE_LINE = /^(US|USC|BCP|BP|BDC|BD|HMT|T)(\d{1,4})$/;
/** A card # printed alone on a line with no # in front, the way Topps backs print it. */
const LONE_NUMBER_LINE = /^\d{1,4}$/;

/**
 * The printed card #: "#280" or "NO. 280" first, then a code like BP-27. A
 * SKU (CMPO73107) and a word code from the bio (FOR-4, A-414, JUNE-4) are
 * skipped and the search goes on. Of the codes left, a known checklist prefix
 * (BP, INS, BCP, US, TC, SP) wins. On a scanned card, a sentence-length line
 * is a bio and never holds the card #. Nothing left: the number stays open.
 */
function readCardNumber(
  lines: string[],
  scanned: boolean,
  side?: "front" | "back",
  /** True for a line that names a team. A lone number beside one is a jersey or an age. */
  teamLine: (line: string) => boolean = () => false,
): string {
  const usable = (line: string) => !(scanned && proseLine(line));
  for (const line of lines) {
    if (!usable(line)) continue;
    for (const match of line.matchAll(CARD_NUMBER)) {
      const number = match[1].toUpperCase();
      if (looksLikeCatalogSku(number) || wordCode(number)) continue;
      // A rank ("#1 OVERALL PICK") is not the card #, on a card or in a sold title.
      if (RANK_AFTER.test(line.slice((match.index ?? 0) + match[0].length))) continue;
      // On a scanned card, neither is a jersey number beside a position ("#17 | QB").
      if (scanned && jerseyLine(line, match[0])) continue;
      return number;
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
  const code = codes.find((number) => KNOWN_CODE_PREFIX.has(/^([A-Z]+)/.exec(number)?.[1] ?? "")) ?? codes[0] ?? "";
  if (code || side !== "back") return code;
  // The back of a scanned card, with no "#" and no hyphen code. Three more shapes a back prints:
  for (const line of lines) {
    if (MAKER_LINE.test(line) || !usable(line)) continue;
    const letters = LETTER_CODE.exec(line.toUpperCase());
    if (letters) return `${letters[1]}-${letters[2]}`;
  }
  for (const line of lines) {
    const bare = BARE_CODE_LINE.exec(line.toUpperCase().trim());
    if (bare) return `${bare[1]}${bare[2]}`;
  }
  // A number alone on a line at the top or the bottom of the back (the bottom when the card was
  // upside down), and the only lone number on the whole back. A stat table read cell by cell has many.
  // Only a Topps-made back prints its card # this way (Topps, Bowman): Panini prints "No.", so a lone
  // number there is a jersey. And never beside a position or team line, where it is a jersey or an age.
  const toppsMade = lines.some((item) => TOPPS_MADE.test(item)) && !lines.some((item) => OTHER_MAKER.test(item));
  if (!toppsMade) return "";
  const lone = lines.map((line, index) => ({ line: line.trim(), index })).filter((item) => LONE_NUMBER_LINE.test(item.line));
  if (lone.length !== 1) return "";
  const { line, index } = lone[0];
  const edge = index <= 1 || index >= lines.length - 2;
  const year = /^(?:19|20)\d{2}$/.test(line);
  const beside = [lines[index - 1], lines[index + 1]].filter((item): item is string => Boolean(item));
  if (beside.some((item) => positionLine(item) || teamLine(item))) return "";
  return edge && !year && Number(line) > 0 ? String(Number(line)) : "";
}

const TOPPS_MADE = /\b(?:topps|bowman)\b/i;
const OTHER_MAKER = /\bpanini\b|\bupper\s+deck\b|\bleaf\b|\bdonruss\b/i;
/** Words a position line is made of: "QUARTERBACK", "SECOND BASE", "RHP", "SS / 3B". */
const POSITION_WORDS = new Set([
  "QUARTERBACK", "RUNNING", "BACK", "WIDE", "RECEIVER", "TIGHT", "END", "KICKER", "PUNTER", "LINEBACKER", "CORNERBACK",
  "SAFETY", "DEFENSIVE", "OFFENSIVE", "TACKLE", "LINEMAN", "PITCHER", "CATCHER", "SHORTSTOP", "OUTFIELD", "OUTFIELDER",
  "INFIELD", "INFIELDER", "FIRST", "SECOND", "THIRD", "BASE", "BASEMAN", "DESIGNATED", "HITTER", "STARTING", "RELIEF",
  "GUARD", "FORWARD", "CENTER", "POINT", "SHOOTING", "SMALL", "POWER", "WING", "LEFT", "RIGHT", "DEFENSEMAN", "DEFENSE",
  "GOALIE", "GOALTENDER", "UTILITY",
]);

function positionLine(line: string): boolean {
  const words = line.toUpperCase().split(/[\s|/,·•-]+/).filter(Boolean);
  return words.length > 0 && words.length <= 4 && words.every((word) => POSITION_WORDS.has(word) || JERSEY_POSITIONS.has(word));
}

/** The sport a position names. Only positions one sport uses: "CENTER" and "GUARD" say nothing. */
const POSITION_SPORT: [RegExp, string][] = [
  [/\b(?:QUARTERBACK|RUNNING\s+BACK|WIDE\s+RECEIVER|TIGHT\s+END|LINEBACKER|CORNERBACK|DEFENSIVE\s+(?:END|BACK|TACKLE|LINEMAN)|OFFENSIVE\s+(?:TACKLE|LINEMAN)|QB|RB|WR|TE|LB|CB|EDGE)\b/i, "Football"],
  [/\b(?:PITCHER|CATCHER|SHORTSTOP|OUTFIELD(?:ER)?|INFIELD(?:ER)?|(?:FIRST|SECOND|THIRD)\s+BASE(?:MAN)?|DESIGNATED\s+HITTER|RHP|LHP|SS|1B|2B|3B|OF|INF)\b/i, "Baseball"],
  [/\b(?:POINT\s+GUARD|SHOOTING\s+GUARD|SMALL\s+FORWARD|POWER\s+FORWARD|PG|SG|SF|PF)\b/i, "Basketball"],
  [/\b(?:DEFENSEMAN|GOALIE|GOALTENDER|LEFT\s+WING|RIGHT\s+WING|LW|RW)\b/i, "Hockey"],
];
const SPORT_WORD = /\b(FOOTBALL|BASEBALL|BASKETBALL|HOCKEY)\b/i;

/** The sport a position line gives, else the sport the product line names ("... INCEPTION FOOTBALL"). */
function readSportHint(lines: string[]): string {
  for (const line of lines) {
    if (!positionLine(line)) continue;
    for (const [pattern, sport] of POSITION_SPORT) if (pattern.test(line)) return sport;
  }
  for (const line of lines) {
    // A product line, not a bio ("played football and baseball in high school").
    if (!/\b(?:topps|panini|bowman|upper\s+deck|leaf)\b/i.test(line)) continue;
    const word = SPORT_WORD.exec(line)?.[1];
    if (word) return word[0].toUpperCase() + word.slice(1).toLowerCase();
  }
  return "";
}

/**
 * A school line, but never a pro team's city ("HOUSTON TEXANS"). `inHeader`: it sits beside the
 * name or the position line, where a card prints its team. A school alone in a stat table
 * ("GEORGIA" as a college season's row) is not the card's team.
 */
function readSchool(lines: string[], directory: readonly IndexedDirectoryPlayer[], nameLines: ReadonlySet<string>): { school: string; inHeader: boolean } {
  let found = "";
  for (const [index, line] of lines.entries()) {
    const school = schoolOnLine(line);
    if (!school) continue;
    if (readTeam([normInterest(line).split(" ").filter(Boolean)], directory)) continue;
    found ||= school;
    const beside = [lines[index - 1], lines[index + 1]].filter((item): item is string => Boolean(item));
    if (beside.some((item) => positionLine(item) || nameLines.has(item.trim().toLowerCase()))) return { school, inHeader: true };
  }
  return { school: found, inHeader: false };
}

/** Positions only baseball prints. */
const BASEBALL_POSITION =
  /\b(?:PITCHER|CATCHER|SHORTSTOP|OUTFIELD(?:ER)?|INFIELD(?:ER)?|(?:FIRST|SECOND|THIRD)\s+BASE(?:MAN)?|DESIGNATED\s+HITTER|RHP|LHP|SS|1B|2B|3B|OF|INF|LF|CF|RF|DH|UTIL)\b/i;

const baseballNicknameCache = new WeakMap<readonly IndexedDirectoryPlayer[], Set<string>>();
/** MLB nicknames from the directory's baseball teams: rangers, phillies, red sox (as "sox"). */
function baseballNicknames(directory: readonly IndexedDirectoryPlayer[]): Set<string> {
  const cached = baseballNicknameCache.get(directory);
  if (cached) return cached;
  const names = new Set<string>();
  for (const player of directory) {
    if (player.sport !== "Baseball" || !player.team) continue;
    const last = normInterest(player.team).split(" ").pop();
    if (last) names.add(last);
  }
  baseballNicknameCache.set(directory, names);
  return names;
}

/** Any sign on this side that the card is a baseball card. */
function readBaseballSign(lines: string[], read: RawCardRead, directory: readonly IndexedDirectoryPlayer[]): boolean {
  if (read.sportHint === "Baseball" || read.team?.sport === "Baseball") return true;
  const nicknames = baseballNicknames(directory);
  return lines.some((line) => {
    if (positionLine(line) && BASEBALL_POSITION.test(line)) return true;
    // A line that is only a team's nickname, or a city and its nickname: "RANGERS", "TEXAS RANGERS".
    const words = normInterest(line).split(" ").filter(Boolean);
    return words.length >= 1 && words.length <= 3 && !/\d/.test(line) && nicknames.has(words[words.length - 1]);
  });
}

/** Letters, a hyphen, letters, on a short line: an autograph or relic checklist code (RAV-ML). */
const ANY_LETTER_CODE = /\b([A-Z]{2,5})\s?[-–—‐]\s?([A-Z]{2,4})\b/g;

function readLetterCodes(lines: string[], scanned: boolean): string[] {
  const codes: string[] = [];
  for (const line of lines) {
    if (MAKER_LINE.test(line) || (scanned && proseLine(line)) || line.split(/\s+/).length > 3 || positionLine(line)) continue;
    for (const match of line.toUpperCase().matchAll(ANY_LETTER_CODE)) {
      if (NOT_CODE_PREFIX.has(match[1]) || NOT_CODE_PREFIX.has(match[2])) continue;
      const code = `${match[1]}-${match[2]}`;
      if (!wordCode(code) && !codes.includes(code)) codes.push(code);
    }
  }
  return codes;
}

/** Checklist prefixes that are autographs: CPA-AM, BCPA-MC, RA-JW, RAV-ML. */
export const AUTO_CODE_PREFIX = /^(?:CPA|BCPA|BPA|CDA|BDA|CRA|RPA|RA|RAV|FSA|BSA|RDA|IA|IAV)$/;
/** The card says it is signed, in full: AUTOGRAPH, AUTOGRAPHS, AUTOGRAPHED, CERTIFIED AUTOGRAPH. */
const AUTOGRAPH_WORDS = /\bAUTOGRAPH(?:S|ED)?\b/i;
/** "AUTO" as its own word, never part of a hyphenated one ("auto-pilot"). */
const AUTO_WORD = /(?<![\w-])AUTO(?![\w-])/i;

/** AUTOGRAPH in any form, or "AUTO" alone on a short line that isn't a bio sentence. */
function saysAuto(line: string): boolean {
  if (AUTOGRAPH_WORDS.test(line)) return true;
  return AUTO_WORD.test(line) && !proseLine(line);
}

/** Legal and maker text around an autograph, never the subset's name. */
const NOT_SUBSET = /certified|issue|topps|panini|bowman|upper\s+deck|leaf|congratulations|guarantee|witness|authentic|©|\d/i;
const SUBSET_LINE = /^((?:[A-Z']+\s+){0,3}(?:AUTOGRAPHS?|SIGNATURES?|RELICS?|VARIATIONS?)(?:\s+(?:VARIATIONS?|RELICS?|PATCH(?:ES)?|BOOK))*)(?:\s+CARDS?)?$/i;

/** "ROOKIE AUTOGRAPH VARIATIONS CARD" names the subset: Rookie Autograph Variations. Two words or more. */
function readSubset(lines: string[]): string {
  for (const line of lines) {
    if (NOT_SUBSET.test(line)) continue;
    const name = SUBSET_LINE.exec(line.trim())?.[1];
    if (!name || name.trim().split(/\s+/).length < 2) continue;
    return name
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
      .replace(/(^|\s)([a-z])/g, (_match, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`);
  }
  return "";
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
  const printedName = readPrintedName(clean, directory);
  read.printedName = printedName.name;
  read.printedNameAnchored = printedName.anchored;
  // A wider-list name only confirms the name this side printed: the same line the card would have
  // been read by without it. Any other line that happens to be a listed name is not the player.
  const printedKey = compactNorm(normInterest(read.printedName));
  read.players = read.players.filter((hit) => !hit.more || (Boolean(printedKey) && compactNorm(normInterest(hit.name)) === printedKey));
  read.team = readTeam(lineWords, directory);
  read.yearLabel = readYear(printed);
  read.copyrightYear =
    clean.map((line) => COPYRIGHT.exec(line)?.[1] ?? "").find(Boolean) ??
    "";
  if (!read.copyrightYear && options.side === "back") {
    read.copyrightYear = clean.filter((line) => MAKER_ONLY_LINE.test(line)).map((line) => MAKER_YEAR.exec(line)?.[1] ?? "").find(Boolean) ?? "";
  }
  read.cardNumber = readCardNumber(clean, Boolean(options.side), options.side, (line) =>
    Boolean(readTeam([normInterest(line).split(" ").filter(Boolean)], directory)),
  );
  const nameLines = new Set<string>([read.printedName.toLowerCase(), ...read.players.filter((hit) => hit.nameplate).map((hit) => hit.line.trim().toLowerCase())].filter(Boolean));
  const school = readSchool(clean, directory, nameLines);
  read.school = school.school;
  read.schoolInHeader = school.inHeader;
  read.sportHint = readSportHint(clean);
  read.baseballSign = readBaseballSign(clean, read, directory);
  read.letterCodes = readLetterCodes(clean, Boolean(options.side));
  read.isAuto =
    clean.some(saysAuto) ||
    [read.cardNumber, ...read.letterCodes].some((code) => AUTO_CODE_PREFIX.test(/^([A-Z]+)-/.exec(code)?.[1] ?? ""));
  read.subset = readSubset(clean);
  read.serial = readSerial(clean, Boolean(options.side));
  read.isRookie = clean.some((line) => /\b(RC|ROOKIE)\b/i.test(line));
  read.firstBowman =
    clean.some((line) => /\b1ST\s+BOWMAN\b/i.test(line)) ||
    (clean.some((line) => /^1ST$/i.test(line.trim())) && clean.some((line) => /\bbowman\b/i.test(line)));
  const sets = readSets(
    lineWords.filter((_words, i) => !maker(clean[i])),
    { back: options.side === "back" },
  );
  read.setNames = sets.names;
  read.printedSets = sets.printed;
  read.parallelWords = readParallelWords(colorLineWords(clean, directory, Boolean(options.side)));
  read.insert = readInsert(clean);
  read.side = readSide(clean, lineWords, read.copyrightYear);
  return read;
}

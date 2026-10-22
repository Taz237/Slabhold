import { canonicalParallelName, parallelAliasNames } from "@/lib/cards/parallels";
import { parseGrade, RAW_GRADE, SLAB_TITLE_GRADER_PATTERN } from "@/lib/card-options";
import { filterPriceOutliers } from "./stats";
import type { CleanedSale, TrawlSoldResult } from "./types";

/** Card fields used for comps query + matching. */
export type MatchCard = {
  playerName: string;
  year: number;
  yearLabel?: string;
  setBrand: string;
  cardNumber?: string;
  noNumber?: boolean;
  parallel?: string;
  serialRun?: number | null;
  isAuto?: boolean;
  isRelic?: boolean;
  conditionType?: "raw" | "graded";
  /** Combined grade text e.g. "PSA 10" or "Raw". */
  grade?: string;
  gradeQualifier?: string | null;
  isRookie?: boolean;
  /** Used so a WNBA Prizm card can keep WNBA titles. */
  sport?: string;
};

const TITLE_JUNK =
  /\b(?:lot|lots|proxy|reprint|custom|candidate|worthy|you\s+pick|RP|bundle|complete\s+set|base\s+set|team\s+set|set)\b|\bx[2-9]\b|\b\d+\s*x\b|\b\d+\s*cards?\b/i;

const AUTO_RE = /\b(?:auto|autograph|autographed|signed)\b/i;
const RELIC_RE = /\b(?:patch|relic)\b/i;
const SERIAL_RE = /\/(\d+)\b/;
/** Graders / slab brands that disqualify a listing from raw comps. */
const GRADER_NAMES = SLAB_TITLE_GRADER_PATTERN;
const TITLE_GRADE_RE = new RegExp(
  `\\b(${GRADER_NAMES})\\s*(\\d+(?:\\.\\d+)?)\\b`,
  "i",
);
const GRADED_CUE_RE = new RegExp(
  `\\b(?:${GRADER_NAMES}|graded|slab)\\b|\\bGem\\s*Mint\\b`,
  "i",
);
const TITLE_HASH_NUMBER_RE = /#([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)/g;

const QUALIFIERS = ["OC", "MK", "ST", "PD", "OF", "MC"] as const;

/** Competing / sibling product lines for family exclusion. */
const SET_FAMILIES: { family: string; members: string[] }[] = [
  {
    family: "topps",
    members: [
      "topps now",
      "topps chrome",
      "topps chrome update",
      "topps cosmic chrome",
      "topps update",
      "topps heritage",
      "topps stadium club",
      "topps finest",
      "topps allen & ginter",
      "topps series 1",
      "topps series 2",
    ],
  },
  {
    family: "prizm",
    members: ["prizm draft picks", "prizm wnba", "fast break", "monopoly prizm"],
  },
  {
    family: "select",
    members: ["select"],
  },
  {
    family: "optic",
    members: ["donruss optic", "optic"],
  },
  {
    family: "bowman",
    members: [
      "bowman chrome",
      "bowman chrome sapphire",
      "bowman draft",
      "bowman sterling",
      "bowman's best",
    ],
  },
];

/**
 * Product names that are not the plain base set.
 * Used only when the saved set is that base (Fleer, not Fleer Ultra).
 */
export const SET_SUB_BRANDS: Record<string, readonly string[]> = {
  fleer: [
    "ultra",
    "tradition",
    "traditions",
    "crystal",
    "metal",
    "metal universe",
    "flair",
    "showcase",
    "e-x",
    "e-x2000",
    "skybox",
    "sky box",
    "focus",
    "mystique",
    "genuine",
    "authentix",
    "platinum",
    "tradition update",
    "greats",
  ],
  topps: [
    "chrome",
    "topps now",
    "update",
    "cosmic",
    "heritage",
    "finest",
    "stadium club",
    "bowman",
    "archives",
    "gallery",
    "gold label",
    "tribute",
    "inception",
    "museum",
    "allen & ginter",
    "gypsy queen",
    "sapphire",
  ],
  prizm: ["draft picks", "prizm monopoly", "monopoly", "wnba"],
  donruss: ["optic", "elite", "clearly"],
  bowman: ["chrome", "draft", "bowman's best", "bowmans best", "sterling", "platinum"],
  "upper deck": [
    "spx",
    "sp authentic",
    "exquisite",
    "ultimate",
    "black diamond",
    "mvp",
  ],
};

const SET_KEYWORDS = [
  "select",
  "mosaic",
  "optic",
  "donruss",
  "contenders",
  "national treasures",
  "immaculate",
  "flawless",
  "chronicles",
  "spectra",
  "absolute",
  "phoenix",
  "obsidian",
  "revolution",
  "hoops",
  "court kings",
  "monopoly",
  "prizm",
  "bowman",
  "topps chrome",
  "topps now",
  "topps cosmic",
  "topps heritage",
  "topps update",
  "topps",
  "upper deck",
  "fleer",
  "skybox",
  "score",
  "leaf",
  "panini instant",
  "panini certified",
  "donruss optic",
  "prizm draft picks",
  "bowman's best",
] as const;

const PARALLEL_KEYWORDS = [
  "silver",
  "holo",
  "refractor",
  "gold",
  "green",
  "blue",
  "red",
  "pink",
  "purple",
  "orange",
  "black",
  "white",
  "cracked ice",
  "wave",
  "scope",
  "shimmer",
  "mojo",
  "camo",
  "tie-dye",
  "disco",
  "lazer",
  "laser",
  "hyper",
  "pulsar",
  "neon",
  "snakeskin",
  "ice",
  "sparkle",
  "velocity",
  "ruby",
  "press proof",
  "no huddle",
  "choice",
  "fotl",
  "zebra",
  "tiger",
  "dragon",
  "color blast",
  "kaboom",
  "downtown",
  "ssp",
  "parallel",
] as const;

/** Counted only as their own word after the card number, and only if the set name did not already use them. */
const PARALLEL_AFTER_NUMBER = ["sp", "variation"] as const;

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeCardNumber(value: string | undefined | null): string {
  return (value ?? "").replace(/^#/, "").trim().toUpperCase();
}

export function yearLabelOf(card: MatchCard): string {
  const label = (card.yearLabel ?? "").trim();
  if (label) return label;
  if (card.year > 0) return String(card.year);
  return "";
}

export function startYearOf(card: MatchCard): string {
  const label = yearLabelOf(card);
  const match = label.match(/^(\d{4})/);
  return match ? match[1] : String(card.year);
}

function parallelIsBase(parallel?: string): boolean {
  const p = (parallel ?? "").trim().toLowerCase();
  return !p || p === "base";
}

function isRawCard(card: MatchCard): boolean {
  if (card.conditionType === "raw") return true;
  if (card.conditionType === "graded") return false;
  const parsed = parseGrade(card.grade ?? "");
  if (parsed.company === RAW_GRADE) return true;
  if (!parsed.company && !card.grade?.trim()) return true;
  return false;
}

/**
 * Human-readable comps search / preview line.
 * e.g. "2023-24 Panini Prizm #136 Victor Wembanyama RC, Base, PSA 10"
 */
export function buildCompsQuery(card: MatchCard): string {
  const year = yearLabelOf(card);
  const set = card.setBrand.trim();
  const player = card.playerName.trim();
  const num = normalizeCardNumber(card.cardNumber);
  const numberPart =
    !card.noNumber && num ? `#${num}` : "";
  const parallel = (card.parallel ?? "").trim() || "Base";
  const serial =
    card.serialRun != null && card.serialRun > 0 ? `/${card.serialRun}` : "";
  const gradePart = (() => {
    if (isRawCard(card)) return "Raw";
    const g = (card.grade ?? "").trim();
    if (g && !/^raw/i.test(g)) return g;
    return "";
  })();
  const qualifier = (card.gradeQualifier ?? "").trim().toUpperCase();
  const playerPart = [player, card.isRookie ? "RC" : ""].filter(Boolean).join(" ");

  const head = [year, set, numberPart, playerPart].filter(Boolean).join(" ");
  const tail = [
    parallelIsBase(parallel) ? "Base" : parallel,
    serial,
    card.isAuto ? "Auto" : "",
    card.isRelic ? "Patch" : "",
    gradePart,
    qualifier,
  ]
    .filter(Boolean)
    .join(", ");

  return [head, tail].filter(Boolean).join(", ").replace(/\s+/g, " ").trim();
}

/** Trawl search string (space-joined, no commas). */
export function buildSoldSearchQuery(card: MatchCard): string {
  const year = yearLabelOf(card);
  const set = card.setBrand.trim();
  const player = card.playerName.trim();
  const num = normalizeCardNumber(card.cardNumber);
  const numberPart = !card.noNumber && num ? `#${num}` : "";
  const parallel = (card.parallel ?? "").trim();
  const parallelPart =
    parallel && !parallelIsBase(parallel) ? parallel : "";
  const serial =
    card.serialRun != null && card.serialRun > 0
      ? `/${card.serialRun}`
      : "";
  const gradePart = isRawCard(card)
    ? ""
    : (card.grade ?? "").trim().replace(/^raw.*/i, "");

  return [year, set, player, numberPart, parallelPart, serial, gradePart]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleHashCardNumbers(title: string): string[] {
  const out: string[] = [];
  TITLE_HASH_NUMBER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TITLE_HASH_NUMBER_RE.exec(title)) !== null) {
    out.push(match[1].toUpperCase());
  }
  return out;
}

export function titleHasCardNumber(
  title: string,
  cardNumber?: string,
): boolean {
  const num = normalizeCardNumber(cardNumber);
  if (!num) return false;

  const hashTokens = titleHashCardNumbers(title);
  if (hashTokens.length > 0) {
    return hashTokens.some((token) => token === num);
  }

  const escaped = escapeRegExp(num);
  const re = new RegExp(`(?<![\\w#])${escaped}\\b`, "i");
  return re.test(title);
}

export function titleHasPlayer(title: string, playerName: string): boolean {
  const name = playerName.trim();
  if (!name) return true;
  const lower = title.toLowerCase();
  if (lower.includes(name.toLowerCase())) return true;
  const parts = name.split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last || last.length < 2) return false;
  const re = new RegExp(`\\b${escapeRegExp(last)}\\b`, "i");
  return re.test(title);
}

export function titleHasYear(title: string, card: MatchCard): boolean {
  const start = startYearOf(card);
  const season = yearLabelOf(card);
  if (season.includes("-") && title.includes(season)) return true;
  const re = new RegExp(`\\b${escapeRegExp(start)}\\b`);
  return re.test(title);
}

/**
 * Manufacturer words dropped from a set name so "Select" and "Panini Select"
 * share one identity. card_identity_key() in SQL must list the same words.
 */
export const SET_MANUFACTURER_WORDS = ["panini"] as const;

function normalizeSetToken(value: string): string {
  let token = value.toLowerCase();
  for (const word of SET_MANUFACTURER_WORDS) {
    token = token.replace(new RegExp(`\\b${word}\\b`, "g"), "");
  }
  return token.replace(/\s+/g, " ").trim();
}

export function setMatchPhrase(setBrand?: string): string {
  const raw = (setBrand ?? "").trim();
  if (!raw) return "";
  const withoutPanini = normalizeSetToken(raw);
  return withoutPanini || raw.toLowerCase();
}

/** Whole words of a set name. Hyphens stay inside a token so "E-X" is not "E" + "X". */
export function setNameTokens(value: string): string[] {
  return normalizeSetToken(value)
    .replace(/&/g, " ")
    .split(/\s+/)
    .map((part) => part.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""))
    .filter(Boolean);
}

/**
 * Tokens as whole words, in order. "Fleer" matches "Fleer" and not "Fleers".
 * Words may sit between the tokens; they still have to appear in this order.
 */
export function tokensInOrder(title: string, tokens: string[]): boolean {
  if (!tokens.length) return false;
  let from = 0;
  const lower = title.toLowerCase();
  for (const token of tokens) {
    const re = new RegExp(`\\b${escapeRegExp(token)}\\b`, "ig");
    re.lastIndex = from;
    const match = re.exec(lower);
    if (!match) return false;
    from = match.index + match[0].length;
  }
  return true;
}

/**
 * "Topps Now" is the product name. Words may sit between other sub-brand
 * tokens ("Topps" … "Chrome"), but a later "now" is not Topps Now.
 */
function titleHasSubBrand(title: string, sub: string): boolean {
  if (normalizeSetToken(sub) === "topps now") return /\btopps\s+now\b/i.test(title);
  return tokensInOrder(title, setNameTokens(sub));
}

export function titleHasSetName(title: string, setBrand?: string): boolean {
  const phrase = setMatchPhrase(setBrand);
  if (!phrase) return true;
  const tokens = setNameTokens(phrase);
  if (!tokens.length) return true;
  return tokensInOrder(title, tokens);
}

function sportIsWnba(sport?: string): boolean {
  return (sport ?? "").trim().toLowerCase() === "wnba";
}

function plainBaseKey(cardSet: string): string | null {
  return Object.prototype.hasOwnProperty.call(SET_SUB_BRANDS, cardSet)
    ? cardSet
    : null;
}

function knownSetNames(): string[] {
  const names = new Set<string>();
  for (const keyword of SET_KEYWORDS) names.add(keyword);
  for (const { members } of SET_FAMILIES) {
    for (const member of members) names.add(member);
  }
  for (const [base, subs] of Object.entries(SET_SUB_BRANDS)) {
    names.add(base);
    for (const sub of subs) {
      names.add(sub);
      names.add(`${base} ${sub}`);
    }
  }
  return [...names];
}

/**
 * Family logic: base "Topps" excludes Now/Chrome/Update/etc.
 * "Topps Now" requires Now. Same idea for Prizm/Select/Optic/Fleer families.
 * Plain base sets also drop sub-brands and any longer known set that starts
 * with that base name ("Fleer Ultra" is not "Fleer").
 */
export function titleNamesWrongSet(
  title: string,
  setBrand?: string,
  sport?: string,
): boolean {
  const cardSet = normalizeSetToken(setBrand ?? "");
  const lower = title.toLowerCase();

  for (const keyword of SET_KEYWORDS) {
    if (cardSet.includes(keyword)) continue;
    const re = new RegExp(
      `\\b${escapeRegExp(keyword).replace(/\s+/g, "\\s+")}\\b`,
      "i",
    );
    if (!re.test(lower)) continue;
    // "Upper Deck SP Authentic" is the SP Authentic set, not a different Upper Deck product.
    if (manufacturerBeforeSet(lower, keyword, cardSet)) continue;
    return true;
  }

  for (const { family, members } of SET_FAMILIES) {
    const cardIsBaseFamily =
      cardSet === family ||
      cardSet === `panini ${family}` ||
      (family === "topps" && cardSet === "topps");
    if (!cardIsBaseFamily) continue;
    for (const member of members) {
      if (cardSet.includes(member)) continue;
      if (sportIsWnba(sport) && /\bwnba\b/.test(member)) continue;
      const re = new RegExp(
        `\\b${escapeRegExp(member).replace(/\s+/g, "\\s+")}\\b`,
        "i",
      );
      if (re.test(lower)) return true;
    }
  }

  const base = plainBaseKey(cardSet);
  if (base) {
    for (const sub of SET_SUB_BRANDS[base]) {
      if (sub === "wnba" && sportIsWnba(sport)) continue;
      if (titleHasSubBrand(lower, sub)) return true;
    }
  }

  if (cardSet) {
    for (const name of knownSetNames()) {
      const normalized = normalizeSetToken(name);
      if (!normalized.startsWith(`${cardSet} `)) continue;
      if (sportIsWnba(sport) && /\bwnba\b/.test(normalized)) continue;
      if (titleHasSubBrand(lower, normalized)) return true;
    }
  }

  // Topps Now must require "now"
  if (/\btopps\s+now\b/i.test(cardSet) || cardSet === "topps now") {
    if (!/\bnow\b/i.test(lower)) return true;
  }

  return false;
}

function phrasePattern(phrase: string): string {
  return phrase
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => escapeRegExp(part))
    .join("\\s+");
}

/** "Upper Deck" printed immediately in front of this card's own set name. */
function manufacturerBeforeSet(
  title: string,
  keyword: string,
  cardSet: string,
): boolean {
  if (keyword !== "upper deck") return false;
  if (!cardSet || cardSet.includes(keyword)) return false;
  const pattern = phrasePattern(keyword);
  const setPattern = phrasePattern(cardSet);
  if (!pattern || !setPattern) return false;
  return new RegExp(`\\b${pattern}\\s+${setPattern}\\b`, "i").test(title);
}

function setNamePhrases(setBrand?: string): string[] {
  const raw = (setBrand ?? "").trim();
  if (!raw) return [];
  const phrases = [raw];
  const shortened = setMatchPhrase(raw);
  if (shortened && shortened !== raw.toLowerCase()) phrases.push(shortened);
  return phrases;
}

/**
 * Drop the card's own set name, and the player name only where the full name
 * matches. A lone "Tiger" beside "Tiger Woods" is still a parallel.
 */
function stripSetAndPlayer(
  title: string,
  identity?: { setBrand?: string; playerName?: string },
): string {
  let text = title;
  for (const phrase of setNamePhrases(identity?.setBrand)) {
    const pattern = phrasePattern(phrase);
    if (!pattern) continue;
    text = text.replace(new RegExp(`\\b${pattern}\\b`, "gi"), " ");
  }
  const player = (identity?.playerName ?? "").trim();
  const playerPattern = phrasePattern(player);
  if (playerPattern) {
    text = text.replace(new RegExp(`\\b${playerPattern}\\b`, "gi"), " ");
  }
  return text;
}

function parallelKeywordImmediatelyBefore(before: string): boolean {
  const trimmed = before.replace(/[\s,./|&-]+$/g, "");
  return PARALLEL_KEYWORDS.some((keyword) =>
    new RegExp(`(?:^|[^a-z0-9])${phrasePattern(keyword)}$`, "i").test(trimmed),
  );
}

/**
 * "Prizm" in "Panini Prizm #332" is the set. It is a parallel only when a
 * parallel word sits directly in front of it ("Silver Prizm", "Lazer Prizm"),
 * or the word shows up again after that set name was already matched
 * ("2025 Panini Prizm ... Hyper Prizm").
 */
function titleHasPrizmParallelCue(title: string, setBrand?: string): boolean {
  const lower = title.toLowerCase();
  const re = /\bprizm\b/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(lower)) !== null) {
    if (parallelKeywordImmediatelyBefore(lower.slice(0, match.index))) return true;
  }

  const phrase = setMatchPhrase(setBrand);
  if (!phrase || !/\bprizm\b/i.test(phrase)) return false;
  const setRe = new RegExp(`\\b${phrasePattern(phrase)}\\b`, "i");
  const setMatch = setRe.exec(lower);
  if (!setMatch) return false;
  const after = lower.slice(setMatch.index + setMatch[0].length);
  const again = /\bprizm\b/gi;
  let later: RegExpExecArray | null;
  while ((later = again.exec(after)) !== null) {
    const word = after
      .slice(0, later.index)
      .replace(/[\s,./|&-]+$/g, "")
      .match(/([a-z0-9]+)$/i);
    if (word?.[1] === "base") continue;
    return true;
  }
  return false;
}

/** Panini prints this parallel as Lazer. Sold listings often spell it Laser. */
function canonicalParallelWord(word: string): string {
  return word === "laser" ? "lazer" : word;
}

/** "Red White & Blue" and "Red and White Blue" share the words red, white, blue. */
function parallelNameWords(parallel: string): string[] {
  return parallel
    .toLowerCase()
    .replace(/&/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0 && word !== "and")
    .map(canonicalParallelWord);
}

function parallelPhrases(parallel: string): string[][] {
  const phrases = [parallelNameWords(parallel)];
  for (const alias of parallelAliasNames(parallel)) {
    phrases.push(parallelNameWords(alias));
  }
  return phrases.filter((words) => words.length > 0);
}

function phraseInTitle(title: string, words: string[]): boolean {
  if (!words.length) return false;
  const pattern = words.map((word) => escapeRegExp(word)).join("[^a-z0-9]+");
  return new RegExp(`\\b${pattern}\\b`, "i").test(title);
}

/**
 * Remove this parallel from a title before the wrong-set check.
 * Hyphens and spaces are the same, so "Optic Preview-Pink" and
 * "Optic Preview Pink" both come out. Alias phrases come out too,
 * so "Pink Optic Preview Holo" is not read as Donruss Optic.
 */
export function stripParallelPhrase(title: string, parallel?: string): string {
  if (parallelIsBase(parallel)) return title;
  let text = title;
  for (const words of parallelPhrases(parallel ?? "")) {
    const pattern = words.map((word) => escapeRegExp(word)).join("[^a-z0-9]+");
    text = text.replace(new RegExp(`\\b${pattern}\\b`, "gi"), " ");
  }
  return text;
}

function titleHasWord(title: string, word: string): boolean {
  return new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").test(title);
}

function titleHasParallelWord(title: string, word: string): boolean {
  if (word === "lazer") return titleHasWord(title, "lazer") || titleHasWord(title, "laser");
  return titleHasWord(title, word);
}

function wordAfterCardNumber(
  title: string,
  cardNumber: string | undefined,
  word: string,
): boolean {
  const num = normalizeCardNumber(cardNumber);
  if (!num) return false;
  const hash = new RegExp(`#${escapeRegExp(num)}\\b`, "i").exec(title);
  const bare = new RegExp(`(?<![\\w#])${escapeRegExp(num)}\\b`, "i").exec(title);
  const found = hash ?? bare;
  if (!found) return false;
  return titleHasWord(title.slice(found.index + found[0].length), word);
}

export function titleHasDisallowedParallel(
  title: string,
  parallel?: string,
  identity?: { setBrand?: string; playerName?: string; cardNumber?: string },
): boolean {
  const lower = title.toLowerCase();
  const scan = stripSetAndPlayer(lower, identity);
  const allowed = (parallel ?? "").trim().toLowerCase();
  const allowedWords = new Set(parallelNameWords(allowed));
  for (const alias of parallelAliasNames(parallel ?? "")) {
    const words = parallelNameWords(alias);
    if (!phraseInTitle(lower, words)) continue;
    for (const word of words) allowedWords.add(canonicalParallelWord(word));
  }
  const base = parallelIsBase(parallel);

  for (const keyword of PARALLEL_KEYWORDS) {
    if (!new RegExp(`\\b${phrasePattern(keyword)}\\b`, "i").test(scan)) continue;
    if (base) return true;
    // "Parallel" names the category. A Silver card can still say "Silver Parallel".
    if (keyword === "parallel") continue;
    if (allowedWords.has(canonicalParallelWord(keyword))) continue;
    const keywordWords = parallelNameWords(keyword);
    if (keywordWords.length > 0 && keywordWords.every((word) => allowedWords.has(word))) {
      continue;
    }
    return true;
  }

  if (base && titleHasPrizmParallelCue(title, identity?.setBrand)) return true;

  if (base) {
    const setKey = normalizeSetToken(identity?.setBrand ?? "");
    for (const word of PARALLEL_AFTER_NUMBER) {
      // Trailing "RC SP" on base Upper Deck is the Young Guns card. SP Authentic and SPX stay sub-brands.
      if (word === "sp" && setKey === "upper deck") continue;
      if (wordAfterCardNumber(scan, identity?.cardNumber, word)) return true;
    }
  }

  if (!base && allowed) {
    const words = parallelNameWords(allowed);
    if (words.length > 0 && words.some((word) => !titleHasParallelWord(lower, word))) {
      return true;
    }
  }

  return false;
}

export function titleSerialOk(
  title: string,
  serialRun?: number | null,
): boolean {
  const match = title.match(SERIAL_RE);
  if (serialRun != null && serialRun > 0) {
    if (!match) return false;
    return Number(match[1]) === serialRun;
  }
  // Card has no serial run → exclude any /NN serial in title
  return !match;
}

export function titleLooksExcluded(title: string): boolean {
  return TITLE_JUNK.test(title);
}

export function parseGradeFromTitle(
  title: string,
): { grader: string; grade: string } | null {
  const match = title.match(TITLE_GRADE_RE);
  if (!match) return null;
  return { grader: match[1].toUpperCase(), grade: match[2] };
}

function gradingDetailsCueText(result: TrawlSoldResult): string {
  const details = result.details?.grading;
  if (!details) return "";
  return [details.grader, details.grade, details.condition]
    .filter((part) => part != null && String(part).trim() !== "")
    .join(" ");
}

export function listingLooksProfessionallyGraded(
  result: TrawlSoldResult,
): boolean {
  const details = result.details?.grading;
  if (details?.graded === true) return true;
  if (details?.grader?.trim()) return true;
  if (details?.grade != null && String(details.grade).trim() !== "") {
    return true;
  }
  if (GRADED_CUE_RE.test(result.title)) return true;
  if (GRADED_CUE_RE.test(gradingDetailsCueText(result))) return true;
  return false;
}

export function resolveListingGrade(result: TrawlSoldResult): {
  grader: string | null;
  grade: string | null;
} {
  const details = result.details?.grading;
  const grader = details?.grader?.trim() || null;
  const grade =
    details?.grade != null && String(details.grade).trim() !== ""
      ? String(details.grade).trim()
      : null;

  if (grader && grade) {
    return { grader, grade };
  }

  const fromTitle = parseGradeFromTitle(result.title);
  if (fromTitle) return fromTitle;
  return { grader: null, grade: null };
}

function titleHasQualifier(title: string, qualifier: string): boolean {
  const q = qualifier.trim().toUpperCase();
  if (!q) return false;
  return new RegExp(`\\b${escapeRegExp(q)}\\b`, "i").test(title);
}

function titleHasAnyQualifier(title: string): boolean {
  return QUALIFIERS.some((q) => titleHasQualifier(title, q));
}

export function gradesMatchCard(
  card: MatchCard,
  detailsGrader: string | null | undefined,
  detailsGrade: string | null | undefined,
  title: string,
): boolean {
  if (isRawCard(card)) {
    // Raw cards reject any professional grader+grade in details or title.
    if (detailsGrader?.trim() && detailsGrade != null && String(detailsGrade).trim() !== "") {
      return false;
    }
    if (parseGradeFromTitle(title)) return false;
    return !GRADED_CUE_RE.test(title);
  }

  const parsed = parseGrade(card.grade ?? "");
  if (!parsed.company || parsed.company === RAW_GRADE || !parsed.number) {
    return false;
  }
  if (!detailsGrader || detailsGrade == null || detailsGrade === "") {
    return false;
  }
  return (
    detailsGrader.trim().toLowerCase() === parsed.company.toLowerCase() &&
    detailsGrade.trim().toLowerCase() === parsed.number.toLowerCase()
  );
}

/** Legacy helper used by older tests — prefer gradesMatchCard. */
export function gradesMatch(
  cardGrade: string | undefined,
  detailsGrader: string | null | undefined,
  detailsGrade: string | null | undefined,
): boolean {
  return gradesMatchCard(
    { playerName: "", year: 0, setBrand: "", grade: cardGrade },
    detailsGrader,
    detailsGrade,
    "",
  );
}

export function titleMatchesCard(title: string, card: MatchCard): boolean {
  if (titleLooksExcluded(title)) return false;
  if (card.playerName.trim() && !titleHasPlayer(title, card.playerName)) {
    return false;
  }
  if (
    (card.yearLabel?.trim() || card.year > 0) &&
    !titleHasYear(title, card)
  ) {
    return false;
  }
  if (!titleHasSetName(title, card.setBrand)) return false;
  const parallelName =
    canonicalParallelName(card.setBrand, card.parallel ?? "") || card.parallel;
  // Words that belong to this parallel are not a different set.
  // "Optic" inside "Optic Preview-Pink" is not Donruss Optic.
  if (titleNamesWrongSet(stripParallelPhrase(title, parallelName), card.setBrand, card.sport)) {
    return false;
  }

  const num = normalizeCardNumber(card.cardNumber);
  if (!card.noNumber) {
    if (!num) return false;
    if (!titleHasCardNumber(title, num)) return false;
  }

  if (
    titleHasDisallowedParallel(title, parallelName, {
      setBrand: card.setBrand,
      playerName: card.playerName,
      cardNumber: card.cardNumber,
    })
  ) {
    return false;
  }
  if (!titleSerialOk(title, card.serialRun)) return false;

  if (card.isAuto) {
    if (!AUTO_RE.test(title)) return false;
  } else if (AUTO_RE.test(title)) {
    return false;
  }

  if (card.isRelic) {
    if (!RELIC_RE.test(title)) return false;
  } else if (RELIC_RE.test(title)) {
    return false;
  }

  if (isRawCard(card) && GRADED_CUE_RE.test(title)) return false;

  const qualifier = (card.gradeQualifier ?? "").trim().toUpperCase();
  if (qualifier) {
    if (!titleHasQualifier(title, qualifier)) return false;
  } else if (titleHasAnyQualifier(title)) {
    return false;
  }

  return true;
}

function normalizeSoldAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString();
}

/** Expand one Trawl result into cleaned sales after match filters. */
export function cleanMatchedResult(
  result: TrawlSoldResult,
  card: MatchCard,
): CleanedSale[] {
  const details = result.details ?? null;
  if (details?.listing_state === "removed") return [];
  if (!titleMatchesCard(result.title, card)) return [];

  if (isRawCard(card) && listingLooksProfessionallyGraded(result)) {
    return [];
  }

  const resolved = resolveListingGrade(result);
  const { grader, grade } = resolved;

  if (!isRawCard(card)) {
    if (!grader || grade == null || grade === "") return [];
  }

  if (!gradesMatchCard(card, grader, grade, result.title)) return [];

  const url = result.item_link || details?.item_link || "";
  const currency = result.currency ?? null;

  const sales = details?.sales;
  if (Array.isArray(sales) && sales.length > 0) {
    const bestOfferPrice =
      details?.best_offer_accepted && typeof details.sale_price === "number"
        ? details.sale_price
        : null;

    return sales.map((sale) => ({
      itemId: result.item_id,
      title: result.title,
      price: bestOfferPrice ?? sale.sale_price,
      currency: sale.currency ?? currency,
      soldAt: normalizeSoldAt(sale.date_sold),
      grader,
      grade,
      url,
    }));
  }

  const price =
    details?.best_offer_accepted && typeof details.sale_price === "number"
      ? details.sale_price
      : result.sale_price;

  return [
    {
      itemId: result.item_id,
      title: result.title,
      price,
      currency,
      soldAt: normalizeSoldAt(result.date_sold),
      grader,
      grade,
      url,
    },
  ];
}

export function dedupeSales(sales: CleanedSale[]): CleanedSale[] {
  const seen = new Set<string>();
  const out: CleanedSale[] = [];
  for (const sale of sales) {
    const title = sale.title.toLowerCase().replace(/\s+/g, " ").trim();
    const day = sale.soldAt.slice(0, 10);
    const key = `${title}|${sale.price}|${day}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sale);
  }
  return out;
}

/**
 * Player, set, parallel, and grade match, then dedupe.
 * Does not drop price outliers. The card page re-filters through this so a
 * second outlier pass cannot shrink the list the server already priced.
 */
export function matchComps(
  card: MatchCard,
  comps: TrawlSoldResult[] | CleanedSale[],
): CleanedSale[] {
  if (!comps.length) return [];

  const first = comps[0] as TrawlSoldResult | CleanedSale;
  const isTrawl = "sale_price" in first && "item_id" in first;

  let sales: CleanedSale[];
  if (isTrawl) {
    sales = (comps as TrawlSoldResult[]).flatMap((r) =>
      cleanMatchedResult(r, card),
    );
  } else {
    // Re-filter cached CleanedSale rows against current rules
    sales = (comps as CleanedSale[]).filter((sale) => {
      const synthetic: TrawlSoldResult = {
        title: sale.title,
        sale_price: sale.price,
        shipping_price: null,
        currency: sale.currency ?? "$",
        condition: "",
        condition_raw: null,
        date_sold: sale.soldAt,
        buying_format: "",
        item_id: sale.itemId,
        item_link: sale.url,
        image_url: null,
        details: {
          listing_state: "sold",
          grading: {
            graded: Boolean(sale.grader && sale.grade),
            grader: sale.grader,
            grade: sale.grade,
            condition: null,
          },
          sales: [
            {
              date_sold: sale.soldAt,
              sale_price: sale.price,
              currency: sale.currency,
            },
          ],
        },
      };
      return cleanMatchedResult(synthetic, card).length > 0;
    });
  }

  return dedupeSales(sales);
}

/**
 * Shared comps filter used by /api/comps/sold and refreshCardValue.
 * Parallel matching runs first. Price outliers run once, on that set only.
 * Accepts raw Trawl results (preferred) or already-cleaned sales (cache re-filter).
 */
export function filterComps(
  card: MatchCard,
  comps: TrawlSoldResult[] | CleanedSale[],
): CleanedSale[] {
  return filterPriceOutliers(matchComps(card, comps));
}

/** @deprecated Use filterComps — kept as alias while callers migrate. */
export function prepareSales(
  results: TrawlSoldResult[],
  card: MatchCard,
): CleanedSale[] {
  return filterComps(card, results);
}

export function isLowConfidence(count: number): boolean {
  return count > 0 && count < 5;
}

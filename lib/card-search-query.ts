/** Shared normalize / parse / alias helpers for Add Card search. */

export const PLAYER_ALIASES: Record<string, string> = {
  wemby: "Victor Wembanyama",
  wemb: "Victor Wembanyama",
  bron: "LeBron James",
  "king james": "LeBron James",
  lbj: "LeBron James",
  ant: "Anthony Edwards",
  "ant-man": "Anthony Edwards",
  sga: "Shai Gilgeous-Alexander",
  luka: "Luka Dončić",
  cc: "Caitlin Clark",
  shohei: "Shohei Ohtani",
  mj: "Michael Jordan",
  giannis: "Giannis Antetokounmpo",
  "greek freak": "Giannis Antetokounmpo",
  mahomes: "Patrick Mahomes",
  kd: "Kevin Durant",
  steph: "Stephen Curry",
  jokic: "Nikola Jokic",
  joker: "Nikola Jokic",
};

const KNOWN_SET_WORDS = [
  "prizm",
  "select",
  "optic",
  "hoops",
  "chrome",
  "topps",
  "bowman",
  "donruss",
  "fleer",
  "upper",
  "deck",
  "update",
  "series",
  "wnba",
  "opeeche",
  "o-pee-chee",
  "score",
  "chronicles",
  "phoenix",
  "contenders",
  "leaf",
];

/** Words that describe a copy, not the catalog row. "psa 10", "card", and "raw" stay out of the AND. */
const FILLER_WORDS = new Set(["card", "cards", "raw"]);

/**
 * Rookie words are not player, set, or parallel words.
 * Keep this list in sync with search_cards. "rated-rookie" is the hyphen
 * public.norm keeps from "rated-rookie".
 */
const ROOKIE_WORDS = new Set(["rookie", "rookies", "rc", "rated-rookie", "rated-rookies"]);
const GRADER_WORDS = new Set([
  "psa",
  "bgs",
  "sgc",
  "cgc",
  "beckett",
  "graded",
  "gem",
  "mint",
]);

/** Lowercase, strip accents/punctuation — mirrors public.norm(). Keeps hyphens in seasons / card #s. */
export function normalizeSearchText(input: string): string {
  const stripped = input
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    // Preserve alnum-alnum hyphens (2023-24, BCP-1, Ant-Man → handled as words after split on other punct)
    .replace(/([a-zA-Z0-9])-([a-zA-Z0-9])/g, "$1\u0000$2")
    .replace(/[^a-zA-Z0-9\s\u0000]+/g, " ")
    .replace(/\u0000/g, "-");
  return stripped.toLowerCase().replace(/\s+/g, " ").trim();
}

export type ParsedCardQuery = {
  normalized: string;
  tokens: string[];
  expandedTokens: string[];
  cardNumber: string | null;
  yearLabel: string | null;
  setWords: string[];
  playerWords: string[];
  /** Query after whole-word alias expansion, for similarity. */
  expandedQuery: string;
  /** True when the query has rated rookie, rookie, rookies, or rc. */
  rookieQuery: boolean;
};

const CARD_NUMBER_RE =
  /^(?:#)?([a-z]{1,4}\d+[a-z0-9]*(?:-[a-z0-9]+)?|[a-z0-9]+(?:-[a-z0-9]+)+|\d+[a-z]+|\d{1,3})$/i;
const YEAR_FULL_RE = /^(19|20)\d{2}$/;
const YEAR_SEASON_RE = /^(19|20)\d{2}-\d{2}$/;
const YEAR_SHORT_SEASON_RE = /^\d{2}-\d{2}$/;

function isCardNumberToken(token: string): string | null {
  if (YEAR_FULL_RE.test(token) || YEAR_SEASON_RE.test(token)) return null;
  const m = token.match(CARD_NUMBER_RE);
  if (!m) return null;
  const num = m[1]!.toUpperCase();
  // Hyphenated names (ant-man, gilgeous-alexander) are not card numbers.
  if (!/\d/.test(num)) return null;
  // Plain 2-digit tokens are years like 24 in 24-25, not card numbers — handled elsewhere
  if (/^\d{4}$/.test(num)) return null;
  if (/^\d{1,2}$/.test(num) && Number(num) > 99) return null;
  // Prefer treating short pure numbers as card numbers when not a year
  if (/^\d{1,3}$/.test(num)) return num;
  if (/^[A-Z]{1,4}\d+[A-Z0-9]*(?:-[A-Z0-9]+)*$/i.test(num)) return num;
  if (/^\d+[A-Z]+$/i.test(num)) return num;
  return num;
}

function parseYearToken(token: string): string | null {
  if (YEAR_FULL_RE.test(token)) return token;
  if (YEAR_SEASON_RE.test(token)) return token;
  if (YEAR_SHORT_SEASON_RE.test(token)) {
    const [a, b] = token.split("-");
    const start = Number(a);
    const end = Number(b);
    if ((start + 1) % 100 !== end) return null;
    const century = start >= 50 ? 1900 : 2000;
    return `${century + start}-${String(end).padStart(2, "0")}`;
  }
  return null;
}

/** Whole-word alias expansion (multi-word aliases checked first). */
export function expandAliasTokens(tokens: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (i + 1 < tokens.length) {
      const pair = `${tokens[i]} ${tokens[i + 1]}`;
      const alias = PLAYER_ALIASES[pair];
      if (alias) {
        out.push(...normalizeSearchText(alias).split(" ").filter(Boolean));
        i += 2;
        continue;
      }
    }
    const single = PLAYER_ALIASES[tokens[i]!];
    if (single) {
      out.push(...normalizeSearchText(single).split(" ").filter(Boolean));
    } else {
      out.push(tokens[i]!);
    }
    i += 1;
  }
  return out;
}

export function parseCardQuery(query: string): ParsedCardQuery {
  const normalized = normalizeSearchText(query);
  const rawTokens = normalized.split(" ").filter(Boolean);

  let cardNumber: string | null = null;
  let yearLabel: string | null = null;
  const setWords: string[] = [];
  const remaining: string[] = [];
  let gradeSkip = 0;
  let rookieQuery = false;
  let index = 0;

  while (index < rawTokens.length) {
    const token = rawTokens[index]!;
    if (GRADER_WORDS.has(token)) {
      gradeSkip = 2;
      index += 1;
      continue;
    }
    if (gradeSkip > 0 && /^\d{1,2}$/.test(token)) {
      gradeSkip -= 1;
      index += 1;
      continue;
    }
    gradeSkip = 0;
    const next = rawTokens[index + 1];
    if (token === "rated" && (next === "rookie" || next === "rookies")) {
      rookieQuery = true;
      index += 2;
      continue;
    }
    if (ROOKIE_WORDS.has(token)) {
      rookieQuery = true;
      index += 1;
      continue;
    }
    if (FILLER_WORDS.has(token)) {
      index += 1;
      continue;
    }

    const year = parseYearToken(token);
    if (year && !yearLabel) {
      yearLabel = year;
      index += 1;
      continue;
    }
    const num = isCardNumberToken(token);
    // Card numbers: #136 style, BCP-1, US1 — not year-like 4-digit
    if (
      num &&
      !cardNumber &&
      (token.startsWith("#") ||
        /[a-z]/i.test(num) ||
        num.includes("-") ||
        (/^\d{1,3}$/.test(num) && !YEAR_FULL_RE.test(token)))
    ) {
      cardNumber = num;
      index += 1;
      continue;
    }
    if (KNOWN_SET_WORDS.includes(token) || token === "pee" || token === "chee") {
      setWords.push(token);
      index += 1;
      continue;
    }
    remaining.push(token);
    index += 1;
  }

  const expandedTokens = expandAliasTokens(remaining);
  const playerWords = expandedTokens.filter(Boolean);
  const expandedQuery = [
    ...playerWords,
    yearLabel,
    ...setWords,
    cardNumber,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    normalized,
    tokens: rawTokens,
    expandedTokens,
    cardNumber,
    yearLabel,
    setWords,
    playerWords,
    expandedQuery: expandedQuery || normalized,
    rookieQuery,
  };
}

/** Prefill hints when the user chooses manual entry. */
export function parseManualPrefill(query: string): {
  playerName: string;
  yearLabel: string;
  cardNumber: string;
} {
  const parsed = parseCardQuery(query);
  // Name-like words only. A year, number, or set word stays out of the player field.
  const playerName = parsed.playerWords
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return {
    playerName,
    yearLabel: parsed.yearLabel ?? "",
    cardNumber: parsed.cardNumber ?? "",
  };
}

/** Dice coefficient on character bigrams — light typo tolerance for local fallback. */
export function bigramSimilarity(a: string, b: string): number {
  const left = normalizeSearchText(a);
  const right = normalizeSearchText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) {
    return left.includes(right) || right.includes(left) ? 0.5 : 0;
  }
  const grams = (s: string) => {
    const set = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      set.set(g, (set.get(g) ?? 0) + 1);
    }
    return set;
  };
  const A = grams(left);
  const B = grams(right);
  let overlap = 0;
  for (const [g, n] of A) {
    overlap += Math.min(n, B.get(g) ?? 0);
  }
  return (2 * overlap) / (left.length - 1 + (right.length - 1));
}

export type SearchableCard = {
  id: string;
  player: string;
  yearLabel: string;
  setName: string;
  cardNumber: string;
  parallel: string;
  sport: string;
  searchText: string;
  /** Catalog flag. Absent rows are not rookies. */
  isRookie: boolean;
};

export function buildSearchText(card: {
  player: string;
  yearLabel: string;
  setName: string;
  cardNumber: string;
}): string {
  return normalizeSearchText(
    [card.player, card.yearLabel, card.setName, card.cardNumber].join(" "),
  );
}

const PARTIAL_PREFIX_MIN = 3;
/**
 * A prefix has to be a stem ("wemb" → Wembanyama), not a different full name
 * that happens to be a prefix ("williams" vs "williamson" is 8/11).
 */
const PARTIAL_PREFIX_MAX_RATIO = 0.7;
const TYPO_MIN_LENGTH = 4;
const TYPO_MAX_LENGTH_DELTA = 2;
const TYPO_MIN_SIMILARITY = 0.75;

type WordHit = "exact" | "partial";

type FieldHits = {
  playerHits: number;
  yearHits: number;
  setHits: number;
  numberHits: number;
  parallelHits: number;
  playerExact: number;
};

/** "c" + "j" + "stroud" also matches the typed token "cj". */
function collapseInitials(words: string[]): string[] {
  const out: string[] = [];
  let buf = "";
  for (const word of words) {
    if (word.length === 1) {
      buf += word;
      continue;
    }
    if (buf) {
      out.push(buf);
      buf = "";
    }
    out.push(word);
  }
  if (buf) out.push(buf);
  return out;
}

function wordHit(token: string, word: string): WordHit | null {
  if (!token || !word) return null;
  if (token === word) return "exact";
  if (
    token.length >= PARTIAL_PREFIX_MIN &&
    word.startsWith(token) &&
    token.length / word.length <= PARTIAL_PREFIX_MAX_RATIO
  ) {
    return "partial";
  }
  if (
    token.length >= TYPO_MIN_LENGTH &&
    Math.abs(word.length - token.length) <= TYPO_MAX_LENGTH_DELTA &&
    bigramSimilarity(token, word) >= TYPO_MIN_SIMILARITY
  ) {
    return "partial";
  }
  return null;
}

function bestWordHit(token: string, words: string[]): WordHit | null {
  let partial = false;
  for (const word of words) {
    const hit = wordHit(token, word);
    if (hit === "exact") return "exact";
    if (hit === "partial") partial = true;
  }
  return partial ? "partial" : null;
}

function playerHit(token: string, player: string): WordHit | null {
  const words = normalizeSearchText(player).split(" ").filter(Boolean);
  if (words.includes(token) || collapseInitials(words).includes(token)) {
    return "exact";
  }
  let partial = false;
  for (const word of words) {
    if (wordHit(token, word) === "partial") partial = true;
  }
  return partial ? "partial" : null;
}

/** 2 = exact year label, 1 = same starting year (2023 matches 2023-24). */
function yearHit(token: string, yearLabel: string): number {
  const year = parseYearToken(token);
  if (!year) return 0;
  const label = normalizeSearchText(yearLabel);
  if (!label) return 0;
  if (label === year) return 2;
  if (label.slice(0, 4) === year.slice(0, 4)) return 1;
  return 0;
}

function setHit(token: string, setName: string): boolean {
  const full = normalizeSearchText(setName);
  if (!full) return false;
  if (token === full) return true;
  const parts = full.split(/[\s-]+/).filter(Boolean);
  return bestWordHit(token, parts) != null;
}

function numberHit(token: string, cardNumber: string): boolean {
  const want = isCardNumberToken(token);
  if (!want) return false;
  return normalizeSearchText(cardNumber) === normalizeSearchText(want);
}

/** Exact, or the same 3+ character stem as wordHit. No typo match on parallels. */
function parallelHit(token: string, parallel: string): boolean {
  const parts = normalizeSearchText(parallel).split(/[\s-]+/).filter(Boolean);
  for (const word of parts) {
    if (word === token) return true;
    if (
      token.length >= PARTIAL_PREFIX_MIN &&
      word.startsWith(token) &&
      token.length / word.length <= PARTIAL_PREFIX_MAX_RATIO
    ) {
      return true;
    }
  }
  return false;
}

/** Every token must match player, year, set, card number, or parallel. */
export function matchQueryTokens(
  card: SearchableCard,
  tokens: string[],
): FieldHits | null {
  if (!tokens.length) return null;
  const hits: FieldHits = {
    playerHits: 0,
    yearHits: 0,
    setHits: 0,
    numberHits: 0,
    parallelHits: 0,
    playerExact: 0,
  };
  for (const token of tokens) {
    const player = playerHit(token, card.player);
    if (player) {
      hits.playerHits += 1;
      if (player === "exact") hits.playerExact += 1;
      continue;
    }
    const year = yearHit(token, card.yearLabel);
    if (year) {
      hits.yearHits += year;
      continue;
    }
    if (setHit(token, card.setName)) {
      hits.setHits += 1;
      continue;
    }
    if (numberHit(token, card.cardNumber)) {
      hits.numberHits += 1;
      continue;
    }
    if (parallelHit(token, card.parallel)) {
      hits.parallelHits += 1;
      continue;
    }
    return null;
  }
  return hits;
}

export function tokensToMatch(parsed: ParsedCardQuery): string[] {
  const tokens = [...parsed.playerWords];
  if (parsed.yearLabel) tokens.push(parsed.yearLabel);
  tokens.push(...parsed.setWords);
  if (parsed.cardNumber) tokens.push(normalizeSearchText(parsed.cardNumber));
  return tokens.filter(Boolean);
}

function compareHits(
  a: FieldHits & { card: SearchableCard },
  b: FieldHits & { card: SearchableCard },
): number {
  if (b.playerHits !== a.playerHits) return b.playerHits - a.playerHits;
  if (b.yearHits !== a.yearHits) return b.yearHits - a.yearHits;
  if (b.setHits !== a.setHits) return b.setHits - a.setHits;
  if (b.numberHits !== a.numberHits) return b.numberHits - a.numberHits;
  if (b.parallelHits !== a.parallelHits) return b.parallelHits - a.parallelHits;
  if (b.playerExact !== a.playerExact) return b.playerExact - a.playerExact;
  const aBase = a.card.parallel.toLowerCase() === "base" ? 1 : 0;
  const bBase = b.card.parallel.toLowerCase() === "base" ? 1 : 0;
  if (bBase !== aBase) return bBase - aBase;
  const byPlayer = a.card.player.localeCompare(b.card.player);
  if (byPlayer) return byPlayer;
  const byYear = a.card.yearLabel.localeCompare(b.card.yearLabel);
  if (byYear) return byYear;
  const bySet = a.card.setName.localeCompare(b.card.setName);
  if (bySet) return bySet;
  return a.card.cardNumber.localeCompare(b.card.cardNumber, undefined, {
    numeric: true,
  });
}

/**
 * Parallel words are not player names. search_cards skips these when it builds
 * candidate words, so "ohtani refractor" can still match on ohtani.
 * Keep this list in sync with parallel_hints in the catalog search migration.
 */
export const PARALLEL_ANCHOR_SKIP = new Set([
  "base",
  "silver",
  "holo",
  "refractor",
  "green",
  "gold",
  "golden",
  "red",
  "blue",
  "purple",
  "orange",
  "pink",
  "black",
  "white",
  "yellow",
  "velocity",
  "pandora",
  "shimmer",
  "cracked",
  "snakeskin",
  "wave",
  "scope",
  "ice",
]);

/** Longest player word that is not a parallel hint. Null when every word is one. */
export function catalogCandidateAnchor(playerWords: readonly string[]): string | null {
  let anchor: string | null = null;
  let best = 0;
  for (const word of playerWords) {
    if (!word || PARALLEL_ANCHOR_SKIP.has(word)) continue;
    if (word.length > best) {
      anchor = word;
      best = word.length;
    }
  }
  return anchor;
}

/**
 * True when the query has no player anchor, year, card number, or set word.
 * search_cards returns no rows instead of scanning the catalog.
 */
export function catalogCandidateRefusesScan(parsed: ParsedCardQuery): boolean {
  return (
    catalogCandidateAnchor(parsed.playerWords) == null &&
    !parsed.yearLabel &&
    !parsed.cardNumber &&
    parsed.setWords.length === 0
  );
}

function longestWord(words: readonly string[]): string | null {
  let best: string | null = null;
  for (const word of words) {
    if (!best || word.length > best.length) best = word;
  }
  return best;
}

/**
 * Every non-parallel word can find candidates. Words of 3+ characters are the
 * pattern; a query made only of shorter words (such as "cc") uses those instead.
 */
export function catalogCandidateWords(playerWords: readonly string[]): {
  phrase: string;
  patternWords: string[];
} {
  const words: string[] = [];
  for (const word of playerWords) {
    if (!word || PARALLEL_ANCHOR_SKIP.has(word)) continue;
    if (!words.includes(word)) words.push(word);
  }
  const longWords = words.filter((word) => word.length >= 3);
  return {
    phrase: words.join(" "),
    patternWords: longWords.length > 0 ? longWords : words,
  };
}

/** Share of the query's padded trigrams that also appear in the target. */
function queryTrigramCoverage(query: string, target: string): number {
  const left = normalizeSearchText(query);
  const right = normalizeSearchText(target);
  if (!left || !right) return 0;
  const grams = (value: string) => {
    const padded = `  ${value} `;
    const set = new Set<string>();
    for (let index = 0; index < padded.length - 2; index += 1) {
      set.add(padded.slice(index, index + 3));
    }
    return set;
  };
  const queryGrams = grams(left);
  if (queryGrams.size === 0) return 0;
  const targetGrams = grams(right);
  let shared = 0;
  for (const gram of queryGrams) {
    if (targetGrams.has(gram)) shared += 1;
  }
  return shared / queryGrams.size;
}

function wholeWordInText(word: string, text: string): boolean {
  return new RegExp(`(^| )${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(text);
}

/**
 * At most 300 candidates, mirroring the prefilter inside public.search_cards.
 * Any non-parallel word of 3+ characters can match the player or search text.
 * A card-number token also matches that number as a whole word in the set name.
 * Candidates are ordered by how well the query words cover player, set, number,
 * and parallel. A parallel-only query returns nothing.
 */
export function prefilterCatalogCandidates(
  cards: SearchableCard[],
  parsed: ParsedCardQuery,
  limit = 300,
): SearchableCard[] {
  if (catalogCandidateRefusesScan(parsed)) return [];
  const { phrase, patternWords } = catalogCandidateWords(parsed.playerWords);
  const yearPrefix = parsed.yearLabel ? parsed.yearLabel.slice(0, 4) : null;
  const number = parsed.cardNumber ? normalizeSearchText(parsed.cardNumber) : null;
  const setAnchor = longestWord(parsed.setWords);
  const cap = Math.max(1, Math.min(limit, 300));
  const matchPhrase = tokensToMatch(parsed).join(" ");

  const matched = cards.filter((card) => {
    if (yearPrefix && !card.yearLabel.startsWith(yearPrefix)) return false;
    if (number) {
      const onCard =
        normalizeSearchText(card.cardNumber) === number ||
        wholeWordInText(number, card.searchText);
      if (!onCard) return false;
    }
    if (patternWords.length > 0) {
      const player = normalizeSearchText(card.player);
      const named = patternWords.some(
        (word) => player.includes(word) || card.searchText.includes(word),
      );
      if (named) return true;
      return phrase.length > 0 && queryTrigramCoverage(phrase, player) >= 0.5;
    }
    if (setAnchor) return card.searchText.includes(setAnchor);
    return yearPrefix != null || number != null;
  });

  return matched
    .map((card) => ({
      card,
      covered: queryTrigramCoverage(
        matchPhrase,
        `${card.searchText} ${normalizeSearchText(card.parallel)}`,
      ),
      playerSim: phrase ? queryTrigramCoverage(phrase, card.player) : 0,
    }))
    .sort((a, b) => {
      if (parsed.rookieQuery && a.card.isRookie !== b.card.isRookie) {
        return Number(b.card.isRookie) - Number(a.card.isRookie);
      }
      return (
        b.covered - a.covered ||
        b.playerSim - a.playerSim ||
        a.card.player.localeCompare(b.card.player) ||
        a.card.id.localeCompare(b.card.id)
      );
    })
    .slice(0, cap)
    .map((row) => row.card);
}

export function searchCardsLocal(
  query: string,
  cards: SearchableCard[],
  maxResults = 20,
): SearchableCard[] {
  const q = query.trim();
  if (!q || q.length > 100) return [];
  const parsed = parseCardQuery(q);
  if (!parsed.normalized) return [];
  const tokens = tokensToMatch(parsed);
  if (!tokens.length) return [];

  // Same ranking as public.search_cards. The SQL function ranks at most 300
  // trigram candidates first; this path ranks whatever list it is given so the
  // existing catalog tests stay on the full in-memory seed.
  const ranked = cards
    .map((card) => {
      const hits = matchQueryTokens(card, tokens);
      return hits ? { card, ...hits } : null;
    })
    .filter((row): row is FieldHits & { card: SearchableCard } => row != null)
    .sort((a, b) => {
      if (parsed.rookieQuery && a.card.isRookie !== b.card.isRookie) {
        return Number(b.card.isRookie) - Number(a.card.isRookie);
      }
      return compareHits(a, b);
    });

  return ranked.slice(0, Math.max(1, Math.min(maxResults, 50))).map((row) => row.card);
}

export function formatCatalogResultLabel(card: {
  player: string;
  yearLabel: string;
  setName: string;
  cardNumber: string;
  parallel: string;
}): string {
  const parallel = card.parallel?.trim() || "Base";
  return `${card.yearLabel} ${card.setName} #${card.cardNumber} ${card.player}, ${parallel}`;
}

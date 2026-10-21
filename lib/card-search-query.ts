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
];

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

  for (const token of rawTokens) {
    const year = parseYearToken(token);
    if (year && !yearLabel) {
      yearLabel = year;
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
      continue;
    }
    if (KNOWN_SET_WORDS.includes(token) || token === "pee" || token === "chee") {
      setWords.push(token);
      continue;
    }
    remaining.push(token);
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

const SCORE_THRESHOLD = 0.22;

export function scoreCard(
  card: SearchableCard,
  parsed: ParsedCardQuery,
): number {
  const hay = card.searchText;
  const playerNorm = normalizeSearchText(card.player);
  const query = parsed.expandedQuery;

  let score =
    bigramSimilarity(hay, query) * 0.65 +
    bigramSimilarity(playerNorm, parsed.playerWords.join(" ") || query) * 0.45;

  if (parsed.cardNumber) {
    const cn = normalizeSearchText(card.cardNumber);
    const want = normalizeSearchText(parsed.cardNumber);
    if (cn === want) score += 2.2;
    else if (cn.includes(want) || want.includes(cn)) score += 0.4;
  }

  if (parsed.yearLabel) {
    const yl = normalizeSearchText(card.yearLabel);
    const want = normalizeSearchText(parsed.yearLabel);
    if (yl === want || yl.startsWith(want.slice(0, 4)) || want.startsWith(yl.slice(0, 4))) {
      score += 1.1;
    }
  }

  if (parsed.setWords.length) {
    const setNorm = normalizeSearchText(card.setName);
    const hits = parsed.setWords.filter((w) => setNorm.includes(w)).length;
    if (hits > 0) score += 0.9 * hits;
  }

  // Soft gate: every expanded player token should be roughly present
  if (parsed.playerWords.length) {
    const playerHits = parsed.playerWords.filter(
      (t) =>
        playerNorm.includes(t) ||
        bigramSimilarity(playerNorm, t) >= 0.45 ||
        [...playerNorm.split(" ")].some((pw) => bigramSimilarity(pw, t) >= 0.55),
    ).length;
    if (playerHits === 0 && !parsed.cardNumber && !parsed.setWords.length) {
      score *= 0.15;
    } else {
      score += 0.25 * (playerHits / parsed.playerWords.length);
    }
  }

  return score;
}

export function searchCardsLocal(
  query: string,
  cards: SearchableCard[],
  maxResults = 20,
): SearchableCard[] {
  const q = query.trim();
  if (!q) return [];
  const parsed = parseCardQuery(q);
  if (!parsed.normalized || parsed.normalized.length < 1) return [];

  // Junk / noise: very short gibberish with no structure and weak coverage
  if (
    !parsed.cardNumber &&
    !parsed.yearLabel &&
    parsed.setWords.length === 0 &&
    parsed.playerWords.length === 1 &&
    parsed.playerWords[0]!.length <= 5 &&
    !PLAYER_ALIASES[parsed.tokens[0] ?? ""]
  ) {
    // still allow short aliases; fall through for fuzzy
  }

  const wantNum = parsed.cardNumber
    ? normalizeSearchText(parsed.cardNumber)
    : null;

  const ranked = cards
    .map((card) => ({ card, score: scoreCard(card, parsed) }))
    .filter((row) => row.score >= SCORE_THRESHOLD)
    .sort((a, b) => {
      if (wantNum) {
        const aNum =
          normalizeSearchText(a.card.cardNumber) === wantNum ? 1 : 0;
        const bNum =
          normalizeSearchText(b.card.cardNumber) === wantNum ? 1 : 0;
        if (bNum !== aNum) return bNum - aNum;
      }
      const aBase = a.card.parallel.toLowerCase() === "base" ? 1 : 0;
      const bBase = b.card.parallel.toLowerCase() === "base" ? 1 : 0;
      if (bBase !== aBase) return bBase - aBase;
      if (b.score !== a.score) return b.score - a.score;
      return a.card.player.localeCompare(b.card.player);
    });

  // Extra junk filter: max score still weak
  if (!ranked.length || ranked[0]!.score < SCORE_THRESHOLD) return [];

  return ranked.slice(0, maxResults).map((r) => r.card);
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

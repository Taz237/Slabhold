import {
  GRADER_WORDS,
  normalizeSearchText,
  parseCardQuery,
  tokensToMatch,
} from "@/lib/card-search-query";

/**
 * Words that must match, after case, spacing, @, filler, grade, and rookie words
 * are folded the same way as catalog search.
 * "rookie", "rc", and "rookie card" are not words here. Catalog ranking treats
 * them as the rookie flag. Everywhere else they are filler.
 */
export function meaningfulSearchWords(query: string): string[] {
  const stripped = query.trim().replace(/^@+/, "");
  return tokensToMatch(parseCardQuery(stripped));
}

/**
 * Plain words for people and posts.
 * A leading @ is stripped. There is no alias expansion, and filler, grade,
 * and rookie words stay in the list.
 */
export function plainSearchWords(query: string): string[] {
  const stripped = query.trim().replace(/^@+/, "");
  return normalizeSearchText(stripped).split(" ").filter(Boolean);
}

/** "graded", "gem", and "mint" mean the card has a grade. They are not words to find. */
const ANY_GRADE_WORDS = new Set(["graded", "gem", "mint"]);

const GRADE_NUMBER = /^\d{1,2}(?:\.\d+)?$/;

/** Lowercase tokens. A decimal grade such as 9.5 stays one token. */
function gradeTokens(input: string): string[] {
  const prepared = input
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/(\d)\.(\d)/g, "$1\u0000$2")
    .replace(/[^a-z0-9\u0000]+/g, " ")
    .replace(/\u0000/g, ".")
    .trim()
    .replace(/\s+/g, " ");
  return prepared ? prepared.split(" ") : [];
}

function gradeNeed(query: string): { anyGrade: boolean; tokens: string[] } {
  const tokens = gradeTokens(query.trim().replace(/^@+/, ""));
  const required: string[] = [];
  let anyGrade = false;
  let gradeSkip = 0;
  for (const token of tokens) {
    if (ANY_GRADE_WORDS.has(token)) {
      anyGrade = true;
      gradeSkip = 2;
      continue;
    }
    if (GRADER_WORDS.has(token)) {
      required.push(token);
      gradeSkip = 2;
      continue;
    }
    if (gradeSkip > 0 && GRADE_NUMBER.test(token)) {
      required.push(token);
      gradeSkip -= 1;
      continue;
    }
    gradeSkip = 0;
  }
  return { anyGrade, tokens: required };
}

function plainContentWords(query: string, need: { tokens: string[] }): string[] {
  const skip = new Set([...need.tokens, ...ANY_GRADE_WORDS]);
  return gradeTokens(query.trim().replace(/^@+/, "")).filter((token) => !skip.has(token));
}

function gradeTokenSet(grade: string | null | undefined): Set<string> {
  return new Set(gradeTokens(grade ?? ""));
}

/**
 * True when every card-search word appears in at least one field.
 * A query the card grammar empties ("psa 10", "rookie") falls back to plain
 * words. Grade words are whole tokens of `grade` only, so a year, card number,
 * or team cannot satisfy "10" or "9.5".
 */
export function matchesEverySearchWord(
  query: string,
  fields: readonly (string | number | null | undefined)[],
  options?: { grade?: string | null },
): boolean {
  const grammar = meaningfulSearchWords(query);
  const need = gradeNeed(query);
  const words = grammar.length > 0 ? grammar : plainContentWords(query, need);
  if (words.length === 0 && need.tokens.length === 0 && !need.anyGrade) return false;
  const haystack = normalizeSearchText(
    fields.map((field) => (field == null ? "" : String(field))).join(" "),
  );
  if (!words.every((word) => haystack.includes(word))) return false;
  if (need.tokens.length === 0 && !need.anyGrade) return true;
  const gradeWords = gradeTokenSet(options?.grade);
  if (need.anyGrade && gradeWords.size === 0) return false;
  return need.tokens.every((token) => gradeWords.has(token));
}

/**
 * People and posts. Every plain word must appear. When normalization leaves
 * nothing ("田中", "日本", "🔥"), the trimmed query matches as a raw substring.
 */
export function matchesPlainWords(
  query: string,
  fields: readonly (string | number | null | undefined)[],
): boolean {
  const words = plainSearchWords(query);
  const rawFields = fields.map((field) => (field == null ? "" : String(field))).join(" ");
  if (words.length === 0) {
    const raw = query.trim().replace(/^@+/, "").toLowerCase();
    if (!raw) return false;
    return rawFields.toLowerCase().includes(raw);
  }
  const haystack = normalizeSearchText(rawFields);
  return words.every((word) => haystack.includes(word));
}

/** Own-card fields Search is allowed to read. No price, notes, or cert. */
export function ownCardSearchFields(card: {
  playerName: string;
  year: number | string;
  yearLabel?: string | null;
  setBrand: string;
  cardNumber?: string | null;
  parallel?: string | null;
  team?: string | null;
  grade?: string | null;
}): string[] {
  return [
    card.playerName,
    card.yearLabel ?? "",
    String(card.year),
    card.setBrand,
    card.cardNumber ?? "",
    card.parallel ?? "",
    card.team ?? "",
    card.grade ?? "",
  ];
}

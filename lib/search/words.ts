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

/** 1 through 10, or a half point such as 9.5. "#57" is a card number, not a grade. */
const GRADE_NUMBER = /^(?:10|[1-9])(?:\.5)?$/;
const GLUED_GRADE = /^(psa|bgs|sgc|cgc|beckett)(\d{1,2}(?:\.\d+)?)$/;
/** "psa10" and "psa-10" are the same grade words once punctuation is gone. */
const GLUED_GRADE_WORD = /^(?:psa|bgs|sgc|cgc|beckett)-?\d{1,2}(?:\.\d+)?$/;

type GradeNeed = {
  anyGrade: boolean;
  tokens: string[];
  /**
   * A 1-10 number directly before a grader that is not followed by its own
   * grade number. It is not a year or a card number. A "#57" never qualifies.
   */
  before: string[];
};

/** Lowercase tokens. A decimal grade such as 9.5 stays one token. "psa10" splits. */
function gradeTokens(input: string): string[] {
  const prepared = input
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/#(?=\d)/g, "\u0001")
    .replace(/(\d)\.(\d)/g, "$1\u0000$2")
    .replace(/[^a-z0-9\u0000\u0001]+/g, " ")
    .replace(/\u0000/g, ".")
    .replace(/\u0001/g, "#")
    .trim()
    .replace(/\s+/g, " ");
  if (!prepared) return [];
  return prepared.split(" ").flatMap((token) => {
    const glued = token.match(GLUED_GRADE);
    return glued ? [glued[1]!, glued[2]!] : [token];
  });
}

function gradeNeed(query: string): GradeNeed {
  const tokens = gradeTokens(query.trim().replace(/^@+/, ""));
  const required: string[] = [];
  const before: string[] = [];
  let anyGrade = false;
  let gradeSkip = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (ANY_GRADE_WORDS.has(token)) {
      anyGrade = true;
      gradeSkip = 2;
      continue;
    }
    if (GRADER_WORDS.has(token)) {
      const next = tokens[index + 1];
      const followedByGrade = Boolean(next && GRADE_NUMBER.test(next));
      const previous = index > 0 ? tokens[index - 1] : undefined;
      if (
        !followedByGrade &&
        previous &&
        GRADE_NUMBER.test(previous) &&
        !required.includes(previous)
      ) {
        required.push(previous);
        before.push(previous);
      }
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
  return { anyGrade, tokens: required, before };
}

/** Grade numbers, and the split pieces of a decimal, stay out of year and card-number matching. */
function gradeWordsToDrop(need: GradeNeed): Set<string> {
  const skip = new Set<string>(need.before);
  for (const token of need.tokens) {
    if (!GRADE_NUMBER.test(token) || !token.includes(".")) continue;
    skip.add(token);
    for (const piece of token.split(".")) {
      if (piece) skip.add(piece);
    }
  }
  return skip;
}

function plainContentWords(query: string, need: { tokens: string[] }): string[] {
  const skip = new Set([...need.tokens, ...ANY_GRADE_WORDS]);
  return gradeTokens(query.trim().replace(/^@+/, ""))
    .filter((token) => !skip.has(token))
    .map((token) => token.replace(/^#/, ""))
    .filter(Boolean);
}

function gradeTokenSet(grade: string | null | undefined): Set<string> {
  return new Set(gradeTokens(grade ?? ""));
}

/** A grade of Raw does not count. "graded", "gem", and "mint" need a real grade. */
function gradeIsPresent(tokens: Set<string>): boolean {
  for (const token of tokens) {
    if (token !== "raw") return true;
  }
  return false;
}

/**
 * True when every card-search word appears in at least one field.
 * A query the card grammar empties ("psa 10", "rookie") falls back to plain
 * words. A number directly before a grader is a grade only when that grader
 * has no number of its own, and a "#57" stays a card number. Those grade
 * tokens match `grade` only, so a year or team cannot satisfy "10" or "9.5".
 */
export function matchesEverySearchWord(
  query: string,
  fields: readonly (string | number | null | undefined)[],
  options?: { grade?: string | null },
): boolean {
  const grammar = meaningfulSearchWords(query);
  const need = gradeNeed(query);
  const held = gradeWordsToDrop(need);
  const source = grammar.length > 0 ? grammar : plainContentWords(query, need);
  const words = source.filter((word) => !held.has(word) && !GLUED_GRADE_WORD.test(word));
  if (words.length === 0 && need.tokens.length === 0 && !need.anyGrade) return false;
  const haystack = normalizeSearchText(
    fields.map((field) => (field == null ? "" : String(field))).join(" "),
  );
  if (!words.every((word) => haystack.includes(word))) return false;
  if (need.tokens.length === 0 && !need.anyGrade) return true;
  const gradeWords = gradeTokenSet(options?.grade);
  if (need.anyGrade && !gradeIsPresent(gradeWords)) return false;
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

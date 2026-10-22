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

/** Grader names and the grade numbers the card grammar drops after them. */
function gradeSearchWords(query: string): string[] {
  const grades: string[] = [];
  let gradeSkip = 0;
  for (const token of plainSearchWords(query)) {
    if (GRADER_WORDS.has(token)) {
      grades.push(token);
      gradeSkip = 2;
      continue;
    }
    if (gradeSkip > 0 && /^\d{1,2}$/.test(token)) {
      grades.push(token);
      gradeSkip -= 1;
      continue;
    }
    gradeSkip = 0;
  }
  return grades;
}

/**
 * True when every card-search word appears in at least one field.
 * A query the card grammar empties ("psa 10", "rookie") falls back to plain
 * words. Grade words stay required, so "ohtani psa 10" does not hit a PSA 9.
 */
export function matchesEverySearchWord(
  query: string,
  fields: readonly (string | number | null | undefined)[],
): boolean {
  const grammar = meaningfulSearchWords(query);
  const words = grammar.length > 0 ? [...grammar] : plainSearchWords(query);
  if (grammar.length > 0) {
    for (const grade of gradeSearchWords(query)) {
      if (!words.includes(grade)) words.push(grade);
    }
  }
  if (words.length === 0) return false;
  const haystack = normalizeSearchText(
    fields.map((field) => (field == null ? "" : String(field))).join(" "),
  );
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

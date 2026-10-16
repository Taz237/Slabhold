import { parseGrade, RAW_GRADE } from "@/lib/card-options";

/**
 * Cache key: "<cardId>|<number>|<grader>|<grade>|<parallel>"
 * Same physical card with different grade/parallel must not share cache rows.
 */
export function buildQueryKey(card: {
  id: string;
  cardNumber?: string;
  grade?: string;
  parallel?: string;
}): string {
  const number = (card.cardNumber ?? "").replace(/^#/, "").trim();
  const parsed = parseGrade(card.grade ?? "");
  let grader = "";
  let grade = "";
  if (parsed.company === RAW_GRADE) {
    grader = "Raw";
    grade = "";
  } else if (parsed.company) {
    grader = parsed.company;
    grade = parsed.number;
  }
  const parallel = (card.parallel ?? "").trim() || "Base";
  return `${card.id}|${number}|${grader}|${grade}|${parallel}`;
}

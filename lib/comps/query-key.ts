import { parseGrade, RAW_GRADE } from "@/lib/card-options";

/**
 * Cache key includes identity fields that change matching.
 * Same physical card with different grade/parallel/set must not share rows.
 */
export function buildQueryKey(card: {
  id: string;
  year?: number;
  yearLabel?: string;
  setBrand?: string;
  cardNumber?: string;
  grade?: string;
  parallel?: string;
  serialRun?: number | null;
  isAuto?: boolean;
  isRelic?: boolean;
  gradeQualifier?: string | null;
  conditionType?: "raw" | "graded";
}): string {
  const number = (card.cardNumber ?? "").replace(/^#/, "").trim();
  const parsed = parseGrade(card.grade ?? "");
  let grader = "";
  let grade = "";
  const raw =
    card.conditionType === "raw" ||
    parsed.company === RAW_GRADE ||
    (!parsed.company && card.conditionType !== "graded");
  if (raw) {
    grader = "Raw";
    grade = "";
  } else if (parsed.company) {
    grader = parsed.company;
    grade = parsed.number;
  }
  const parallel = (card.parallel ?? "").trim() || "Base";
  const year = (card.yearLabel ?? "").trim() || String(card.year ?? "");
  const set = (card.setBrand ?? "").trim().toLowerCase();
  const serial = card.serialRun != null ? String(card.serialRun) : "";
  const auto = card.isAuto ? "1" : "0";
  const relic = card.isRelic ? "1" : "0";
  const qualifier = (card.gradeQualifier ?? "").trim().toUpperCase();
  return `${card.id}|${year}|${set}|${number}|${grader}|${grade}|${parallel}|${serial}|${auto}|${relic}|${qualifier}`;
}

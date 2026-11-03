import { formatGrade, GRADE_NUMBERS, gradeSelectOptions, parseGrade, RAW_GRADE } from "@/lib/card-options";

/** The segmented control, in order. "Other" opens a company and grade select. */
export const QUICK_GRADES = [RAW_GRADE, "PSA 10", "PSA 9", "BGS 9.5", "SGC 10"] as const;
export const DEFAULT_QUICK_GRADE = "PSA 10";
export const OTHER_GRADE = "Other";

/**
 * Companies under Other: GRADE_COMPANIES without its own "Other", which has no
 * comps to match (grades.test.ts keeps the two in step). Listed here so the
 * shared card-options module exports nothing new on other routes.
 */
export const OTHER_COMPANIES: readonly string[] = ["PSA", "BGS", "SGC", "CGC", "TAG"];

export function isPresetGrade(grade: string): boolean {
  return (QUICK_GRADES as readonly string[]).includes(grade);
}

/** The company and number selects for a grade that is not a preset. */
export function otherGradeParts(grade: string): { company: string; number: string } {
  const parsed = parseGrade(grade);
  const company = OTHER_COMPANIES.includes(parsed.company) ? parsed.company : "PSA";
  const numbers = gradeSelectOptions(company, "");
  const number = parsed.number && numbers.includes(parsed.number) ? parsed.number : (numbers[0] ?? "10");
  return { company, number };
}

export function otherGradeNumbers(company: string): string[] {
  return gradeSelectOptions(company, "");
}

export function otherGrade(company: string, number: string): string {
  return formatGrade(company, number);
}

const QUERY_GRADE =
  /(?<![\p{L}\p{N}_#.])(?:(psa|bgs|beckett|sgc|cgc|tag)[\s-]*(\d+(?:\.\d+)?)|(raw|ungraded))(?![\p{L}\p{N}_.])/giu;

/**
 * A grade typed into the search ("psa 9", "bgs9.5", "raw"), and the text
 * without it. The number has to be on that company's scale. When two grades
 * are typed, the last one wins, the way people correct themselves.
 */
export function splitQueryGrade(text: string): { grade: string | null; rest: string } {
  let grade: string | null = null;
  const rest = text.replace(QUERY_GRADE, (phrase, word?: string, number?: string, raw?: string) => {
    if (raw) {
      grade = RAW_GRADE;
      return " ";
    }
    const company = word!.toLowerCase() === "beckett" ? "BGS" : word!.toUpperCase();
    const normal = String(Number(number));
    if (!GRADE_NUMBERS[company]?.includes(normal)) return phrase;
    grade = formatGrade(company, normal);
    return " ";
  });
  return { grade, rest: rest.replace(/\s+/g, " ").trim() };
}

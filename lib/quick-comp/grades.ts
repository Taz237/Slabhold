import { formatGrade, gradeSelectOptions, parseGrade, RAW_GRADE } from "@/lib/card-options";

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

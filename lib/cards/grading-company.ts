import { GRADE_COMPANIES, RAW_GRADE, formatGrade, parseGrade } from "@/lib/card-options";
import type { ConditionType } from "@/lib/types";

/** Shown in the add/edit select. Raw cards store a null grader. */
export const RAW_GRADING_COMPANY = "Raw / Ungraded";

export const GRADING_COMPANIES = [
  RAW_GRADING_COMPANY,
  "PSA",
  "BGS",
  "SGC",
  "CGC",
  "Other",
] as const;

export function isRawGradingCompany(company: string): boolean {
  const text = company.trim();
  if (!text) return false;
  if (text === RAW_GRADING_COMPANY) return true;
  return text.toLowerCase() === RAW_GRADE.toLowerCase();
}

/** Numeric grade, including "10", "HGA 9", and "Gem Mint 10". */
export function gradeNumberFromGrade(grade: string): string {
  const parsed = parseGrade(grade);
  if (parsed.number) return parsed.number;
  if (/raw|ungraded/i.test(grade)) return "";
  const match = grade.match(/(\d+(?:\.\d+)?)/);
  if (!match) return "";
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return match[1];
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
}

/** A single company token, such as HGA. "Gem Mint 10" is not one. */
function singleTokenCompany(grade: string): string {
  const match = grade.trim().match(/^([A-Za-z][A-Za-z0-9]{1,11})\s+\d+(?:\.\d+)?$/);
  return match?.[1] ?? "";
}

function canonicalCompany(company: string): string {
  const text = company.trim();
  const listed = GRADING_COMPANIES.find(
    (item) => item.toLowerCase() === text.toLowerCase(),
  );
  if (listed) return listed;
  const known = GRADE_COMPANIES.find(
    (item) => item.toLowerCase() === text.toLowerCase(),
  );
  return known ?? text;
}

/** Options for the form select, keeping a legacy company such as TAG. */
export function gradingCompanyOptions(current: string): string[] {
  const value = current.trim();
  if (!value || isRawGradingCompany(value)) return [...GRADING_COMPANIES];
  const canonical = canonicalCompany(value);
  if (GRADING_COMPANIES.includes(canonical as (typeof GRADING_COMPANIES)[number])) {
    return [...GRADING_COMPANIES];
  }
  return [canonical, ...GRADING_COMPANIES];
}

export function gradingCompanyFromCard(card: {
  grade?: string | null;
  conditionType?: string | null;
  grader?: string | null;
}): string {
  if (card.conditionType === "raw") return RAW_GRADING_COMPANY;

  const stored = (card.grader ?? "").trim();
  if (stored && !isRawGradingCompany(stored)) return canonicalCompany(stored);

  const parsed = parseGrade(card.grade ?? "");
  if (parsed.company && !isRawGradingCompany(parsed.company)) {
    return canonicalCompany(parsed.company);
  }

  if (card.conditionType === "graded") {
    const embedded = singleTokenCompany(card.grade ?? "");
    if (embedded && !isRawGradingCompany(embedded)) return canonicalCompany(embedded);
    return "";
  }

  return RAW_GRADING_COMPANY;
}

/** Map the select onto the grade string and the cards.grader column. */
export function applyGradingCompany(input: {
  company: string;
  gradeNumber: string;
}): { conditionType: ConditionType; grade: string; grader: string | null } {
  const company = input.company.trim();
  if (!company) {
    const number = input.gradeNumber.trim();
    return { conditionType: "graded", grade: number, grader: null };
  }
  if (isRawGradingCompany(company)) {
    return { conditionType: "raw", grade: "Raw", grader: null };
  }
  const canonical = canonicalCompany(company);
  return {
    conditionType: "graded",
    grade: formatGrade(canonical, input.gradeNumber.trim()),
    grader: canonical,
  };
}

/** Chips on the card detail page: company, then grade and cert when present. */
export function gradeDetailSpecs(card: {
  grade?: string | null;
  conditionType?: string | null;
  grader?: string | null;
  certNumber?: string | null;
}): { label: string; value: string }[] {
  const company = gradingCompanyFromCard(card);
  const specs: { label: string; value: string }[] = [];
  if (company) specs.push({ label: "Grading company", value: company });
  const showNumber = company
    ? !isRawGradingCompany(company)
    : card.conditionType === "graded";
  if (showNumber) {
    const number = gradeNumberFromGrade(card.grade ?? "");
    if (number) specs.push({ label: "Grade", value: number });
  }
  const cert = (card.certNumber ?? "").trim();
  if (cert) specs.push({ label: "Cert", value: cert });
  return specs;
}

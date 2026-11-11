import { serialNoError } from "@/lib/cards/add-flow";
import type { ScanGrade, ScanMatch } from "./match";

/**
 * The "Is this your card?" sheet's logic, pure so the sheet only renders it.
 * A wrong guess is one tap to fix: pick another row or another parallel.
 */

export const CONFIRM_COPY = {
  title: "Is this your card?",
  yes: "Yes, that's it",
  others: "Or one of these",
  parallel: "Parallel",
  pickParallel: "Pick the parallel",
  somethingElse: "Something else",
  serialLabel: "Your number",
  notSure: "Not sure",
  noneOfThese: "None of these",
  retake: "Retake",
  finding: "Finding your card",
  noMatchTitle: "We couldn't find this one yet",
  noMatchBody: "It's not in our catalog yet. We'll keep the photo.",
  offlineBody: "You're offline, so we couldn't check our catalog. We'll keep the photo.",
  stepByStep: "Add it step by step",
  close: "Close",
} as const;

/** The parallel the collector has picked on the sheet. Null leaves it for Add card to ask. */
export type ParallelPick = { name: string; serialRun: number | null } | null;

export function matchLine(match: Pick<ScanMatch, "yearLabel" | "setBrand" | "cardNumber">): string {
  return [match.yearLabel, match.setBrand, match.cardNumber ? `#${match.cardNumber}` : ""]
    .filter(Boolean)
    .join(" ");
}

export function gradeLabel(grade: ScanGrade | null): string | null {
  if (!grade?.company) return null;
  if (grade.authentic && !grade.number) return `${grade.company} Authentic`;
  return [grade.company, grade.number, grade.qualifier].filter(Boolean).join(" ");
}

/** Only the last 4, so the full cert never shows on a screen someone might share. */
export function maskCert(cert: string): string {
  const text = cert.trim();
  if (!text) return "";
  return `••••${text.length > 4 ? text.slice(-4) : ""}`;
}

export function initialChoice(match: ScanMatch): ParallelPick {
  if (!match.parallel) return null;
  const option = match.parallelOptions.find((item) => item.name === match.parallel);
  return { name: match.parallel, serialRun: option?.serialRun ?? match.serialRun };
}

/** The match with the sheet's picks applied, ready for the Add card handoff. */
export function confirmMatch(
  match: ScanMatch,
  pick: ParallelPick,
  serialNo: string,
): { match: ScanMatch } | { error: string } {
  if (!pick) {
    return {
      match: { ...match, parallel: "", sureness: { ...match.sureness, parallel: "unsure" } },
    };
  }
  const run = pick.serialRun;
  const number = run ? serialNo.trim() : "";
  if (run) {
    const error = serialNoError(number, String(run));
    if (error) return { error };
  }
  return {
    match: {
      ...match,
      parallel: pick.name,
      serialRun: run,
      serialNo: number,
      sureness: { ...match.sureness, parallel: "sure" },
    },
  };
}

/** Tapping "Or one of these" makes that row the top match. */
export function promoteMatch(matches: readonly ScanMatch[], index: number): ScanMatch[] {
  if (index <= 0 || index >= matches.length) return [...matches];
  return [matches[index], ...matches.slice(0, index), ...matches.slice(index + 1)];
}

/**
 * The scanner, off unless exactly "1". NEXT_PUBLIC_ so the entry points can
 * read it; Next inlines it at build, so a toggle needs a redeploy.
 */
export function scannerEnabled(
  env: { NEXT_PUBLIC_SCANNER?: string } = { NEXT_PUBLIC_SCANNER: process.env.NEXT_PUBLIC_SCANNER },
): boolean {
  return env.NEXT_PUBLIC_SCANNER === "1";
}

/** The fixture preview of the sheet: preview and local builds, or production with the scanner on. */
export function scanPreviewAllowed(
  env: { NEXT_PUBLIC_VERCEL_ENV?: string; NEXT_PUBLIC_SCANNER?: string } = {
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    NEXT_PUBLIC_SCANNER: process.env.NEXT_PUBLIC_SCANNER,
  },
): boolean {
  return env.NEXT_PUBLIC_VERCEL_ENV !== "production" || scannerEnabled(env);
}

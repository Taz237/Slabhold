import { GRADE_CHIP_COMPANIES } from "@/lib/cards/add-flow";
import { RAW_GRADING_COMPANY } from "@/lib/cards/grading-company";

/**
 * What the last guided Add card saved, so the next one starts on the likely
 * answer: sport, year, set and (only after a graded card) the grader.
 * One entry per signed-in user on this device. Edit card never reads or
 * writes it, and a signed-out add keeps nothing.
 */
export const ADD_LAST_USED_PREFIX = "slabhold:add-last-used:";

export type AddLastUsed = {
  sport: string;
  year: string;
  set: string;
  /** A Condition chip grader (PSA, BGS…), or "" when the last card was raw. */
  grader: string;
};

const MAX = 120;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX) : "";
}

function key(userId: string): string {
  return `${ADD_LAST_USED_PREFIX}${userId}`;
}

export function readAddLastUsed(
  storage: Storage | null | undefined,
  userId: string | null | undefined,
): AddLastUsed | null {
  if (!storage || !userId) return null;
  try {
    const raw = storage.getItem(key(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const item = parsed as Record<string, unknown>;
    return { sport: text(item.sport), year: text(item.year), set: text(item.set), grader: text(item.grader) };
  } catch {
    return null;
  }
}

export function writeAddLastUsed(
  storage: Storage | null | undefined,
  userId: string | null | undefined,
  value: AddLastUsed,
): void {
  if (!storage || !userId) return;
  try {
    storage.setItem(
      key(userId),
      JSON.stringify({
        sport: text(value.sport),
        year: text(value.year),
        set: text(value.set),
        grader: text(value.grader),
      }),
    );
  } catch {
    // Private mode or full storage: the next card just starts on the usual defaults.
  }
}

/** The answers worth remembering from a saved card. */
export function lastUsedFromSave(saved: {
  sport: string;
  yearLabel: string;
  setBrand: string;
  gradeCompany: string;
  conditionType: string;
}): AddLastUsed {
  const chip = GRADE_CHIP_COMPANIES.find(
    (item) => item.value !== RAW_GRADING_COMPANY && item.value === saved.gradeCompany.trim(),
  );
  return {
    sport: saved.sport,
    year: saved.yearLabel,
    set: saved.setBrand,
    grader: saved.conditionType === "graded" && chip ? chip.value : "",
  };
}

/** This device's storage, or null when the browser blocks it. */
export function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

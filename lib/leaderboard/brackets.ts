export const VALUE_BRACKETS = [
  { id: "under-1k", label: "Under $1,000", min: 0, max: 1000 },
  { id: "1k-10k", label: "$1,000–$10,000", min: 1000, max: 10000 },
  { id: "10k-plus", label: "$10,000+", min: 10000, max: Number.POSITIVE_INFINITY },
] as const;

export type ValueBracketId = (typeof VALUE_BRACKETS)[number]["id"];

/**
 * Bracket from the collection value at the start of the week.
 * $1,000 starts the middle bracket. $10,000 starts the top bracket.
 * A missing value has no bracket, so a collector is not moved down.
 */
export function valueBracketId(weekStartValue: number | null): ValueBracketId | null {
  if (weekStartValue == null || !Number.isFinite(weekStartValue) || weekStartValue < 0) {
    return null;
  }
  for (const bracket of VALUE_BRACKETS) {
    if (weekStartValue >= bracket.min && weekStartValue < bracket.max) return bracket.id;
  }
  return null;
}

export function valueBracketLabel(id: string): string {
  return VALUE_BRACKETS.find((bracket) => bracket.id === id)?.label ?? id;
}

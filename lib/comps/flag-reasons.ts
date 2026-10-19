import { isCardOwner } from "./ownership";

export const FLAG_REASONS = [
  ["wrong_set", "Wrong set"],
  ["wrong_parallel", "Wrong parallel"],
  ["wrong_grade", "Wrong grade"],
  ["wrong_card", "Wrong card"],
  ["lot", "Lot or multiple cards"],
] as const;

export type FlagReason = (typeof FLAG_REASONS)[number][0];

const REASON_SET = new Set<string>(FLAG_REASONS.map(([id]) => id));

export function parseFlagReason(value: unknown): FlagReason | null {
  if (typeof value !== "string") return null;
  const reason = value.trim();
  if (!REASON_SET.has(reason)) return null;
  return reason as FlagReason;
}

export function flagReasonLabel(reason: string | null | undefined): string {
  const match = FLAG_REASONS.find(([id]) => id === reason);
  return match ? match[1] : "No reason given";
}

/** 401 signed out, 403 not the card owner, 200 allowed. */
export function compFlagStatus(input: {
  userId: string | null;
  ownerId: string | null;
}): 401 | 403 | 200 {
  if (!input.userId) return 401;
  if (!isCardOwner(input.ownerId, input.userId)) return 403;
  return 200;
}

/** Hidden sales are owner-only and absent when nothing is flagged. */
export function showHiddenSales(canFlag: boolean, count: number): boolean {
  return canFlag && count > 0;
}

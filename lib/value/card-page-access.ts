import { isUuid } from "./card-value-access";

/**
 * Pure gate for /cards/[id]. Does not load comps, cache, value, or Trawl.
 * "notFound" → call Next notFound() before any market work.
 */
export function cardPageAccessDecision(input: {
  cardId: string;
  userId: string | null;
  owned: boolean | "unavailable" | "skip";
}): "allow" | "notFound" | "skip" {
  const id = input.cardId.trim();
  if (!id || !isUuid(id)) return "skip";
  if (!input.userId) return "skip";
  if (input.owned === "skip" || input.owned === "unavailable") return "skip";
  return input.owned ? "allow" : "notFound";
}

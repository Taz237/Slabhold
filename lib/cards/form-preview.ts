import { buildCompsQuery, type MatchCard } from "@/lib/comps/match";

export const EMPTY_CARD_PREVIEW = "Your card";

const PLACEHOLDER_LINES = new Set(["", "base, raw", "base", "raw"]);

/** Preview line for the add/edit form. Empty defaults stay a neutral placeholder. */
export function cardFormPreview(card: MatchCard): { text: string; placeholder: boolean } {
  const line = buildCompsQuery({
    ...card,
    playerName: card.playerName.trim(),
    setBrand: card.setBrand.trim(),
    parallel: card.parallel?.trim() || "Base",
  });
  const key = line.replace(/\s+/g, " ").trim().toLowerCase();
  if (PLACEHOLDER_LINES.has(key)) {
    return { text: EMPTY_CARD_PREVIEW, placeholder: true };
  }
  return { text: line, placeholder: false };
}

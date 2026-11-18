import { loadChecklistsFor } from "@/lib/cards/checklist-load";
import { playersAt } from "@/lib/cards/checklists";
import { indexedCardOf, type ClosestCard } from "./closest";
import { loadPlayerCards } from "./closest-load";
import { nameKey } from "./player-lookup";

/**
 * A confirmed card as our checklists spell it: their player, sport, year, set and card #, never
 * the collector's spelling. "T.o.p.p.s" and "Topps" are one card, so they add to one vote count.
 * Null when the checklists don't have that card for that player.
 */
export async function checklistCardFor(card: ClosestCard): Promise<ClosestCard | null> {
  const known = indexedCardOf(card, await loadPlayerCards(card.sport));
  if (!known) return null;
  return { ...known, playerName: (await checklistPlayerName(known)) ?? known.playerName };
}

/** The player's name as the checklist file prints it at that card #. Null when the file doesn't load. */
async function checklistPlayerName(card: ClosestCard): Promise<string | null> {
  const products = await loadChecklistsFor({ years: [card.yearLabel], setBrand: card.setBrand, sport: card.sport }).catch(() => []);
  const key = nameKey(card.playerName);
  const hit = playersAt(products, card).find((item) => item.yearLabel === card.yearLabel && nameKey(item.player) === key);
  return hit ? hit.player.replace(/\s+/g, " ").trim() : null;
}

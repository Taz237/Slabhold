import type { CatalogCard } from "@/lib/card-catalog";
import { SETS } from "@/lib/card-options";
import { parallelChoice } from "@/lib/cards/parallels";
import type { CatalogPickSnapshot } from "@/lib/catalog/catalog-queue";
import { rookieAfterCatalogPick, sportAfterCatalogPick } from "@/lib/catalog/catalog-sport";

/** The same field patch Add Card applies when a catalog row is picked. */
export function catalogPickFields(card: CatalogCard, currentSport: string) {
  const chosen = parallelChoice(card.setBrand, card.parallel || "Base");
  const sport = sportAfterCatalogPick(currentSport, card.sport);
  const snapshot: CatalogPickSnapshot = {
    playerName: card.playerName,
    yearLabel: card.yearLabel,
    setBrand: card.setBrand,
    cardNumber: card.cardNumber,
    parallel: chosen.parallel,
  };
  return {
    snapshot,
    form: {
      playerName: card.playerName,
      yearLabel: card.yearLabel,
      setBrand: card.setBrand,
      cardNumber: card.cardNumber,
      sport: sport.sport,
      parallel: chosen.parallel,
    },
    sportOffer: sport.offer,
    isRookie: rookieAfterCatalogPick(false, card),
    setIsCustom: !SETS.some((name) => name === card.setBrand),
    parallelIsCustom: chosen.parallelIsCustom,
  };
}

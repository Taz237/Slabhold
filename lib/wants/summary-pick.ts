import type { CardValueResult } from "@/lib/value/types";

export type WantSummaryInput = {
  id: string;
  label: string;
  targetPrice: number | null;
  cardKey: string;
  sourceCardId: string | null;
};

/** A card the server may consider. Private cards of other users must not win. */
export type WantCardRef = {
  id: string;
  userId: string;
  isPublic: boolean;
  cardKey: string;
};

export type WantSummaryView = {
  id: string;
  label: string;
  targetPrice: number | null;
  value: CardValueResult | null;
  deal: boolean;
};

function isVisible(card: WantCardRef, viewerId: string): boolean {
  return card.isPublic || card.userId === viewerId;
}

/**
 * Card whose cached value and latest sale may be shown.
 * The source counts only when it is public or owned by the viewer.
 * Otherwise the first visible card with the same card_key is used.
 */
export function visibleCardIdForWant(
  want: Pick<WantSummaryInput, "sourceCardId" | "cardKey">,
  viewerId: string,
  cards: WantCardRef[],
): string | null {
  if (want.sourceCardId) {
    const source = cards.find((card) => card.id === want.sourceCardId);
    if (source && isVisible(source, viewerId)) return source.id;
  }
  const matches = cards.filter(
    (card) => card.cardKey === want.cardKey && isVisible(card, viewerId),
  );
  const match = matches.find((card) => card.isPublic) ?? matches[0];
  return match?.id ?? null;
}

export function summarizeWants(
  viewerId: string,
  wants: WantSummaryInput[],
  cards: WantCardRef[],
  values: Map<string, CardValueResult>,
  latestPriceByCardId: Map<string, number | null>,
): WantSummaryView[] {
  return wants.map((want) => {
    const target =
      want.targetPrice != null && Number.isFinite(want.targetPrice)
        ? want.targetPrice
        : null;
    const cardId = visibleCardIdForWant(want, viewerId, cards);
    if (!cardId) {
      return {
        id: want.id,
        label: want.label,
        targetPrice: target,
        value: null,
        deal: false,
      };
    }
    const latest = latestPriceByCardId.get(cardId) ?? null;
    return {
      id: want.id,
      label: want.label,
      targetPrice: target,
      value: values.get(cardId) ?? null,
      deal: target != null && latest != null && latest <= target,
    };
  });
}

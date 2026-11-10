import { BADGE_THRESHOLDS, CATEGORY_COPY } from "@/lib/badges/config";
import { collectorCount, progressLine, tierForValue, type BadgeCard } from "@/lib/badges/progress";

/** Collector Bronze: 10 cards added with a real photo. */
export const COLLECTOR_BRONZE = BADGE_THRESHOLDS.collector[0];

type CollectionCard = {
  id: string;
  playerName: string;
  year: number;
  setBrand: string;
  parallel: string;
  photoDataUrl: string | null;
  createdAt: string;
  isPublic?: boolean;
  conditionType?: string;
};

function badgeCard(card: CollectionCard, userId: string): BadgeCard {
  return {
    id: card.id,
    userId,
    isPublic: Boolean(card.isPublic),
    player: card.playerName,
    year: card.year,
    setName: card.setBrand,
    parallel: card.parallel,
    imageUrl: card.photoDataUrl,
    createdAt: card.createdAt,
    hidden: false,
    deleted: false,
    graded: card.conditionType === "graded",
  };
}

export type CollectorReveal = {
  /** Collector count with the new card. Same rules as the badge: real photo, one per card, daily cap. */
  count: number;
  /** The new card moved the count. */
  counted: boolean;
  /** The new card has a photo at all. */
  hasPhoto: boolean;
};

/** Collector progress from the cards already in memory. No fetch. */
export function collectorReveal(
  cards: readonly CollectionCard[],
  cardId: string,
  userId: string,
  now: Date = new Date(),
): CollectorReveal {
  const all = cards.map((card) => badgeCard(card, userId));
  const count = collectorCount(all, userId, now);
  const before = collectorCount(
    all.filter((card) => card.id !== cardId),
    userId,
    now,
  );
  const card = cards.find((item) => item.id === cardId);
  return { count, counted: count > before, hasPhoto: Boolean(card?.photoDataUrl?.trim()) };
}

export type CollectorRevealCopy = {
  kind: "earned" | "progress" | "needs_photo";
  text: string;
};

/**
 * The reveal's Collector line. Bronze is 10 cards with a real photo. A card
 * with no photo does not count, and the line says so instead of pretending.
 */
export function collectorRevealCopy(input: CollectorReveal): CollectorRevealCopy {
  const unit = CATEGORY_COPY.collector;
  if (input.counted && input.count === COLLECTOR_BRONZE) {
    return { kind: "earned", text: `You earned Bronze Collector: ${COLLECTOR_BRONZE} ${unit.unit} with a photo.` };
  }
  const line =
    input.count < COLLECTOR_BRONZE
      ? `Collector: ${input.count} of ${COLLECTOR_BRONZE} photo cards to Bronze.`
      : `Collector: ${progressLine("collector", input.count, tierForValue("collector", input.count))}.`;
  if (!input.hasPhoto) {
    return { kind: "needs_photo", text: `${line} This one needs a photo to count.` };
  }
  return { kind: "progress", text: line };
}

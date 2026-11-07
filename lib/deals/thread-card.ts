import { isSold } from "@/lib/format";
import { messageLinks } from "@/lib/social/dm-inbox";
import type { DirectMessage, Post } from "@/lib/social/types";
import type { SportsCard } from "@/lib/types";

/**
 * The card the deal sheet starts on: from the newest message in the thread
 * that links a post whose card you still hold. Null when there's none.
 */
export function dealCardFromThread(
  thread: readonly DirectMessage[],
  findPost: (id: string) => Post | undefined,
  cards: readonly (Pick<SportsCard, "id" | "sellPrice" | "sellDate"> & { soldAt?: string | null })[],
): string | null {
  const held = new Set(cards.filter((card) => !isSold(card)).map((card) => card.id));
  if (held.size === 0) return null;
  const newest = [...thread].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const message of newest) {
    for (const link of messageLinks(message.content)) {
      if (link.kind !== "post") continue;
      const cardId = findPost(link.id)?.card?.id;
      if (cardId && held.has(cardId)) return cardId;
    }
  }
  return null;
}

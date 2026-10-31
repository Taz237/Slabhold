"use client";

import { useSocial } from "@/components/social-provider";
import { attachmentValueLabel } from "@/lib/social/post-card-value";
import type { PublicCard } from "@/lib/social/types";
import { usePublicCards } from "@/lib/social/use-public-cards";
import { ebaySoldSearchUrlForCard } from "@/lib/value/ebay-sold";
import { feedChipPrice, resolvePriceRead, type PriceRead } from "@/lib/value/price-fallback";
import { cardValueHasAmount } from "@/lib/value/format";
import type { CardValueResult } from "@/lib/value/types";

/**
 * A just-added card with no value yet reads "Value updating", which needs the
 * card's created_at. Post snapshots don't carry it, so read that one public
 * card, and only when the value has no amount to show.
 */
function useCardAge(card: PublicCard | null | undefined, value: CardValueResult | null, known: boolean) {
  const wantsAge = Boolean(card && known && !card.createdAt && !cardValueHasAmount(value));
  usePublicCards(wantsAge && card ? { ids: [card.id] } : null);
}

export function useAttachmentLabel(
  card: PublicCard | null | undefined,
  extra?: {
    values?: Map<string, CardValueResult>;
    loading?: boolean;
  },
): string | null {
  const { postCardValues, postCardValuesLoading, publicCards } = useSocial();
  const value = card ? (extra?.values?.get(card.id) ?? postCardValues.get(card.id) ?? null) : null;
  const known = Boolean(card && (extra?.values?.has(card.id) || postCardValues.has(card.id)));
  useCardAge(card, value, known);
  if (!card) return null;

  const loading = !known && Boolean(extra?.loading || postCardValuesLoading);
  if (loading) return "…";

  const createdAt = card.createdAt ?? publicCards.find((item) => item.id === card.id)?.createdAt;
  return attachmentValueLabel(value, { createdAt });
}

/** Estimate or a labeled fallback for a feed card chip. Loading is "…". */
export function useAttachedChip(
  card: PublicCard | null | undefined,
  extra?: {
    values?: Map<string, CardValueResult>;
    loading?: boolean;
  },
): { text: string | null; soldHref: string | null } {
  const { postCardValues, postCardValuesLoading, publicCards } = useSocial();
  const value = card ? (extra?.values?.get(card.id) ?? postCardValues.get(card.id) ?? null) : null;
  const known = Boolean(card && (extra?.values?.has(card.id) || postCardValues.has(card.id)));
  useCardAge(card, value, known);
  if (!card) return { text: null, soldHref: null };

  const loading = !known && Boolean(extra?.loading || postCardValuesLoading);
  if (loading) return { text: "…", soldHref: null };

  const createdAt = card.createdAt ?? publicCards.find((item) => item.id === card.id)?.createdAt;
  const ebayHref = ebaySoldSearchUrlForCard(card);
  const read: PriceRead = resolvePriceRead({
    value,
    createdAt,
    similar: value?.similar,
    ebayHref,
    card,
  });
  const chip = feedChipPrice(read);
  return {
    text: chip.text,
    soldHref: chip.showEbaySold ? ebayHref : null,
  };
}

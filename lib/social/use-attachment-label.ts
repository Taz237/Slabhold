"use client";

import { useSocial } from "@/components/social-provider";
import { attachmentValueLabel } from "@/lib/social/post-card-value";
import type { PublicCard } from "@/lib/social/types";
import { ebaySoldSearchUrlForCard } from "@/lib/value/ebay-sold";
import { feedChipPrice, resolvePriceRead, type PriceRead } from "@/lib/value/price-fallback";
import type { CardValueResult } from "@/lib/value/types";

export function useAttachmentLabel(
  card: PublicCard | null | undefined,
  extra?: {
    values?: Map<string, CardValueResult>;
    loading?: boolean;
  },
): string | null {
  const { postCardValues, postCardValuesLoading, publicCards } = useSocial();
  if (!card) return null;

  const value = extra?.values?.get(card.id) ?? postCardValues.get(card.id) ?? null;
  const known = Boolean(
    extra?.values?.has(card.id) || postCardValues.has(card.id),
  );
  const loading = !known && Boolean(extra?.loading || postCardValuesLoading);
  if (loading) return "…";

  const createdAt = publicCards.find((item) => item.id === card.id)?.createdAt;
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
  if (!card) return { text: null, soldHref: null };

  const value = extra?.values?.get(card.id) ?? postCardValues.get(card.id) ?? null;
  const known = Boolean(extra?.values?.has(card.id) || postCardValues.has(card.id));
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

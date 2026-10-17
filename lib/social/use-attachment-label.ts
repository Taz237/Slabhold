"use client";

import { useSocial } from "@/components/social-provider";
import { attachmentValueLabel } from "@/lib/social/post-card-value";
import type { PublicCard } from "@/lib/social/types";
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

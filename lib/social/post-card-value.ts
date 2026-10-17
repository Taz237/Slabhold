import {
  formatCardValueLabel,
  type FormatCardValueLabelOptions,
} from "@/lib/value/format";
import type { CardValueResult } from "@/lib/value/types";

/** Card ids attached to posts, deduped. One batch key for getCardValues. */
export function collectAttachedCardIds(
  posts: Iterable<{ card?: { id?: string | null } | null }>,
): string[] {
  const ids = new Set<string>();
  for (const post of posts) {
    const id = post.card?.id;
    if (id) ids.add(id);
  }
  return [...ids];
}

/**
 * Label for a post card attachment.
 * Uses formatCardValueLabel only — never estimatedSellPrice / est_sell.
 */
export function attachmentValueLabel(
  value: CardValueResult | null | undefined,
  options?: FormatCardValueLabelOptions,
): string {
  return formatCardValueLabel(value, options);
}

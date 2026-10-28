import { BADGE_CATEGORIES, badgeName, isProgressCategory, tierRank } from "./config";
import { categoryStatus, displayValue, type BadgeCounts, type EarnedBadge } from "./progress";

export type UnseenBadge = EarnedBadge & { id: string };

export type BadgeReveal = {
  headline: UnseenBadge;
  title: string;
  /** Next goal in the headline's category, or null at Legendary. */
  next: string | null;
  /** The other unseen badges, highest first. */
  others: UnseenBadge[];
  /** Every unseen id, to mark seen once shown. */
  ids: string[];
};

export function revealFor(unseen: readonly UnseenBadge[], counts: BadgeCounts | null): BadgeReveal | null {
  if (unseen.length === 0) return null;
  const ordered = [...unseen].sort(
    (a, b) =>
      tierRank(b.tier) - tierRank(a.tier) ||
      BADGE_CATEGORIES.indexOf(a.category) - BADGE_CATEGORIES.indexOf(b.category),
  );
  const headline = ordered[0];
  let next: string | null = null;
  if (counts && isProgressCategory(headline.category)) {
    const status = categoryStatus(headline.category, displayValue(headline.category, counts), [headline]);
    next = status.next ? status.line : null;
  }
  return {
    headline,
    title: `${badgeName(headline.category, headline.tier)} unlocked`,
    next,
    others: ordered.slice(1),
    ids: unseen.map((badge) => badge.id),
  };
}

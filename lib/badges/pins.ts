import {
  BADGE_CATEGORIES,
  MAX_PINNED_BADGES,
  isBadgeCategory,
  isBadgeTier,
  tierRank,
} from "./config";
import type { EarnedBadge } from "./progress";

/** "collector:gold". */
export function formatPin(badge: EarnedBadge): string {
  return `${badge.category}:${badge.tier}`;
}

export function parsePin(value: string): EarnedBadge | null {
  const [category, tier, extra] = value.split(":");
  if (extra !== undefined || !isBadgeCategory(category) || !isBadgeTier(tier)) return null;
  return { category, tier };
}

/** The best tier in each category, highest first, then category order. Top 3. */
export function autoPins(earned: readonly EarnedBadge[]): EarnedBadge[] {
  return [...bestTiers(earned).values()]
    .sort(
      (a, b) =>
        tierRank(b.tier) - tierRank(a.tier) ||
        BADGE_CATEGORIES.indexOf(a.category) - BADGE_CATEGORIES.indexOf(b.category),
    )
    .slice(0, MAX_PINNED_BADGES);
}

/** The highest earned tier in each category. */
function bestTiers(earned: readonly EarnedBadge[]): Map<string, EarnedBadge> {
  const best = new Map<string, EarnedBadge>();
  for (const badge of earned) {
    const held = best.get(badge.category);
    if (!held || tierRank(badge.tier) > tierRank(held.tier)) best.set(badge.category, badge);
  }
  return best;
}

/**
 * Saved pins with each one moved up to the highest tier earned in its
 * category. Drops pins that are not earned and repeats, keeps order.
 * "collector:bronze" becomes "collector:gold" once Gold is earned.
 */
export function upgradePins(pinned: readonly string[], earned: readonly EarnedBadge[]): string[] {
  const have = new Set(earned.map(formatPin));
  const best = bestTiers(earned);
  const out: string[] = [];
  for (const value of pinned) {
    const badge = parsePin(value);
    if (!badge || !have.has(formatPin(badge))) continue;
    const top = best.get(badge.category) ?? badge;
    const key = formatPin(tierRank(top.tier) > tierRank(badge.tier) ? top : badge);
    if (!out.includes(key)) out.push(key);
  }
  return out;
}

/** Saved pins, upgraded, at most 3. Auto-pins when none are left. */
export function profilePins(pinned: readonly string[], earned: readonly EarnedBadge[]): EarnedBadge[] {
  const shown = upgradePins(pinned, earned)
    .slice(0, MAX_PINNED_BADGES)
    .flatMap((value) => parsePin(value) ?? []);
  return shown.length > 0 ? shown : autoPins(earned);
}

export function togglePin(
  pinned: readonly string[],
  badge: EarnedBadge,
): { pins: string[]; full: boolean } {
  const key = formatPin(badge);
  if (pinned.includes(key)) return { pins: pinned.filter((pin) => pin !== key), full: false };
  if (pinned.length >= MAX_PINNED_BADGES) return { pins: [...pinned], full: true };
  return { pins: [...pinned, key], full: false };
}

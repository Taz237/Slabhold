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
  const best = new Map<string, EarnedBadge>();
  for (const badge of earned) {
    const held = best.get(badge.category);
    if (!held || tierRank(badge.tier) > tierRank(held.tier)) best.set(badge.category, badge);
  }
  return [...best.values()]
    .sort(
      (a, b) =>
        tierRank(b.tier) - tierRank(a.tier) ||
        BADGE_CATEGORIES.indexOf(a.category) - BADGE_CATEGORIES.indexOf(b.category),
    )
    .slice(0, MAX_PINNED_BADGES);
}

/** Saved pins that are earned, in order, at most 3. Auto-pins when none are left. */
export function profilePins(pinned: readonly string[], earned: readonly EarnedBadge[]): EarnedBadge[] {
  const have = new Set(earned.map(formatPin));
  const shown: EarnedBadge[] = [];
  const seen = new Set<string>();
  for (const value of pinned) {
    const badge = parsePin(value);
    if (!badge) continue;
    const key = formatPin(badge);
    if (!have.has(key) || seen.has(key)) continue;
    seen.add(key);
    shown.push(badge);
    if (shown.length === MAX_PINNED_BADGES) break;
  }
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

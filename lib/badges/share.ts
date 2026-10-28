import { CATEGORY_COPY, TIER_LABELS, badgeName, isBadgeCategory, isBadgeTier, type BadgeCategory, type BadgeTier } from "./config";

export type BadgeShareProfile = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  showBadges: boolean;
};

export type BadgeShareView = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  category: BadgeCategory;
  tier: BadgeTier;
  /** "Gold Collector". */
  name: string;
  /** "GOLD · COLLECTOR", for the mono line. */
  tierLabel: string;
  earnedAt: string;
};

/**
 * The public badge page. Null (404) for an unknown user, category, or tier,
 * a badge they haven't earned, or a profile with badges turned off.
 */
export function badgeShareView(input: {
  profile: BadgeShareProfile | null;
  earned: readonly { category: string; tier: string; earnedAt: string }[];
  category: string;
  tier: string;
}): BadgeShareView | null {
  const { profile, category, tier } = input;
  if (!profile || !profile.showBadges || !profile.username) return null;
  if (!isBadgeCategory(category) || !isBadgeTier(tier)) return null;
  const badge = input.earned.find((row) => row.category === category && row.tier === tier);
  if (!badge) return null;
  return {
    username: profile.username,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    category,
    tier,
    name: badgeName(category, tier),
    tierLabel: `${TIER_LABELS[tier]} · ${CATEGORY_COPY[category].label}`.toUpperCase(),
    earnedAt: badge.earnedAt,
  };
}

export function earnedOnLabel(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  const label = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(time));
  return `Earned ${label}`;
}

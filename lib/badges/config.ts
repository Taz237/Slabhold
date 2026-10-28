/**
 * Badge tiers, categories, and thresholds. Tune the numbers here only.
 * Art lives in public/badges. Build notes are in docs/badges/notes.md.
 */

export const BADGE_TIERS = ["bronze", "silver", "gold", "platinum", "diamond", "legendary"] as const;

export type BadgeTier = (typeof BADGE_TIERS)[number];

export const TIER_LABELS: Record<BadgeTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
  diamond: "Diamond",
  legendary: "Legendary",
};

/** Categories with progress. Limited is separate: it has events, not thresholds. */
export const PROGRESS_CATEGORIES = [
  "collector",
  "streak",
  "rainbow-chaser",
  "slab-king",
  "voice-of-the-hobby",
  "following",
  "leaderboard",
] as const;

export type ProgressCategory = (typeof PROGRESS_CATEGORIES)[number];

export type BadgeCategory = ProgressCategory | "limited";

export const BADGE_CATEGORIES: readonly BadgeCategory[] = [...PROGRESS_CATEGORIES, "limited"];

/** Bronze, Silver, Gold, Platinum, Diamond, Legendary. */
export const BADGE_THRESHOLDS: Record<ProgressCategory, readonly [number, number, number, number, number, number]> = {
  collector: [10, 25, 50, 100, 250, 500],
  streak: [2, 4, 8, 12, 26, 52],
  "rainbow-chaser": [3, 5, 8, 12, 20, 30],
  "slab-king": [5, 15, 30, 60, 120, 250],
  "voice-of-the-hobby": [5, 15, 40, 100, 250, 500],
  following: [10, 25, 50, 100, 250, 1000],
  leaderboard: [1, 2, 4, 8, 15, 25],
};

export type CategoryCopy = {
  label: string;
  /** What counts, in one plain line. */
  rule: string;
  /** Unit after the count: "12 / 25 cards to Silver". */
  unit: string;
  unitOne: string;
};

export const CATEGORY_COPY: Record<BadgeCategory, CategoryCopy> = {
  collector: {
    label: "Collector",
    rule: "Cards added with a real photo",
    unit: "cards",
    unitOne: "card",
  },
  streak: {
    label: "Streak",
    rule: "Weeks in a row with a card add or a post (Mon–Sun ET)",
    unit: "weeks",
    unitOne: "week",
  },
  "rainbow-chaser": {
    label: "Rainbow chaser",
    rule: "Different parallels of one player",
    unit: "parallels",
    unitOne: "parallel",
  },
  "slab-king": {
    label: "Slab king",
    rule: "Graded cards with a real photo",
    unit: "slabs",
    unitOne: "slab",
  },
  "voice-of-the-hobby": {
    label: "Voice of the hobby",
    rule: "Posts that got a reply from another collector",
    unit: "posts",
    unitOne: "post",
  },
  following: {
    label: "Following",
    rule: "Followers who are real collectors",
    unit: "followers",
    unitOne: "follower",
  },
  leaderboard: {
    label: "Leaderboard",
    rule: "Weeks finished top 3 on any weekly board",
    unit: "weeks",
    unitOne: "week",
  },
  limited: {
    label: "Limited",
    rule: "Seasonal events",
    unit: "events",
    unitOne: "event",
  },
};

export type LimitedEvent = {
  id: string;
  title: string;
  tier: BadgeTier;
  startsAt: string;
  endsAt: string;
};

/** Seasonal events. None yet, so Limited shows as "Coming soon". */
export const LIMITED_EVENTS: readonly LimitedEvent[] = [];

/** Earnable badges today: every progress tier plus each Limited event. */
export const TOTAL_BADGES = PROGRESS_CATEGORIES.length * BADGE_TIERS.length + LIMITED_EVENTS.length;

/** Pinned on a profile at most. */
export const MAX_PINNED_BADGES = 3;

export function tierRank(tier: BadgeTier): number {
  return BADGE_TIERS.indexOf(tier);
}

export function isBadgeTier(value: unknown): value is BadgeTier {
  return typeof value === "string" && (BADGE_TIERS as readonly string[]).includes(value);
}

export function isBadgeCategory(value: unknown): value is BadgeCategory {
  return typeof value === "string" && (BADGE_CATEGORIES as readonly string[]).includes(value);
}

export function isProgressCategory(value: unknown): value is ProgressCategory {
  return typeof value === "string" && (PROGRESS_CATEGORIES as readonly string[]).includes(value);
}

/** "Gold Collector". */
export function badgeName(category: BadgeCategory, tier: BadgeTier): string {
  return `${TIER_LABELS[tier]} ${CATEGORY_COPY[category].label}`;
}

export function badgeFrameSrc(tier: BadgeTier, locked = false): string {
  return locked ? `/badges/locked/frame-locked-${tier}.svg` : `/badges/frames/frame-${tier}.svg`;
}

export function badgeIconSrc(category: BadgeCategory): string {
  return `/badges/icons/icon-${category}.svg`;
}

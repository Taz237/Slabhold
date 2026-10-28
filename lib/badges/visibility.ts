import { BADGE_THRESHOLDS, CATEGORY_COPY } from "./config";
import { profilePins } from "./pins";
import type { EarnedBadge } from "./progress";

export type ProfileBadgeView =
  | { kind: "hidden" }
  | { kind: "strip"; pins: EarnedBadge[]; more: number }
  | { kind: "first"; line: string; progress: number };

/** What the profile shows under the stats. Never an empty box. */
export function profileBadgeView(input: {
  ownerId: string;
  viewerId: string | null;
  showBadges: boolean;
  earned: readonly EarnedBadge[];
  pinned: readonly string[];
  /** Collector progress toward Bronze, for the owner's first-badge line. */
  firstGoal: { value: number } | null;
}): ProfileBadgeView {
  if (!input.showBadges) return { kind: "hidden" };
  const own = Boolean(input.viewerId) && input.viewerId === input.ownerId;
  if (input.earned.length === 0) {
    if (!own || !input.firstGoal) return { kind: "hidden" };
    const target = BADGE_THRESHOLDS.collector[0];
    return {
      kind: "first",
      line: `Earn your first badge: add ${target} ${CATEGORY_COPY.collector.unit}`,
      progress: Math.max(0, Math.min(1, input.firstGoal.value / target)),
    };
  }
  const pins = profilePins(input.pinned, input.earned);
  return { kind: "strip", pins, more: Math.max(0, input.earned.length - pins.length) };
}

export type ProfileBadges = {
  username: string;
  view: ProfileBadgeView;
  earned: EarnedBadge[];
};

/**
 * What a profile page receives about badges. When show_badges is off, other
 * viewers get no pins and no badges, even if a read returned some.
 */
export function profileBadges(input: {
  username: string;
  ownerId: string;
  viewerId: string | null;
  showBadges: boolean;
  earned: readonly EarnedBadge[];
  pinned: readonly string[];
  firstGoal: { value: number } | null;
}): ProfileBadges {
  const own = Boolean(input.viewerId) && input.viewerId === input.ownerId;
  if (!input.showBadges && !own) return { username: input.username, view: { kind: "hidden" }, earned: [] };
  return {
    username: input.username,
    view: profileBadgeView(input),
    earned: [...input.earned],
  };
}

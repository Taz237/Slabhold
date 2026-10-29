import { isRawGradingCompany } from "@/lib/cards/grading-company";
import type { Post } from "@/lib/social/types";

/** Feed text collapses past this many lines behind "Show more". */
export const BODY_COLLAPSE_LINES = 6;

/** About how many characters fit on one 15px line in a 390px-wide post. */
const CHARS_PER_LINE = 38;

/** Only the first few new posts fade in, so a long page never waits. */
export const ENTRANCE_CAP = 6;
const ENTRANCE_STEP_MS = 45;

/** Wrapped lines at phone width. Used before the browser can measure. */
export function estimateBodyLines(text: string, charsPerLine = CHARS_PER_LINE): number {
  return text
    .split("\n")
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
}

export function shouldCollapseBody(text: string): boolean {
  if (!text.trim()) return false;
  return estimateBodyLines(text) > BODY_COLLAPSE_LINES;
}

/** "PSA 10" for a graded card, null for raw or ungraded. */
export function gradedLabel(
  card: Pick<NonNullable<Post["card"]>, "grade" | "grader" | "conditionType">,
): string | null {
  const grader = (card.grader ?? "").trim();
  const grade = (card.grade ?? "").trim();
  const rawGrader = grader !== "" && isRawGradingCompany(grader);
  if (card.conditionType === "raw" || rawGrader) return null;
  if (!/\d/.test(grade)) return null;
  if (!grader || grade.toLowerCase().startsWith(grader.toLowerCase())) return grade;
  return `${grader} ${grade}`;
}

/**
 * The small label above a card on a post, from fields the post already has:
 * Pickup, the grade (PSA 10), Raw, Rookie, or Card. Null without a card.
 */
export function postPill(post: Pick<Post, "card" | "postType">): string | null {
  const card = post.card;
  if (!card) return null;
  if (post.postType === "mail_day") return "Pickup";
  const graded = gradedLabel(card);
  if (graded) return graded;
  if (card.isRookie) return "Rookie";
  if (card.conditionType === "raw") return "Raw";
  return "Card";
}

/**
 * New feed items that sit above the reader's spot after a refresh.
 * `anchorKey` is the item at the top of the screen, or null at the top of the feed.
 */
export function newItemsAbove(
  before: readonly string[],
  after: readonly string[],
  anchorKey: string | null,
): number {
  if (!anchorKey || before.length === 0) return 0;
  const anchorAt = after.indexOf(anchorKey);
  if (anchorAt <= 0) return 0;
  const seen = new Set(before);
  return after.slice(0, anchorAt).filter((key) => !seen.has(key)).length;
}

/** Fade-in delay for the nth new item in a batch, or null when it skips the fade. */
export function entranceDelayMs(order: number): number | null {
  if (order < 0 || order >= ENTRANCE_CAP) return null;
  return order * ENTRANCE_STEP_MS;
}

/** Each Home tab keeps its own scroll spot. */
export function createLaneScrollMemory() {
  const spots = new Map<string, number>();
  return {
    save(lane: string, top: number) {
      spots.set(lane, top);
    },
    /**
     * Where to scroll when `lane` opens. Above the tabs the page stays put;
     * a lane not seen yet starts at its top, just under the tabs.
     */
    target(lane: string, { current, laneTop }: { current: number; laneTop: number }): number {
      if (current <= laneTop) return current;
      return spots.get(lane) ?? laneTop;
    },
  };
}

/** An inline "Who to follow" card goes after every this many feed items. */
export const WHO_TO_FOLLOW_EVERY = 15;

/** People on each inline card. */
export const WHO_TO_FOLLOW_SIZE = 3;

/** The "Collectors to follow" rail at the top of Home shows this many. */
export const SUGGESTION_RAIL_SIZE = 8;

/**
 * Who the inline cards can still suggest: the ranked list after the rail's
 * people, minus the viewer, the updates account, and anyone followed (even
 * since the rail rendered), blocked or muted. Nobody on the rail comes back.
 */
export function inlineSuggestionPool<T extends { id: string }>(input: {
  ranked: readonly T[];
  railIds: readonly string[];
  viewerId: string | null;
  officialId?: string | null;
  followingIds: Iterable<string>;
  blockedIds: Iterable<string>;
  mutedIds: Iterable<string>;
}): T[] {
  const skip = new Set<string>([
    ...input.railIds,
    ...input.followingIds,
    ...input.blockedIds,
    ...input.mutedIds,
  ]);
  if (input.viewerId) skip.add(input.viewerId);
  const official = input.officialId?.toLowerCase() ?? null;
  const seen = new Set<string>();
  return input.ranked.filter((person) => {
    if (skip.has(person.id) || seen.has(person.id)) return false;
    if (official && person.id.toLowerCase() === official) return false;
    seen.add(person.id);
    return true;
  });
}

/**
 * The people for the inline card after feed item `index`, or [] when no card
 * goes there. Each card takes the next few suggestions, so nobody repeats,
 * and once the pool runs out there are no more cards (nobody is recycled).
 */
export function whoToFollowAfter<T>(index: number, people: readonly T[]): T[] {
  if ((index + 1) % WHO_TO_FOLLOW_EVERY !== 0) return [];
  const slot = (index + 1) / WHO_TO_FOLLOW_EVERY - 1;
  return people.slice(slot * WHO_TO_FOLLOW_SIZE, (slot + 1) * WHO_TO_FOLLOW_SIZE);
}

/** A feed row's height before it has ever been drawn: about a median post. */
export const FEED_ROW_ESTIMATE_PX = 440;

/**
 * Heights of feed rows already drawn, by feed key. Offscreen rows skip their
 * layout and paint (`content-visibility: auto`); a row drawn again after Back
 * starts at its real height, so the restored scroll lands on the same post.
 */
export function createRowHeights(limit = 1000) {
  const heights = new Map<string, number>();
  return {
    get(key: string): number {
      return heights.get(key) ?? FEED_ROW_ESTIMATE_PX;
    },
    set(key: string, height: number) {
      if (!(height > 0)) return;
      heights.delete(key);
      heights.set(key, Math.round(height));
      if (heights.size > limit) {
        const oldest = heights.keys().next().value;
        if (oldest !== undefined) heights.delete(oldest);
      }
    },
  };
}

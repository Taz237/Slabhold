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

function gradedLabel(card: NonNullable<Post["card"]>): string | null {
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

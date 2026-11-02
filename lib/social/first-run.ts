import { isBrandAccount } from "@/lib/leaderboard/brand-accounts";
import { isTestAccount, normalizeAccountHandle, NOT_SUGGESTED_HANDLES } from "@/lib/test-accounts";
import type { ChecklistState } from "./get-started";
import { isOfficialUpdatesAccount } from "./official-updates";

/**
 * First run on Home: the Get started card for a brand-new collector, and for
 * anyone signed in with no cards and no follows. Pure, no React.
 */

/** Follows that count toward "Follow 3 collectors". */
const FOLLOW_GOAL = 3;

/**
 * Follows a collector chose. Every new profile auto-follows the updates
 * account, and @slabhold is ours too, so neither counts. Duplicates count once.
 */
export function effectiveFollowCount(followingIds: Iterable<string>): number {
  const counted = new Set<string>();
  for (const raw of followingIds) {
    const id = raw?.trim().toLowerCase();
    if (!id || isOfficialUpdatesAccount(id) || isBrandAccount(id)) continue;
    counted.add(id);
  }
  return counted.size;
}

/** Step state from counts: a card, 3 chosen follows, a photo or bio. Same order as checklistState. */
export function firstRunSteps(input: {
  cardCount: number;
  effectiveFollows: number;
  profileDone: boolean;
}): ChecklistState["steps"] {
  return [
    { id: "follow", done: input.effectiveFollows >= FOLLOW_GOAL },
    { id: "card", done: input.cardCount > 0 },
    { id: "profile", done: input.profileDone },
  ];
}

/**
 * Get started shows when the existing checklist would (recent and new on the
 * first load), or for anyone signed in with no cards and no chosen follows
 * right now, however old the account. Never after dismiss or with every step done.
 */
export function firstRunEligible(input: {
  ready: boolean;
  dismissed: boolean;
  cardCount: number;
  effectiveFollows: number;
  profileDone: boolean;
  /** What checklistState decided on its own. */
  checklistVisible?: boolean;
}): boolean {
  if (!input.ready || input.dismissed) return false;
  if (firstRunSteps(input).every((step) => step.done)) return false;
  if (input.checklistVisible) return true;
  return input.cardCount === 0 && input.effectiveFollows === 0;
}

/**
 * The checklist with first-run eligibility folded in. `hold` keeps a card that
 * was already on screen this visit: following one collector must not make it
 * vanish mid-step for an older account, and the last step gets its
 * "You're set" moment. The caller drops `hold` on dismiss.
 */
export function firstRunState(
  checklist: ChecklistState,
  input: { eligible: boolean; hold?: boolean },
): ChecklistState {
  const visible = checklist.visible || input.eligible || input.hold === true;
  if (visible === checklist.visible) return checklist;
  return { ...checklist, visible };
}

/**
 * The server's Get started: its recent-account checklist, or a 0/0 account
 * right now. The hint script settles dismiss before paint.
 */
export function seededFirstRun(getStarted: ChecklistState, zeroNow: boolean | undefined): ChecklistState {
  return firstRunState(getStarted, { eligible: zeroNow === true && !getStarted.complete });
}

/** The first step not done yet, in the order the card lists them. */
export const FIRST_RUN_ORDER = ["card", "follow", "profile"] as const;

export function currentFirstRunStep(steps: ChecklistState["steps"]): ChecklistState["steps"][number]["id"] | null {
  const done = new Map(steps.map((step) => [step.id, step.done]));
  return FIRST_RUN_ORDER.find((id) => done.get(id) !== true) ?? null;
}

type SuggestionLike = {
  id: string;
  username: string;
  isTest?: boolean;
};

/**
 * Up to 3 real collectors for the inline follow step, from suggestions Home
 * already loaded. Never the viewer, a blocked or muted account, a test
 * account, a not-suggested handle, the updates account, or @slabhold (by id).
 */
export function firstRunPeople<T extends SuggestionLike>(
  ranked: readonly T[],
  input: { viewerId: string | null; blockedIds?: Iterable<string>; mutedIds?: Iterable<string>; limit?: number },
): T[] {
  const skip = new Set<string>([...(input.blockedIds ?? []), ...(input.mutedIds ?? [])]);
  if (input.viewerId) skip.add(input.viewerId);
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const person of ranked) {
    if (!person?.id || skip.has(person.id) || seen.has(person.id)) continue;
    if (isOfficialUpdatesAccount(person.id) || isBrandAccount(person.id)) continue;
    if (person.isTest || isTestAccount(person.username)) continue;
    if ((NOT_SUGGESTED_HANDLES as readonly string[]).includes(normalizeAccountHandle(person.username))) continue;
    seen.add(person.id);
    kept.push(person);
    if (kept.length >= (input.limit ?? FOLLOW_GOAL)) break;
  }
  return kept;
}

/* Analytics. Each event fires at most once per user per device. */

export const FIRST_RUN_EVENTS = {
  shown: "first_run_shown",
  card: "first_run_card_done",
  follow: "first_run_follow_done",
  profile: "first_run_profile_done",
  completed: "first_run_completed",
  dismissed: "first_run_dismissed",
} as const;

export type FirstRunEvent = (typeof FIRST_RUN_EVENTS)[keyof typeof FIRST_RUN_EVENTS];

export function firstRunEventKey(event: FirstRunEvent, userId: string) {
  return `slabhold.first-run.${event}.${userId}`;
}

/**
 * Events for a change seen while the card is on screen: a step that flips from
 * not done to done, and the whole list once it is complete. A load where a
 * step was already done fires nothing, because `prev` is that first state.
 */
export function firstRunEventsFor(
  prev: ChecklistState["steps"] | null,
  next: ChecklistState["steps"],
): FirstRunEvent[] {
  if (!prev) return [];
  const before = new Map(prev.map((step) => [step.id, step.done]));
  const events: FirstRunEvent[] = [];
  for (const id of FIRST_RUN_ORDER) {
    const now = next.find((step) => step.id === id)?.done === true;
    if (now && before.get(id) === false) events.push(FIRST_RUN_EVENTS[id]);
  }
  const wasComplete = prev.every((step) => step.done);
  if (!wasComplete && next.length > 0 && next.every((step) => step.done)) events.push(FIRST_RUN_EVENTS.completed);
  return events;
}

type KeyStore = Pick<Storage, "getItem" | "setItem">;

/** Covers a device whose storage throws, so each event still goes once per visit. */
const sentThisVisit = new Set<string>();

/** Sends `event` unless this device already sent it for this user. True when it was sent. */
export function trackFirstRunOnce(
  event: FirstRunEvent,
  userId: string | null,
  deps: { storage: KeyStore | null; send: (name: string) => void },
): boolean {
  if (!userId) return false;
  const key = firstRunEventKey(event, userId);
  if (sentThisVisit.has(key)) return false;
  sentThisVisit.add(key);
  try {
    if (deps.storage?.getItem(key) === "1") return false;
    deps.storage?.setItem(key, "1");
  } catch {
    // Storage blocked: still send once for this visit.
  }
  deps.send(event);
  return true;
}

import { isOfficialUpdatesAccount } from "@/lib/social/official-updates";
import { NOT_SUGGESTED_HANDLES, isTestAccount, normalizeAccountHandle } from "@/lib/test-accounts";

/** First-run setup after the first sign-in, in order. Each one can be skipped. */
export const SETUP_STEPS = ["collect", "people", "card"] as const;

export type SetupStep = (typeof SETUP_STEPS)[number];

export type SetupState = SetupStep | "done";

/** Setup progress for this user on this device. */
export function setupKey(userId: string) {
  return `slabhold.setup.${userId}`;
}

export function parseSetupState(value: string | null): SetupState | null {
  if (value === "done") return "done";
  return (SETUP_STEPS as readonly string[]).includes(value ?? "") ? (value as SetupStep) : null;
}

export function setupProgress(step: SetupStep): number {
  return (SETUP_STEPS.indexOf(step) + 1) / SETUP_STEPS.length;
}

export function setupStepAfter(step: SetupStep, action: "next" | "skip" | "back"): SetupState {
  const index = SETUP_STEPS.indexOf(step);
  if (action === "back") return SETUP_STEPS[Math.max(0, index - 1)];
  return SETUP_STEPS[index + 1] ?? "done";
}

/**
 * Setup shows to a new collector who hasn't said what they collect, and
 * comes back to the same step after a reload. Existing collectors who
 * already answered never see it. Local mode has no interests table, so a
 * brand-new local account stands in for "not answered".
 */
export function setupVisible(input: {
  signedIn: boolean;
  stored: SetupState | null;
  table: "loading" | "missing" | "ready";
  answered: boolean;
  pathname: string;
  localNewUser: boolean;
}): boolean {
  if (!input.signedIn || input.stored === "done") return false;
  if (input.pathname.startsWith("/settings/collecting")) return false;
  if (input.stored) return true;
  if (input.table === "ready") return !input.answered;
  if (input.table === "missing") return input.localNewUser;
  return false;
}

/** Get started, the first-card prompts, and the home-screen tip wait while any of these is up. */
export function oldPromptsHidden(input: { setupActive: boolean; celebrating: boolean; tourOpen: boolean }): boolean {
  return input.setupActive || input.celebrating || input.tourOpen;
}

export type TourTarget = "menu" | "add-card" | "leaderboard" | "collection" | "messages";

export const TOUR_STEPS: readonly { target: TourTarget; title: string; body: string }[] = [
  { target: "menu", title: "Your menu", body: "Your menu: profile, achievements, settings." },
  { target: "add-card", title: "Add card", body: "Add a card in seconds. We match it to real sold prices." },
  { target: "leaderboard", title: "Leaderboard", body: "Climb the weekly board." },
  { target: "collection", title: "Collection", body: "Your cards and their value." },
  { target: "messages", title: "Messages", body: "DM other collectors." },
];

/** Set once the tour has been finished or skipped. */
export function tourKey(userId: string) {
  return `slabhold.tour.seen.${userId}`;
}

/** The tour starts on its own once, right after setup. The menu can replay it. */
export function tourAutoStarts(input: { seen: boolean; setupJustFinished: boolean }): boolean {
  return input.setupJustFinished && !input.seen;
}

/**
 * The first step at or past `from` (in `direction`) whose element is on
 * screen. Null when none is left, which ends the tour.
 */
export function tourStepFrom(from: number, shown: readonly boolean[], direction: 1 | -1): number | null {
  for (let index = from; index >= 0 && index < shown.length; index += direction) {
    if (shown[index]) return index;
  }
  return null;
}

/** The official app account. Suggested first when it exists. */
export const SETUP_PINNED_HANDLES = ["slabholdapp", "slabhold"] as const;

/**
 * Who "Follow a few collectors" may show: no test accounts, no official
 * accounts other than the Slabhold app account, and never yourself.
 */
export function setupSuggestions<T extends { userId: string; username: string; isTest?: boolean }>(
  list: readonly T[],
  viewerId: string | null,
): T[] {
  const kept = list.filter((entry) => {
    if (entry.userId === viewerId || entry.isTest) return false;
    if (isOfficialUpdatesAccount(entry.userId)) return false;
    if (isTestAccount(entry.username)) return false;
    return !(NOT_SUGGESTED_HANDLES as readonly string[]).includes(normalizeAccountHandle(entry.username));
  });
  const pinned = (entry: T) =>
    (SETUP_PINNED_HANDLES as readonly string[]).includes(normalizeAccountHandle(entry.username));
  return [...kept.filter(pinned), ...kept.filter((entry) => !pinned(entry))];
}

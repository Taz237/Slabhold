/**
 * Invite moments: three quiet places that ask a collector to bring a buddy.
 * Home (under 5 follows), the Added scene right after a save, and under your
 * own spot on this week's leaderboard. Each one is dismissible and shows at
 * most once a week per account, kept in localStorage like the other hints.
 * Never on the card page itself. Pure, no React.
 */

export type InviteMoment = "home" | "added" | "leaderboard";

export const INVITE_MOMENT_COPY: Record<InviteMoment, string> = {
  home: "Your feed gets better with your card buddies. Invite one.",
  added: "Show a buddy",
  leaderboard: "Bring a buddy onto this board",
};

export const INVITE_MOMENT_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** One showing lasts a visit: the row doesn't vanish when you come back to the page a minute later. */
export const INVITE_MOMENT_VISIT_MS = 30 * 60 * 1000;

/** Home asks until you follow this many collectors. */
export const HOME_INVITE_FOLLOW_LIMIT = 5;

export type MomentStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

type MomentRecord = { shownAt: number; dismissedAt?: number };

export function inviteMomentKey(moment: InviteMoment, userId: string): string {
  return `slabhold.invite-moment.${moment}.${userId}`;
}

export function homeInviteEligible(input: {
  ready: boolean;
  signedIn: boolean;
  following: number;
  /** Get started, first-run setup or the tour is on screen. */
  busy: boolean;
}): boolean {
  return input.ready && input.signedIn && !input.busy && input.following < HOME_INVITE_FOLLOW_LIMIT;
}

export function leaderboardInviteEligible(input: { week: "current" | "previous"; hasSpot: boolean }): boolean {
  return input.week === "current" && input.hasSpot;
}

function validTime(value: unknown, now: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value <= now + 60_000;
}

/** The stored record, or null when there is none or it can't be trusted. Throws when storage is blocked. */
function readRecord(store: MomentStore, moment: InviteMoment, userId: string, now: number): MomentRecord | null {
  const raw = store.getItem(inviteMomentKey(moment, userId));
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const { shownAt, dismissedAt } = parsed as { shownAt?: unknown; dismissedAt?: unknown };
  if (!validTime(shownAt, now)) return null;
  return validTime(dismissedAt, now) ? { shownAt, dismissedAt } : { shownAt };
}

export function readInviteMoment(
  store: MomentStore,
  moment: InviteMoment,
  userId: string,
  now = Date.now(),
): MomentRecord | null {
  try {
    return readRecord(store, moment, userId, now);
  } catch {
    return null;
  }
}

/**
 * Show when never shown, when the last showing is a week old, or when it is
 * still the same visit (and not dismissed). Blocked storage hides it, so a
 * private window is never asked on every page.
 */
export function shouldShowInviteMoment(
  store: MomentStore | null,
  moment: InviteMoment,
  userId: string,
  now = Date.now(),
): boolean {
  if (!store || !userId) return false;
  let record: MomentRecord | null;
  try {
    record = readRecord(store, moment, userId, now);
  } catch {
    return false;
  }
  if (!record) return true;
  if (record.dismissedAt != null) return now - record.dismissedAt >= INVITE_MOMENT_WEEK_MS;
  const age = now - record.shownAt;
  return age < INVITE_MOMENT_VISIT_MS || age >= INVITE_MOMENT_WEEK_MS;
}

/** Starts the week on the first showing. A second showing in the same visit keeps the first time. */
export function markInviteMomentShown(store: MomentStore | null, moment: InviteMoment, userId: string, now = Date.now()) {
  if (!store || !userId) return;
  try {
    const record = readRecord(store, moment, userId, now);
    if (record && record.dismissedAt == null && now - record.shownAt < INVITE_MOMENT_WEEK_MS) return;
    store.setItem(inviteMomentKey(moment, userId), JSON.stringify({ shownAt: now }));
  } catch {
    // Storage is off. The row just won't be remembered.
  }
}

/** Hidden now, and back no sooner than a week from this tap. */
export function dismissInviteMoment(store: MomentStore | null, moment: InviteMoment, userId: string, now = Date.now()) {
  if (!store || !userId) return;
  try {
    const record = readRecord(store, moment, userId, now);
    store.setItem(inviteMomentKey(moment, userId), JSON.stringify({ shownAt: record?.shownAt ?? now, dismissedAt: now }));
  } catch {
    // Storage is off. It hides for this visit only.
  }
}

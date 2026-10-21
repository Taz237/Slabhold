export type HomeTab = "foryou" | "following";

export type ChecklistStepId = "follow" | "card" | "profile";

export type ChecklistState = {
  visible: boolean;
  complete: boolean;
  steps: { id: ChecklistStepId; done: boolean }[];
};

/** A brand-new account has not followed anyone and has no cards yet. */
export function isNewUser(input: { followingCount: number; cardCount: number }): boolean {
  return input.followingCount === 0 && input.cardCount === 0;
}

/** Seven days. A minute of clock skew still counts as just created. */
const NEW_ACCOUNT_MS = 7 * 24 * 60 * 60 * 1000;

export function checklistNewUserKey(userId: string) {
  return `slabhold.get-started.new.${userId}`;
}

/** "1" means the first ready feed load saw a new user. "0" means it did not. */
export function storedNewUserFlag(value: string | null): boolean | null {
  if (value === "1") return true;
  if (value === "0") return false;
  return null;
}

export function isRecentAccount(createdAt: string, now = Date.now()): boolean {
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return false;
  const age = now - created;
  return age >= -60_000 && age <= NEW_ACCOUNT_MS;
}

const FOLLOW_GOAL = 3;

/** For You until they follow 3 collectors, so one follow does not open an empty feed. */
export function defaultHomeTab(input: { followingCount: number; cardCount: number }): HomeTab {
  if (input.followingCount >= FOLLOW_GOAL) return "following";
  return "foryou";
}

export function followStepLabel(followingCount: number): string {
  const count = Number.isFinite(followingCount) ? Math.max(0, Math.floor(followingCount)) : 0;
  const shown = Math.min(count, FOLLOW_GOAL);
  return `Follow ${FOLLOW_GOAL} collectors (${shown} of ${FOLLOW_GOAL})`;
}

/** A photo or a bio counts. A blank bio does not. */
export function profileStepDone(input: {
  avatarDataUrl?: string | null;
  bio?: string | null;
}): boolean {
  if ((input.avatarDataUrl ?? "").trim().length > 0) return true;
  return (input.bio ?? "").trim().length > 0;
}

export function checklistDismissKey(userId: string) {
  return `slabhold.get-started.dismissed.${userId}`;
}

export function checklistState(input: {
  cardCount: number;
  followingCount: number;
  profileDone: boolean;
  dismissed: boolean;
  ready: boolean;
  createdAt: string | null;
  /** Snapshot from the first ready feed load. Null until that load is saved. */
  wasNewUser: boolean | null;
  now?: number;
}): ChecklistState {
  const steps: ChecklistState["steps"] = [
    { id: "follow", done: input.followingCount >= FOLLOW_GOAL },
    { id: "card", done: input.cardCount > 0 },
    { id: "profile", done: input.profileDone },
  ];
  const complete = steps.every((step) => step.done);
  const recent =
    input.createdAt != null && isRecentAccount(input.createdAt, input.now ?? Date.now());
  return {
    complete,
    steps,
    visible:
      input.ready && recent && input.wasNewUser === true && !input.dismissed && !complete,
  };
}

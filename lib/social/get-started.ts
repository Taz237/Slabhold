export type HomeTab = "foryou" | "following";

export type ChecklistStepId = "card" | "follow" | "post";

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

/** Local demo only. The home feed is capped, so Supabase uses a count query. */
export function countLoadedPosts(posts: { authorId: string }[], userId: string): number {
  let total = 0;
  for (const post of posts) {
    if (post.authorId === userId) total += 1;
  }
  return total;
}

/** For You until they follow someone. A brand-new account always starts on For You. */
export function defaultHomeTab(input: { followingCount: number; cardCount: number }): HomeTab {
  if (isNewUser(input)) return "foryou";
  if (input.followingCount > 0) return "following";
  return "foryou";
}

export function checklistDismissKey(userId: string) {
  return `slabhold.get-started.dismissed.${userId}`;
}

const FOLLOW_GOAL = 3;

export function checklistState(input: {
  cardCount: number;
  followingCount: number;
  postCount: number;
  dismissed: boolean;
  ready: boolean;
  createdAt: string | null;
  /** Snapshot from the first ready feed load. Null until that load is saved. */
  wasNewUser: boolean | null;
  now?: number;
}): ChecklistState {
  const steps: ChecklistState["steps"] = [
    { id: "card", done: input.cardCount > 0 },
    { id: "follow", done: input.followingCount >= FOLLOW_GOAL },
    { id: "post", done: input.postCount > 0 },
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

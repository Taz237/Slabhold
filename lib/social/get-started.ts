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
}): ChecklistState {
  const steps: ChecklistState["steps"] = [
    { id: "card", done: input.cardCount > 0 },
    { id: "follow", done: input.followingCount >= FOLLOW_GOAL },
    { id: "post", done: input.postCount > 0 },
  ];
  const complete = steps.every((step) => step.done);
  return {
    complete,
    steps,
    visible: input.ready && !input.dismissed && !complete,
  };
}

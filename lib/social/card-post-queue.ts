/**
 * Add card saves the card, shows the reveal, and posts to the feed after.
 * The post runs here, outside the form, so leaving the page never cancels it,
 * and the reveal can wait on it instead of the Add button.
 */
export type CardPostOutcome = { postId: string | null };

const pending = new Map<string, Promise<CardPostOutcome>>();

/** Start this card's post unless one is already running. Never rejects. */
export function queueCardPost(
  cardId: string,
  run: () => Promise<CardPostOutcome>,
): Promise<CardPostOutcome> {
  const running = pending.get(cardId);
  if (running) return running;
  let started: Promise<CardPostOutcome>;
  try {
    started = run();
  } catch (error) {
    started = Promise.reject(error);
  }
  const task = started
    .catch((): CardPostOutcome => ({ postId: null }))
    .then((outcome) => {
      pending.delete(cardId);
      return outcome;
    });
  pending.set(cardId, task);
  return task;
}

/** The post still running for this card, or null. */
export function pendingCardPost(cardId: string): Promise<CardPostOutcome> | null {
  return pending.get(cardId) ?? null;
}

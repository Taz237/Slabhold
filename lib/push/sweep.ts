import { flushForActor, logCounts, sweepTails, type Dispatcher } from "./dispatch";

/** An actor id that matches nothing: only the overdue sweep claims rows. */
const NO_ACTOR = "00000000-0000-0000-0000-000000000000";

/**
 * The daily cron. With push on: overdue rows, trailing summaries, then the
 * 7-day prune. Without VAPID keys but with the service role, the outbox
 * triggers still fill private.push_outbox, so it only prunes and sends
 * nothing. Without the service role it does nothing.
 */
export async function runPushSweep(input: {
  dispatcher: Dispatcher | null;
  prune: (() => Promise<void>) | null;
}): Promise<Record<string, unknown>> {
  const { dispatcher } = input;
  if (!dispatcher) {
    if (!input.prune) return { ok: true, available: false };
    await input.prune();
    return { ok: true, available: false, pruned: true };
  }
  const { counts } = await flushForActor(dispatcher, NO_ACTOR);
  await sweepTails(dispatcher, counts);
  await dispatcher.store.prune();
  logCounts("sweep", counts);
  return { ok: true, ...counts, pruned: true };
}

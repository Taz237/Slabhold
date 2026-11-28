import { emptySummary, SUMMARY_MAX_IDS, type VouchSummary } from "./core";

/**
 * Vouch counts for every profile on screen: the part a trust line needs, and nothing else.
 * Saving, statuses and the list live in ./store, which builds on this and loads only where
 * someone can vouch.
 *
 * - Requests made in the same tick go out as one vouch_summaries call, with each id once.
 * - Answers are kept for the session. `invalidate` reads a profile again.
 * - A read that started before a write (`touch`) is dropped, so it can't put old counts back.
 */
export function createSummaryStore(
  load: (userIds: readonly string[]) => Promise<Map<string, VouchSummary>>,
  schedule: (run: () => void) => void = (run) => {
    setTimeout(run, 0);
  },
) {
  const summaries = new Map<string, VouchSummary>();
  const pending = new Set<string>();
  const loading = new Set<string>();
  /** Profiles with a save out: a read never overwrites them. */
  const held = new Set<string>();
  const listeners = new Set<() => void>();
  let queued = false;
  let version = 0;

  function emit() {
    for (const listener of listeners) listener();
  }

  function flush() {
    queued = false;
    const ids = [...pending];
    pending.clear();
    for (let start = 0; start < ids.length; start += SUMMARY_MAX_IDS) {
      const batch = ids.slice(start, start + SUMMARY_MAX_IDS);
      const asked = version;
      for (const id of batch) loading.add(id);
      void load(batch)
        .then((found) => {
          // A write happened while this read was away: its counts may be old, so they are dropped.
          if (asked !== version) return;
          for (const id of batch) {
            if (!held.has(id)) summaries.set(id, found.get(id) ?? emptySummary(id));
          }
        })
        .catch(() => {
          // Left unloaded: the next request tries again.
        })
        .finally(() => {
          for (const id of batch) loading.delete(id);
          // Dropped as stale: ask again, now that the write is in.
          if (asked !== version) for (const id of batch) request(id);
          emit();
        });
    }
  }

  /** Ask for a profile's counts. Cheap to call on every render. */
  function request(userId: string) {
    if (!userId || summaries.has(userId) || loading.has(userId) || pending.has(userId)) return;
    pending.add(userId);
    if (!queued) {
      queued = true;
      schedule(flush);
    }
  }

  return {
    /** A profile's counts. Null until they load. */
    get(userId: string): VouchSummary | null {
      return summaries.get(userId) ?? null;
    },
    request,
    /** Put counts in by hand (a save's guess, or a rollback). Null forgets them. */
    set(userId: string, summary: VouchSummary | null) {
      if (summary) summaries.set(userId, summary);
      else summaries.delete(userId);
    },
    hold(userId: string) {
      held.add(userId);
    },
    release(userId: string) {
      held.delete(userId);
    },
    /** A write is starting or has landed: reads already out are now stale. */
    touch() {
      version += 1;
    },
    /** Forget a profile's counts and read them again. */
    invalidate(userId: string) {
      version += 1;
      summaries.delete(userId);
      request(userId);
    },
    emit,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type SummaryStore = ReturnType<typeof createSummaryStore>;

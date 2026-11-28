import { cleanVouchText, emptySummary, SUMMARY_MAX_IDS, VOUCH_COPY, vouchHintCopy, vouchNoteProblem, vouchReplyProblem, type VouchRating, type VouchSummary } from "./rules";
import type { VouchBackend, VouchStatus, VouchWriteResult } from "./types";

type Mine = NonNullable<VouchStatus["mine"]>;

const BUSY: VouchWriteResult = { ok: false, error: VOUCH_COPY.busy, hint: null };
const FAILED: VouchWriteResult = { ok: false, error: VOUCH_COPY.failed, hint: null };

/** The counts after one vouch is added, changed or taken away. Never below zero. */
export function summaryAfter(summary: VouchSummary, before: VouchRating | null, after: VouchRating | null, now: string): VouchSummary {
  const next = { ...summary };
  if (before) {
    next[before] = Math.max(0, next[before] - 1);
    next.total = Math.max(0, next.total - 1);
  }
  if (after) {
    next[after] += 1;
    next.total += 1;
    if (!before) next.lastVouchAt = now;
  }
  return next;
}

/**
 * Vouch counts for every profile on screen, and whether the reader can vouch for each.
 *
 * - Requests made in the same tick go to the backend as one vouch_summaries call, with each id once.
 * - Answers are kept for the session. A write reads the affected profile again.
 * - A save shows at once and is rolled back if the server refuses it.
 * - A second tap while one save is out is ignored.
 *
 * Each viewer gets their own store.
 */
export function createVouchStore(
  backend: VouchBackend,
  schedule: (run: () => void) => void = (run) => {
    setTimeout(run, 0);
  },
) {
  const summaries = new Map<string, VouchSummary>();
  const pending = new Set<string>();
  const loading = new Set<string>();
  const statuses = new Map<string, VouchStatus>();
  const statusLoading = new Set<string>();
  const saving = new Set<string>();
  const replying = new Set<string>();
  const listeners = new Set<() => void>();
  let queued = false;
  /** Bumped by every write, so a read that started before it can't put stale counts back. */
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
      void backend
        .summaries(batch)
        .then((found) => {
          // A write happened while this read was away: its counts may be old, so they are dropped.
          if (asked !== version) return;
          for (const id of batch) {
            if (!saving.has(id)) summaries.set(id, found.get(id) ?? emptySummary(id));
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

  function request(userId: string) {
    if (!userId || summaries.has(userId) || loading.has(userId) || pending.has(userId)) return;
    pending.add(userId);
    if (!queued) {
      queued = true;
      schedule(flush);
    }
  }

  function requestStatus(subjectId: string) {
    if (!subjectId || statuses.has(subjectId) || statusLoading.has(subjectId)) return;
    statusLoading.add(subjectId);
    void backend
      .status(subjectId)
      .then((status) => {
        if (!saving.has(subjectId)) statuses.set(subjectId, status);
      })
      .catch(() => {
        // Left unloaded: the next request tries again.
      })
      .finally(() => {
        statusLoading.delete(subjectId);
        emit();
      });
  }

  /** Forget what we know about a profile and read it again. */
  function invalidate(userId: string) {
    version += 1;
    summaries.delete(userId);
    statuses.delete(userId);
    request(userId);
    requestStatus(userId);
  }

  async function write(subjectId: string, after: { rating: VouchRating; note: string } | null, run: () => Promise<VouchWriteResult>) {
    if (saving.has(subjectId)) return BUSY;
    const summaryBefore = summaries.get(subjectId);
    const statusBefore = statuses.get(subjectId);
    const mineBefore = statusBefore?.mine ?? null;
    saving.add(subjectId);
    version += 1;
    if (summaryBefore) {
      summaries.set(subjectId, summaryAfter(summaryBefore, mineBefore?.rating ?? null, after?.rating ?? null, new Date().toISOString()));
    }
    if (statusBefore) {
      const mine: Mine | null = after ? { id: mineBefore?.id ?? "", rating: after.rating, note: after.note } : null;
      statuses.set(subjectId, { ...statusBefore, mine });
    }
    emit();
    let result: VouchWriteResult;
    try {
      result = await run();
    } catch {
      result = FAILED;
    }
    saving.delete(subjectId);
    if (result.ok) {
      // The server's counts and the vouch's real id replace the guess.
      invalidate(subjectId);
    } else {
      if (summaryBefore) summaries.set(subjectId, summaryBefore);
      else summaries.delete(subjectId);
      if (statusBefore) statuses.set(subjectId, statusBefore);
      else statuses.delete(subjectId);
    }
    emit();
    return result;
  }

  return {
    /** A profile's counts. Null until they load. */
    summary(userId: string): VouchSummary | null {
      return summaries.get(userId) ?? null;
    },
    /** Ask for a profile's counts. Cheap to call on every render. */
    request,
    /** Whether the reader can vouch for this person. Null until it loads. */
    status(subjectId: string): VouchStatus | null {
      return statuses.get(subjectId) ?? null;
    },
    requestStatus,
    invalidate,
    isSaving(subjectId: string) {
      return saving.has(subjectId);
    },
    /** Leave a vouch or change yours. Checked here first, so a note that can't be saved never leaves the device. */
    async upsert(subjectId: string, rating: VouchRating, note: string, blocked?: (text: string) => boolean): Promise<VouchWriteResult> {
      const problem = vouchNoteProblem(rating, note, blocked);
      if (problem) return { ok: false, error: vouchHintCopy(problem), hint: problem };
      const body = cleanVouchText(note);
      return write(subjectId, { rating, note: body }, () => backend.upsert(subjectId, rating, body));
    },
    async remove(subjectId: string): Promise<VouchWriteResult> {
      return write(subjectId, null, () => backend.remove(subjectId));
    },
    /** The subject's reply to one vouch. An empty reply removes it. */
    async reply(vouchId: string, text: string, blocked?: (text: string) => boolean): Promise<VouchWriteResult> {
      const problem = vouchReplyProblem(text, blocked);
      if (problem) return { ok: false, error: vouchHintCopy(problem), hint: problem };
      if (replying.has(vouchId)) return BUSY;
      replying.add(vouchId);
      try {
        return await backend.reply(vouchId, cleanVouchText(text));
      } catch {
        return FAILED;
      } finally {
        replying.delete(vouchId);
      }
    },
    /** One page of someone's vouches. Not kept: the page that shows them holds its own rows. */
    list: backend.list,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type VouchStore = ReturnType<typeof createVouchStore>;

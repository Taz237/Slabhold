import { VOUCH_BUSY, VOUCH_FAILED, type VouchRating, type VouchSummary } from "./core";
import { createSummaryStore, type SummaryStore } from "./summary-store";
import type { VouchBackend, VouchStatus, VouchWriteResult } from "./types";

type Mine = NonNullable<VouchStatus["mine"]>;

const BUSY: VouchWriteResult = { ok: false, error: VOUCH_BUSY, hint: null };
const FAILED: VouchWriteResult = { ok: false, error: VOUCH_FAILED, hint: null };

/**
 * The note checks and their copy load with the first save, not with the store: a profile that
 * only shows a trust line never needs them.
 */
const loadRules = () => import("./rules");

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
 * Everything about vouches a screen where someone can vouch needs: the counts (from
 * ./summary-store), whether the reader can vouch for each person, saving and replying.
 *
 * - A save shows at once and is rolled back if the server refuses it.
 * - A second tap while one save is out is ignored.
 * - The note checks (./rules) load with the first save.
 *
 * Each viewer gets their own store.
 */
export function createVouchStore(
  backend: VouchBackend,
  schedule: (run: () => void) => void = (run) => {
    setTimeout(run, 0);
  },
  /** The counts a trust line already reads (./summary-store). Shared, so a save updates the line too. */
  summaries: SummaryStore = createSummaryStore((ids) => backend.summaries(ids), schedule),
) {
  const statuses = new Map<string, VouchStatus>();
  const statusLoading = new Set<string>();
  const saving = new Set<string>();
  /** Taps whose note is still being checked, before the save itself starts. */
  const starting = new Set<string>();
  const replying = new Set<string>();
  const emit = summaries.emit;
  const request = summaries.request;

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
    statuses.delete(userId);
    summaries.invalidate(userId);
    requestStatus(userId);
  }

  async function write(subjectId: string, after: { rating: VouchRating; note: string } | null, run: () => Promise<VouchWriteResult>) {
    if (saving.has(subjectId)) return BUSY;
    const summaryBefore = summaries.get(subjectId);
    const statusBefore = statuses.get(subjectId);
    const mineBefore = statusBefore?.mine ?? null;
    saving.add(subjectId);
    summaries.hold(subjectId);
    summaries.touch();
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
    summaries.release(subjectId);
    if (result.ok) {
      // The server's counts and the vouch's real id replace the guess.
      invalidate(subjectId);
    } else {
      summaries.set(subjectId, summaryBefore);
      if (statusBefore) statuses.set(subjectId, statusBefore);
      else statuses.delete(subjectId);
    }
    emit();
    return result;
  }

  return {
    /** A profile's counts. Null until they load. */
    summary(userId: string): VouchSummary | null {
      return summaries.get(userId);
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
      return saving.has(subjectId) || starting.has(subjectId);
    },
    /** Leave a vouch or change yours. Checked here first, so a note that can't be saved never leaves the device. */
    async upsert(subjectId: string, rating: VouchRating, note: string, blocked?: (text: string) => boolean): Promise<VouchWriteResult> {
      if (saving.has(subjectId) || starting.has(subjectId)) return BUSY;
      starting.add(subjectId);
      let rules: Awaited<ReturnType<typeof loadRules>>;
      try {
        rules = await loadRules();
      } catch {
        return FAILED;
      } finally {
        starting.delete(subjectId);
      }
      const problem = rules.vouchNoteProblem(rating, note, blocked);
      if (problem) return { ok: false, error: rules.vouchHintCopy(problem), hint: problem };
      const body = rules.cleanVouchText(note);
      return write(subjectId, { rating, note: body }, () => backend.upsert(subjectId, rating, body));
    },
    async remove(subjectId: string): Promise<VouchWriteResult> {
      if (starting.has(subjectId)) return BUSY;
      return write(subjectId, null, () => backend.remove(subjectId));
    },
    /** The subject's reply to one vouch. An empty reply removes it. */
    async reply(vouchId: string, text: string, blocked?: (text: string) => boolean): Promise<VouchWriteResult> {
      if (replying.has(vouchId)) return BUSY;
      replying.add(vouchId);
      try {
        const rules = await loadRules();
        const problem = rules.vouchReplyProblem(text, blocked);
        if (problem) return { ok: false, error: rules.vouchHintCopy(problem), hint: problem };
        return await backend.reply(vouchId, rules.cleanVouchText(text));
      } catch {
        return FAILED;
      } finally {
        replying.delete(vouchId);
      }
    },
    /** One page of someone's vouches. Not kept: the page that shows them holds its own rows. */
    list: backend.list,
    subscribe: summaries.subscribe,
  };
}

export type VouchStore = ReturnType<typeof createVouchStore>;

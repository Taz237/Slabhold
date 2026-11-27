import { pollEnded, withVote, type PollCounts, type PostPoll } from "./polls";

/** Where counts come from and votes go: Supabase, or this device in local mode. */
export type PollBackend = {
  /** Counts for these polls. A poll left out of the map shows no votes yet. */
  load(ids: readonly string[]): Promise<Map<string, PollCounts>>;
  /** One vote. On success, the poll's counts after it. */
  vote(
    pollId: string,
    optionId: string,
  ): Promise<{ counts?: PollCounts; error?: string; already?: boolean; refusal?: VoteRefusal }>;
};

export type VoteRefusal =
  | "signed_out"
  | "own_poll"
  | "poll_ended"
  | "already_voted"
  | "busy"
  | "unknown_option"
  | "suspended"
  | "poll_choice_text";

export const VOTE_REFUSAL_COPY: Record<VoteRefusal, string> = {
  signed_out: "Sign in to vote.",
  own_poll: "You can't vote in your own poll.",
  poll_ended: "This poll has ended.",
  already_voted: "You already voted in this poll.",
  busy: "Saving your vote…",
  unknown_option: "That choice is unavailable.",
  suspended: "Your account is suspended.",
  poll_choice_text: "A choice can't have line breaks.",
};

const EMPTY: PollCounts = { total: 0, votes: {}, viewerChoice: null };
const BATCH = 100;

/**
 * Poll counts for every poll on screen. Requests made in the same tick go to
 * the backend as one read. A vote shows at once and is rolled back if the
 * server refuses it. Each viewer gets their own store.
 */
export function createPollStore(
  backend: PollBackend,
  schedule: (run: () => void) => void = (run) => {
    setTimeout(run, 0);
  },
) {
  const counts = new Map<string, PollCounts>();
  const pending = new Set<string>();
  const loading = new Set<string>();
  const voting = new Set<string>();
  const listeners = new Set<() => void>();
  let queued = false;

  function emit() {
    for (const listener of listeners) listener();
  }

  function flush() {
    queued = false;
    const ids = [...pending];
    pending.clear();
    for (let start = 0; start < ids.length; start += BATCH) {
      const batch = ids.slice(start, start + BATCH);
      for (const id of batch) loading.add(id);
      void backend
        .load(batch)
        .then((found) => {
          for (const id of batch) {
            // A vote that landed while this read was out wins over it.
            if (!counts.get(id)?.viewerChoice || found.get(id)?.viewerChoice) counts.set(id, found.get(id) ?? EMPTY);
          }
        })
        .catch(() => {
          // Left unloaded: the next request tries again.
        })
        .finally(() => {
          for (const id of batch) loading.delete(id);
          emit();
        });
    }
  }

  return {
    get(id: string): PollCounts | null {
      return counts.get(id) ?? null;
    },
    /** Ask for a poll's counts. Cheap to call on every render. */
    request(id: string) {
      if (counts.has(id) || loading.has(id) || pending.has(id)) return;
      pending.add(id);
      if (!queued) {
        queued = true;
        schedule(flush);
      }
    },
    /** Read again, e.g. after pull to refresh. */
    refresh(id: string) {
      if (loading.has(id) || voting.has(id)) return;
      counts.delete(id);
      this.request(id);
    },
    isVoting(id: string) {
      return voting.has(id);
    },
    async vote(
      poll: PostPoll,
      optionId: string,
      viewer: { signedIn: boolean; isAuthor: boolean; now?: number },
    ): Promise<{ error?: string; refusal?: VoteRefusal }> {
      const refuse = (refusal: VoteRefusal) => ({ refusal, error: VOTE_REFUSAL_COPY[refusal] });
      if (!viewer.signedIn) return refuse("signed_out");
      if (viewer.isAuthor) return refuse("own_poll");
      if (pollEnded(poll, viewer.now ?? Date.now())) return refuse("poll_ended");
      if (!poll.options.some((option) => option.id === optionId)) return refuse("unknown_option");
      if (voting.has(poll.id)) return refuse("busy");
      const before = counts.get(poll.id) ?? EMPTY;
      if (before.viewerChoice) return refuse("already_voted");

      voting.add(poll.id);
      counts.set(poll.id, withVote(before, optionId));
      emit();
      try {
        const result = await backend.vote(poll.id, optionId);
        if (result.counts) {
          counts.set(poll.id, result.counts);
          return {};
        }
        if (result.already) {
          // Voted elsewhere (another tab or device): show the stored choice.
          counts.delete(poll.id);
          voting.delete(poll.id);
          this.request(poll.id);
          return { error: result.error ?? VOTE_REFUSAL_COPY.already_voted, refusal: "already_voted" };
        }
        counts.set(poll.id, before);
        if (result.refusal) return { error: result.error ?? VOTE_REFUSAL_COPY[result.refusal], refusal: result.refusal };
        return { error: result.error ?? "Couldn't save your vote. Try again." };
      } catch {
        counts.set(poll.id, before);
        return { error: "Couldn't save your vote. Try again." };
      } finally {
        voting.delete(poll.id);
        emit();
      }
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type PollStore = ReturnType<typeof createPollStore>;

import type { PollBackend } from "./poll-store";
import type { PollCounts, PostPoll } from "./polls";
import { pollChoices, pollMinutes, type PollDraft } from "./poll-draft";

/**
 * Local mode (no Supabase): polls live on the post in the device's local
 * database, and the counts and this device's vote in their own key.
 */
export const LOCAL_POLLS_KEY = "slabhold.local-polls.v1";

type StoredPoll = { votes: Record<string, number>; choice: string | null };
type Stored = Record<string, StoredPoll>;

/** The poll a new local post carries. */
export function localPoll(postId: string, draft: PollDraft, now: number): PostPoll {
  const id = `${postId}-poll`;
  return {
    id,
    endsAt: new Date(now + pollMinutes(draft.length) * 60_000).toISOString(),
    options: pollChoices(draft).map((label, index) => ({ id: `${id}-${index}`, label })),
  };
}

type KeyValue = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): KeyValue | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function read(storage: KeyValue | null): Stored {
  try {
    const raw = storage?.getItem(LOCAL_POLLS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Stored) : {};
  } catch {
    return {};
  }
}

function countsOf(stored: StoredPoll | undefined): PollCounts {
  const votes = { ...(stored?.votes ?? {}) };
  const total = Object.values(votes).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
  return { total, votes, viewerChoice: stored?.choice ?? null };
}

export function localPollBackend(storage: KeyValue | null = browserStorage()): PollBackend {
  return {
    async load(ids) {
      const stored = read(storage);
      return new Map(ids.map((id) => [id, countsOf(stored[id])]));
    },
    async vote(pollId, optionId) {
      const stored = read(storage);
      const current = stored[pollId] ?? { votes: {}, choice: null };
      if (current.choice) return { error: "You already voted in this poll.", already: true };
      const next: StoredPoll = {
        votes: { ...current.votes, [optionId]: (current.votes[optionId] ?? 0) + 1 },
        choice: optionId,
      };
      try {
        storage?.setItem(LOCAL_POLLS_KEY, JSON.stringify({ ...stored, [pollId]: next }));
      } catch {
        return { error: "Couldn't save your vote. Try again." };
      }
      return { counts: countsOf(next) };
    },
  };
}

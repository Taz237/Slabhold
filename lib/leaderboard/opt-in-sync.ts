/**
 * Keeps the leaderboard switch and prompt in step on one screen. After either
 * one saves, the other hears the saved value for that account. Client-only and
 * in memory: no context, no storage.
 */
export type LeaderboardOptInChange = { userId: string; optedIn: boolean };

const listeners = new Set<(change: LeaderboardOptInChange) => void>();

export function publishLeaderboardOptIn(change: LeaderboardOptInChange): void {
  for (const listener of [...listeners]) listener(change);
}

/** Hear saves for one account. Returns the unsubscribe. */
export function subscribeLeaderboardOptIn(userId: string, onChange: (optedIn: boolean) => void): () => void {
  const listener = (change: LeaderboardOptInChange) => {
    if (change.userId === userId) onChange(change.optedIn);
  };
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

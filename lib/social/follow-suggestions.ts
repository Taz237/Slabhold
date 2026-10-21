import { isTestAccount } from "../test-accounts";

/**
 * Extra profiles to load before dropping test accounts, the viewer,
 * and people they already follow. A few drops then still fill the rail.
 */
export const FOLLOW_SUGGESTION_OVERFETCH = 8;

/** PostgREST returns at most this many rows unless the project raised the cap. */
export const PROFILE_SUGGESTION_PAGE = 1000;

export function followSuggestionFetchLimit(displayLimit: number) {
  const shown = Number.isFinite(displayLimit) ? Math.max(0, Math.floor(displayLimit)) : 0;
  return shown + FOLLOW_SUGGESTION_OVERFETCH;
}

/** A full page means later profiles were left off the suggestion list. */
export function needsSuggestionHeadroom(loadedCount: number, pageSize = PROFILE_SUGGESTION_PAGE) {
  return loadedCount >= pageSize;
}

/** Inclusive range for the next few profiles after the page already loaded. */
export function suggestionExtraRange(loadedCount: number, overfetch = FOLLOW_SUGGESTION_OVERFETCH) {
  const from = Math.max(0, Math.floor(loadedCount));
  return { from, to: from + overfetch - 1 };
}

export type FollowSuggestionCandidate = {
  id: string;
  username: string;
};

/**
 * People to suggest following.
 * Pass candidates from `followSuggestionFetchLimit(limit)` rows, then this
 * drops test accounts, the viewer, and accounts they already follow before
 * cutting the list down to `limit`.
 */
export function followSuggestions<T extends FollowSuggestionCandidate>(
  candidates: readonly T[],
  input: {
    viewerId?: string | null;
    followingIds?: Iterable<string>;
    /** Max people to return. Omit to keep every eligible candidate. */
    limit?: number;
  } = {},
): T[] {
  const viewerId = input.viewerId ?? null;
  const following = new Set(input.followingIds ?? []);
  const filtered = candidates.filter((profile) => {
    if (viewerId && profile.id === viewerId) return false;
    if (following.has(profile.id)) return false;
    if (isTestAccount(profile.username)) return false;
    return true;
  });
  if (input.limit == null || !Number.isFinite(input.limit)) return filtered;
  return filtered.slice(0, Math.max(0, Math.floor(input.limit)));
}

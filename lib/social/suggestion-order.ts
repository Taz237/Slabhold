import { followSuggestions } from "./follow-suggestions";
import type { RankedCollector } from "./follow-rank";
import type { Profile } from "./types";

export type SuggestedProfile = Profile & {
  suggestionReason: string | null;
};

export type ServerSuggestion = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  accent: string | null;
  reason: string | null;
  score: number;
  isTest?: boolean;
};

/**
 * Prefer the server ranking when the RPC exists.
 * A missing function (null) keeps the existing created-at suggestion order.
 * The same followSuggestions filter runs on both paths.
 */
export function mergeRankedSuggestions(input: {
  fallback: readonly Profile[];
  server: readonly ServerSuggestion[] | null;
  viewerId?: string | null;
  followingIds?: Iterable<string>;
  blockedIds?: Iterable<string>;
  limit?: number;
}): SuggestedProfile[] {
  const blocked = new Set(input.blockedIds ?? []);
  if (input.server == null) {
    return followSuggestions(input.fallback, {
      viewerId: input.viewerId,
      followingIds: input.followingIds,
      limit: input.limit,
    }).map((profile) => ({ ...profile, suggestionReason: null }));
  }

  const known = new Map(input.fallback.map((profile) => [profile.id, profile]));
  const ordered: Profile[] = [];
  const reasons = new Map<string, string | null>();
  for (const row of input.server) {
    if (!row.userId || blocked.has(row.userId)) continue;
    const profile = known.get(row.userId) ?? serverProfile(row);
    if (row.isTest) profile.isTest = true;
    ordered.push(profile);
    reasons.set(row.userId, row.reason);
  }
  return followSuggestions(ordered, {
    viewerId: input.viewerId,
    followingIds: input.followingIds,
  }).map((profile) => ({
    ...profile,
    suggestionReason: reasons.get(profile.id) ?? null,
  }));
}

function serverProfile(row: ServerSuggestion): Profile {
  return {
    id: row.userId,
    email: "",
    username: row.username,
    displayName: row.displayName || row.username,
    bio: "",
    avatarDataUrl: row.avatarUrl,
    coverDataUrl: null,
    accent: row.accent || "#7c5cff",
    createdAt: "",
    ...(row.isTest ? { isTest: true } : {}),
  };
}

/** Shape check: a ranked row never carries card columns. */
export function rankedCollectorKeys(row: RankedCollector): string[] {
  return Object.keys(row).sort();
}

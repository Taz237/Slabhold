import { trackEvent } from "@/lib/analytics";

/** Signed-in card pages list this many people. */
export const SIGNED_IN_LIST_LIMIT = 12;

/** Signed-out card pages list this many avatars. The count stays the full total. */
export const SIGNED_OUT_LIST_LIMIT = 5;

export const CARD_PERSON_KEYS = [
  "handle",
  "displayName",
  "avatarUrl",
  "isFollowedByViewer",
] as const;

export type CardFollowSource = "card_owners" | "card_hunters";

/** The only fields a card page may show for a collector. */
export type CardPerson = {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  isFollowedByViewer: boolean;
};

export type CardPersonList = {
  count: number;
  people: CardPerson[];
};

export type OwnersAndHunters = {
  owners: CardPersonList;
  /** Null when this viewer cannot read want lists. Signed-out anon usually cannot. */
  hunters: CardPersonList | null;
};

export type CollectorFlags = {
  userId: string;
  activeAt: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  /** False when a public-visibility check has hidden this account. */
  publiclyVisible: boolean;
  blocked: boolean;
  muted: boolean;
  followed: boolean;
};

export type OwnerCandidate = CollectorFlags & {
  identityKey: string;
  cardPublic: boolean;
  collectionPublic: boolean;
};

export type HunterCandidate = CollectorFlags & {
  identityKey: string;
  wantPublic: boolean;
};

export function emptyPeople(huntersReadable: boolean): OwnersAndHunters {
  const empty: CardPersonList = { count: 0, people: [] };
  return { owners: { count: 0, people: [] }, hunters: huntersReadable ? empty : null };
}

function sharedOk(row: CollectorFlags): boolean {
  if (!row.publiclyVisible) return false;
  if (row.blocked || row.muted) return false;
  return row.handle.trim().length > 0;
}

function qualifiesOwner(row: OwnerCandidate, identityKey: string): boolean {
  if (row.identityKey !== identityKey) return false;
  if (!row.cardPublic || !row.collectionPublic) return false;
  return sharedOk(row);
}

function qualifiesHunter(row: HunterCandidate, identityKey: string): boolean {
  if (row.identityKey !== identityKey) return false;
  if (!row.wantPublic) return false;
  return sharedOk(row);
}

/** Fresh object. Callers cannot leak paid, value, card id, or email by spreading a row. */
export function toCardPerson(row: CollectorFlags): CardPerson {
  return {
    handle: row.handle,
    displayName: row.displayName.trim() || row.handle,
    avatarUrl: row.avatarUrl,
    isFollowedByViewer: row.followed,
  };
}

function distinctLatest<T extends CollectorFlags>(rows: readonly T[]): T[] {
  const byUser = new Map<string, T>();
  for (const row of rows) {
    const prev = byUser.get(row.userId);
    if (!prev || row.activeAt > prev.activeAt) byUser.set(row.userId, row);
  }
  return [...byUser.values()].sort((a, b) => {
    if (a.activeAt !== b.activeAt) return a.activeAt < b.activeAt ? 1 : -1;
    return a.handle.localeCompare(b.handle);
  });
}

function listFrom(rows: readonly CollectorFlags[], viewerId: string | null, limit: number): CardPersonList {
  const distinct = distinctLatest(rows);
  return {
    count: distinct.length,
    people: distinct
      .filter((row) => row.userId !== viewerId)
      .slice(0, limit)
      .map(toCardPerson),
  };
}

/**
 * One pass for the rows and the counts. Private, hidden, blocked, and muted
 * rows are out of both. The viewer is counted and left off the list.
 */
export function assembleCardPeople(input: {
  identityKey: string;
  viewerId: string | null;
  owners: readonly OwnerCandidate[];
  hunters: readonly HunterCandidate[];
  huntersReadable: boolean;
}): OwnersAndHunters {
  const limit = input.viewerId ? SIGNED_IN_LIST_LIMIT : SIGNED_OUT_LIST_LIMIT;
  const owners = input.owners.filter((row) => qualifiesOwner(row, input.identityKey));
  return {
    owners: listFrom(owners, input.viewerId, limit),
    hunters: input.huntersReadable
      ? listFrom(
          input.hunters.filter((row) => qualifiesHunter(row, input.identityKey)),
          input.viewerId,
          limit,
        )
      : null,
  };
}

/** Follow click hides the button immediately. */
export function optimisticFollowClick(): { showingFollow: boolean } {
  return { showingFollow: false };
}

/** A failed follow puts the button back. */
export function rollbackFollowClick(): { showingFollow: boolean } {
  return { showingFollow: true };
}

/** True while this card-page follow control should stay on screen. */
export function followControlVisible(input: {
  followed: boolean;
  optimistic: boolean | null;
  failed: boolean;
}): boolean {
  if (input.failed) return !input.followed;
  const following = input.optimistic ?? input.followed;
  return !following;
}

/**
 * Runs the existing follow action. On success, analytics gets only `{ source }`.
 * An error skips analytics so the caller can roll the button back.
 */
export async function completeCardFollow(
  source: CardFollowSource,
  follow: () => Promise<{ error?: string } | void>,
  track: (name: string, props?: unknown) => void = trackEvent,
): Promise<"ok" | "error"> {
  try {
    const result = await follow();
    if (result && result.error) return "error";
  } catch {
    return "error";
  }
  track("follow", { source });
  return "ok";
}

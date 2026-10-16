const ACTIVE = /(^|[^a-z0-9_])@([a-z0-9_]{0,20})$/i;

export type ActiveMention = {
  start: number;
  end: number;
  query: string;
};

/** Public profile fields used by @mention autocomplete (no email/bio). */
export type MentionCandidate = {
  id: string;
  username: string;
  displayName: string;
  avatarDataUrl: string | null;
  accent: string;
};

/** Escape `%`, `_`, and commas for PostgREST `ilike` / `.or()` filter values. */
export function escapeIlike(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/,/g, "");
}

/**
 * Text typed after `@` up to the cursor when an active mention is open.
 * Returns `null` when the caret is not inside a mention.
 */
export function mentionQueryAt(body: string, cursor: number): string | null {
  return activeMention(body, cursor)?.query ?? null;
}

/**
 * Rank @mention matches: prefix before contains; followed users first within
 * each tier. Case-insensitive. Cap at `limit`.
 * When `query` is empty, only people in `followingIds` are returned.
 */
export function rankMentionMatches(
  people: MentionCandidate[],
  query: string,
  followingIds: ReadonlySet<string>,
  limit = 8,
): MentionCandidate[] {
  const q = query.trim().toLowerCase();
  const scored: Array<{
    person: MentionCandidate;
    tier: number;
    following: number;
    name: string;
  }> = [];

  for (const person of people) {
    const followed = followingIds.has(person.id);
    if (!q) {
      if (!followed) continue;
      scored.push({
        person,
        tier: 0,
        following: 0,
        name: person.username.toLowerCase(),
      });
      continue;
    }

    const username = person.username.toLowerCase();
    const display = person.displayName.toLowerCase();
    let tier: number;
    if (username.startsWith(q) || display.startsWith(q)) tier = 0;
    else if (username.includes(q) || display.includes(q)) tier = 1;
    else continue;

    scored.push({
      person,
      tier,
      following: followed ? 0 : 1,
      name: username,
    });
  }

  scored.sort(
    (a, b) =>
      a.tier - b.tier ||
      a.following - b.following ||
      a.name.localeCompare(b.name),
  );
  return scored.slice(0, limit).map((entry) => entry.person);
}

/** Usernames typed as @name, ignoring emails and partial handles. */
export function mentionUsernames(body: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const mention = /(^|[^a-z0-9_])@([a-z0-9_]{3,20})(?![a-z0-9_])/gi;
  for (const match of body.matchAll(mention)) {
    const username = match[2].toLowerCase();
    if (seen.has(username)) continue;
    seen.add(username);
    found.push(username);
  }
  return found;
}

/** The @query the caret is inside, if the user is currently typing a mention. */
export function activeMention(body: string, cursor: number): ActiveMention | null {
  const safeCursor = Math.max(0, Math.min(cursor, body.length));
  const match = body.slice(0, safeCursor).match(ACTIVE);
  if (!match) return null;
  const typed = match[2].toLowerCase();
  const start = safeCursor - typed.length - 1;
  let end = safeCursor;
  while (end < body.length && /[a-z0-9_]/i.test(body[end] ?? "")) end += 1;
  return { start, end, query: body.slice(start + 1, end).toLowerCase() };
}

export function insertMention(
  body: string,
  mention: ActiveMention,
  username: string,
  limit: number,
): { body: string; caret: number } {
  const handle = username.toLowerCase();
  const after = body.slice(mention.end);
  const needsSpace = after.length === 0 || /[a-z0-9_]/i.test(after[0] ?? "");
  const insertion = `@${handle}${needsSpace ? " " : ""}`;
  if (body.slice(0, mention.start).length + insertion.length > limit) {
    return { body, caret: mention.end };
  }
  const room = limit - mention.start - insertion.length;
  const next = `${body.slice(0, mention.start)}${insertion}${after.slice(0, Math.max(room, 0))}`;
  return { body: next, caret: mention.start + insertion.length };
}

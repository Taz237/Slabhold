const ACTIVE = /(^|[^a-z0-9_])@([a-z0-9_]{0,20})$/i;

export type ActiveMention = {
  start: number;
  end: number;
  query: string;
};

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

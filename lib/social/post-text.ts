export const GET_STARTED_CHECKLIST_HREF = "/#get-started";

const MENTION = /(^|[^a-zA-Z0-9_])(@[a-zA-Z0-9_]{3,20})(?![a-zA-Z0-9_])/g;
const CHECKLIST = /Get started checklist/gi;

export type PostTextPart =
  | { type: "text"; text: string }
  | { type: "mention"; text: string; username: string }
  | { type: "checklist"; text: string; href: string };

/** Split a post into plain text, @mentions, and the Get started checklist phrase. */
export function splitPostText(text: string): PostTextPart[] {
  const marks: { start: number; end: number; part: PostTextPart }[] = [];

  for (const match of text.matchAll(MENTION)) {
    const boundary = match[1];
    const mention = match[2];
    const start = (match.index ?? 0) + boundary.length;
    marks.push({
      start,
      end: start + mention.length,
      part: {
        type: "mention",
        text: mention,
        username: mention.slice(1).toLowerCase(),
      },
    });
  }

  for (const match of text.matchAll(CHECKLIST)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const overlaps = marks.some((mark) => start < mark.end && end > mark.start);
    if (overlaps) continue;
    marks.push({
      start,
      end,
      part: {
        type: "checklist",
        text: match[0],
        href: GET_STARTED_CHECKLIST_HREF,
      },
    });
  }

  marks.sort((a, b) => a.start - b.start);
  const parts: PostTextPart[] = [];
  let cursor = 0;
  for (const mark of marks) {
    if (mark.start < cursor) continue;
    if (mark.start > cursor) parts.push({ type: "text", text: text.slice(cursor, mark.start) });
    parts.push(mark.part);
    cursor = mark.end;
  }
  if (cursor < text.length) parts.push({ type: "text", text: text.slice(cursor) });
  return parts;
}

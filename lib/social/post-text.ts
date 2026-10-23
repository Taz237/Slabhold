export const GET_STARTED_CHECKLIST_HREF = "/#get-started";

/** Visible URL text, including the ellipsis when the host and path are shortened. */
export const URL_DISPLAY_LIMIT = 30;

const TRAILING_PUNCTUATION = ".,!?;:'\"…";
const CLOSERS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

export type PostTextPart =
  | { type: "text"; text: string }
  | { type: "mention"; text: string; username: string }
  | { type: "checklist"; text: string; href: string }
  | { type: "url"; text: string; href: string; display: string }
  | { type: "hashtag"; text: string; href: string; tag: string };

function patterns() {
  return {
    mention: /(^|[^a-zA-Z0-9_])(@[a-zA-Z0-9_]{3,20})(?![a-zA-Z0-9_])/g,
    checklist: /Get started checklist/gi,
    hashtag: /(^|[^a-zA-Z0-9_])(#[A-Za-z0-9_]{2,30})(?![a-zA-Z0-9_])/g,
    url: /(^|[^a-zA-Z0-9_@])((?:https?:\/\/|www\.)[^\s<>"'`]+)/gi,
  };
}

function countChar(value: string, char: string) {
  let count = 0;
  for (const piece of value) if (piece === char) count += 1;
  return count;
}

/** Drop punctuation typed after a URL. Balanced brackets in the path stay. */
export function trimUrlTail(raw: string): string {
  let url = raw;
  while (url.length > 0) {
    const last = url[url.length - 1] ?? "";
    if (TRAILING_PUNCTUATION.includes(last)) {
      url = url.slice(0, -1);
      continue;
    }
    const opener = CLOSERS[last];
    if (opener && countChar(url, last) > countChar(url, opener)) {
      url = url.slice(0, -1);
      continue;
    }
    break;
  }
  return url;
}

/**
 * Accept only http(s). A bare www. host is opened as https.
 * javascript: and data: never come back, even if they sit next to a real URL.
 */
export function safeHttpHref(raw: string): string | null {
  const trimmed = trimUrlTail(raw.trim());
  if (!trimmed) return null;
  const candidate = /^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed;
  if (!/^https?:\/\//i.test(candidate)) return null;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (!/^https?:\/\//i.test(parsed.href)) return null;
  if (/[\u0000-\u001F\u007F]/.test(parsed.href)) return null;
  const host = parsed.hostname.toLowerCase();
  if (!host || host === "javascript" || host === "data") return null;
  if (host !== "localhost" && !host.includes(".")) return null;
  return parsed.href;
}

/** Host and path, scheme removed, shortened so a post stays on one phone width. */
export function displayUrl(original: string): string {
  const withoutScheme = original.replace(/^https?:\/\//i, "");
  const stripped = withoutScheme.endsWith("/") ? withoutScheme.slice(0, -1) : withoutScheme;
  if (stripped.length <= URL_DISPLAY_LIMIT) return stripped;
  return `${stripped.slice(0, URL_DISPLAY_LIMIT - 1)}…`;
}

export function hashtagSearchHref(tag: string): string {
  return `/search?q=${encodeURIComponent(`#${tag}`)}`;
}

type Mark = { start: number; end: number; part: PostTextPart };

function pushMark(marks: Mark[], start: number, end: number, part: PostTextPart) {
  if (end <= start) return;
  marks.push({ start, end, part });
}

/** Split a post into text, @mentions, links, #hashtags, and the checklist phrase. */
export function splitPostText(text: string): PostTextPart[] {
  const { mention, checklist, hashtag, url } = patterns();
  const marks: Mark[] = [];

  for (const match of text.matchAll(mention)) {
    const boundary = match[1] ?? "";
    const handle = match[2] ?? "";
    const start = (match.index ?? 0) + boundary.length;
    pushMark(marks, start, start + handle.length, {
      type: "mention",
      text: handle,
      username: handle.slice(1).toLowerCase(),
    });
  }

  for (const match of text.matchAll(url)) {
    const boundary = match[1] ?? "";
    const raw = match[2] ?? "";
    const start = (match.index ?? 0) + boundary.length;
    const trimmed = trimUrlTail(raw);
    const href = safeHttpHref(trimmed);
    if (!href) continue;
    const displaySource = /^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed;
    pushMark(marks, start, start + trimmed.length, {
      type: "url",
      text: trimmed,
      href,
      display: displayUrl(displaySource),
    });
  }

  for (const match of text.matchAll(hashtag)) {
    const boundary = match[1] ?? "";
    const tagText = match[2] ?? "";
    const start = (match.index ?? 0) + boundary.length;
    const tag = tagText.slice(1);
    pushMark(marks, start, start + tagText.length, {
      type: "hashtag",
      text: tagText,
      href: hashtagSearchHref(tag),
      tag,
    });
  }

  for (const match of text.matchAll(checklist)) {
    const start = match.index ?? 0;
    const phrase = match[0] ?? "";
    pushMark(marks, start, start + phrase.length, {
      type: "checklist",
      text: phrase,
      href: GET_STARTED_CHECKLIST_HREF,
    });
  }

  marks.sort((a, b) => a.start - b.start || b.end - a.end);
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

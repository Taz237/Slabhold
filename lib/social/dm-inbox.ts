import type { DirectMessage, Profile } from "./types";

export type Conversation = {
  person: Profile;
  last: DirectMessage;
  unread: number;
};

/** One row per person, newest thread first. Unread counts only messages sent to the viewer. */
export function inboxConversations(
  messages: readonly DirectMessage[],
  profiles: readonly Profile[],
  viewerId: string,
): Conversation[] {
  const people = new Map(profiles.map((profile) => [profile.id, profile]));
  const grouped = new Map<string, Conversation>();
  for (const message of messages) {
    const partnerId = message.senderId === viewerId ? message.receiverId : message.senderId;
    const person = people.get(partnerId);
    if (!person) continue;
    const current = grouped.get(partnerId);
    const unread = (current?.unread ?? 0) + (message.receiverId === viewerId && !message.read ? 1 : 0);
    if (!current || message.createdAt > current.last.createdAt) {
      grouped.set(partnerId, { person, last: message, unread });
    } else {
      grouped.set(partnerId, { ...current, unread });
    }
  }
  return [...grouped.values()].sort((a, b) => b.last.createdAt.localeCompare(a.last.createdAt));
}

/** Inbox search: name, handle (with or without @), or the last message. */
export function filterConversations(list: readonly Conversation[], query: string): Conversation[] {
  const needle = query.trim().toLowerCase().replace(/^@/, "");
  if (!needle) return [...list];
  return list.filter(
    ({ person, last }) =>
      person.displayName.toLowerCase().includes(needle) ||
      person.username.toLowerCase().includes(needle) ||
      last.content.toLowerCase().includes(needle),
  );
}

/** A quiet stretch this long gets a time line between messages. */
export const THREAD_GAP_MS = 60 * 60 * 1000;

/** Messages from one sender this close together share a group. */
export const GROUP_GAP_MS = 5 * 60 * 1000;

export type ThreadRow =
  | { kind: "gap"; key: string; at: string }
  | { kind: "message"; key: string; message: DirectMessage; mine: boolean; first: boolean; last: boolean };

function gapBetween(a: DirectMessage, b: DirectMessage): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

/**
 * The thread as drawn: a time line at the start and after each long gap, and
 * bubbles grouped by sender so only the last one in a group gets a tail.
 */
export function threadRows(thread: readonly DirectMessage[], viewerId: string): ThreadRow[] {
  const rows: ThreadRow[] = [];
  thread.forEach((message, index) => {
    const before = thread[index - 1];
    const after = thread[index + 1];
    const breakBefore = !before || gapBetween(before, message) >= THREAD_GAP_MS;
    const breakAfter = !after || gapBetween(message, after) >= THREAD_GAP_MS;
    if (breakBefore) rows.push({ kind: "gap", key: `gap-${message.id}`, at: message.createdAt });
    const joinsBefore =
      !breakBefore && before.senderId === message.senderId && gapBetween(before, message) < GROUP_GAP_MS;
    const joinsAfter =
      !breakAfter && after.senderId === message.senderId && gapBetween(message, after) < GROUP_GAP_MS;
    rows.push({
      kind: "message",
      key: message.id,
      message,
      mine: message.senderId === viewerId,
      first: !joinsBefore,
      last: !joinsAfter,
    });
  });
  return rows;
}

/** "Seen" goes under my latest message, only when it closes the thread and was read. */
export function seenMessageId(thread: readonly DirectMessage[], viewerId: string): string | null {
  const last = thread[thread.length - 1];
  if (!last || last.senderId !== viewerId || !last.read) return null;
  return last.id;
}

export type MessageLink =
  | { kind: "post"; id: string }
  | { kind: "card"; username: string; cardId: string };

/** Our own hosts only. The host must be followed by a path, so look-alike domains don't match. */
const LINK = /(?<![\w.-])(?:https?:\/\/)?(?:www\.)?(?:slabhold\.app|slabhold\.vercel\.app)(\/[^\s]*)/gi;
const POST_PATH = /^\/posts\/([A-Za-z0-9-]+)(?=$|[/?#.,!)])/;
const CARD_PATH = /^\/u\/([A-Za-z0-9_]+)\/cards\/([A-Za-z0-9-]+)(?=$|[/?#.,!)])/;

/** At most this many rich previews under one message. */
export const MESSAGE_LINK_LIMIT = 2;

/** Post and card links in a message, first to last, each once. */
export function messageLinks(text: string): MessageLink[] {
  const found: MessageLink[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(LINK)) {
    const path = match[1] ?? "";
    const post = POST_PATH.exec(path);
    const card = post ? null : CARD_PATH.exec(path);
    const link: MessageLink | null = post
      ? { kind: "post", id: post[1] }
      : card
        ? { kind: "card", username: card[1], cardId: card[2] }
        : null;
    if (!link) continue;
    const key = link.kind === "post" ? `post:${link.id}` : `card:${link.cardId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(link);
    if (found.length >= MESSAGE_LINK_LIMIT) break;
  }
  return found;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** The line between messages: "Today 3:04 PM", "Yesterday 9:30 AM", "Oct 2, 8:15 PM". */
export function threadTimeLabel(iso: string, now = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const time = then.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (sameDay(then, now)) return `Today ${time}`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(then, yesterday)) return `Yesterday ${time}`;
  const date = then.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(then.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
  return `${date}, ${time}`;
}

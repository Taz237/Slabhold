import type { Notification, NotificationKind } from "./types";

export type NotificationGroup = {
  key: string;
  kind: NotificationKind;
  /** Newest first. */
  notes: Notification[];
  /** Distinct actors, newest first. Null actors are omitted. */
  actorIds: string[];
  createdAt: string;
  postId: string | null;
  href: string | null;
  preview: string | null;
  read: boolean;
};

const GROUPED_KINDS = new Set<NotificationKind>([
  "like",
  "comment",
  "repost",
  "quote",
  "mention",
  "follow",
]);

export function notificationAction(kind: NotificationKind): string {
  if (kind === "like") return "liked your post";
  if (kind === "comment") return "commented on your post";
  if (kind === "repost") return "reposted your post";
  if (kind === "quote") return "quoted your post";
  if (kind === "mention") return "mentioned you";
  if (kind === "want_alert") return "matched a card you want";
  return "followed you";
}

/** Likes, replies, reposts, quotes, and mentions group per post. Follows group together. */
export function notificationGroupKey(note: Notification): string {
  if (!GROUPED_KINDS.has(note.kind)) return `${note.kind}:${note.id}`;
  if (note.kind === "follow") return "follow";
  return `${note.kind}:${note.postId ?? note.id}`;
}

export function groupHeadlineParts(
  kind: NotificationKind,
  names: string[],
): { lead: string; rest: string } {
  const action = notificationAction(kind);
  const lead = names[0]?.trim() || "Someone";
  if (names.length <= 1) return { lead, rest: ` ${action}` };
  if (names.length === 2) {
    const second = names[1]?.trim() || "Someone";
    return { lead, rest: ` and ${second} ${action}` };
  }
  return { lead, rest: ` and ${names.length - 1} others ${action}` };
}

export function groupHeadline(kind: NotificationKind, names: string[]): string {
  const parts = groupHeadlineParts(kind, names);
  return `${parts.lead}${parts.rest}`;
}

/** Same kind and target, within this long of the newest notice, and the same read state. */
const GROUP_WINDOW_MS = 24 * 60 * 60 * 1000;

function timeMs(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function byNewest(a: Notification, b: Notification) {
  const aMs = timeMs(a.createdAt);
  const bMs = timeMs(b.createdAt);
  if (aMs !== null && bMs !== null && aMs !== bMs) return bMs - aMs;
  return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
}

function actorIdsOf(notes: Notification[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const note of notes) {
    if (!note.actorId || seen.has(note.actorId)) continue;
    seen.add(note.actorId);
    ids.push(note.actorId);
  }
  return ids;
}

function bucketKey(note: Notification): string {
  return `${notificationGroupKey(note)}:${note.read ? "read" : "unread"}`;
}

function toGroup(bucket: string, notes: Notification[]): NotificationGroup {
  const newest = notes[0]!;
  return {
    key: `${bucket}:${newest.id}`,
    kind: newest.kind,
    notes,
    actorIds: actorIdsOf(notes),
    createdAt: newest.createdAt,
    postId: newest.postId,
    href: newest.href ?? null,
    preview: notes.find((note) => note.preview?.trim())?.preview ?? null,
    read: notes.every((note) => note.read),
  };
}

/** Split a newest-first list so every member is within 24 hours of that chunk's newest. */
function chunksWithinWindow(sorted: Notification[]): Notification[][] {
  const chunks: Notification[][] = [];
  let current: Notification[] = [];
  let newestMs: number | null = null;
  for (const note of sorted) {
    const ms = timeMs(note.createdAt);
    const gap = newestMs !== null && ms !== null ? newestMs - ms : Number.POSITIVE_INFINITY;
    if (current.length > 0 && gap <= GROUP_WINDOW_MS) {
      current.push(note);
      continue;
    }
    if (current.length > 0) chunks.push(current);
    current = [note];
    newestMs = ms;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Collapse similar alerts for display. Want alerts stay one row each because
 * each preview is a different card event. Likes, replies, reposts, quotes,
 * mentions, and follows share a row only when they match in kind, target, and
 * read state, and each one is within 24 hours of the newest in that row.
 * Nothing is written back to the database.
 */
export function groupNotifications(notes: Notification[]): NotificationGroup[] {
  const buckets = new Map<string, Notification[]>();
  for (const note of notes) {
    const key = bucketKey(note);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(note);
    else buckets.set(key, [note]);
  }

  const groups: NotificationGroup[] = [];
  for (const [key, bucket] of buckets) {
    const sorted = [...bucket].sort(byNewest);
    for (const chunk of chunksWithinWindow(sorted)) {
      groups.push(toGroup(key, chunk));
    }
  }

  groups.sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.key.localeCompare(a.key),
  );
  return groups;
}

/** Bell badge: one per unread row, matching the grouped list. */
export function unreadGroupCount(notes: Notification[]): number {
  return groupNotifications(notes).filter((group) => !group.read).length;
}

/** Ids to remember before the notifications page marks everything read. */
export function unreadNotificationIds(notes: Notification[]): string[] {
  return notes.filter((note) => !note.read).map((note) => note.id);
}

/**
 * Highlight a row for this visit when any of its notices were unread on open.
 * Pass null before that snapshot exists. Notices that are still unread stay highlighted too.
 */
export function groupStaysHighlighted(
  group: NotificationGroup,
  unreadOnOpen: ReadonlySet<string> | null,
): boolean {
  if (!unreadOnOpen) return !group.read;
  return group.notes.some((note) => unreadOnOpen.has(note.id) || !note.read);
}

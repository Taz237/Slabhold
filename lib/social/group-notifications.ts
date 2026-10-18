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

function byNewest(a: Notification, b: Notification) {
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

/**
 * Collapse similar alerts for display. Want alerts stay one row each because
 * each preview is a different card event. Nothing is written back to the database.
 */
export function groupNotifications(notes: Notification[]): NotificationGroup[] {
  const buckets = new Map<string, Notification[]>();
  for (const note of notes) {
    const key = notificationGroupKey(note);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(note);
    else buckets.set(key, [note]);
  }

  const groups: NotificationGroup[] = [];
  for (const [key, bucket] of buckets) {
    const sorted = [...bucket].sort(byNewest);
    const newest = sorted[0]!;
    groups.push({
      key,
      kind: newest.kind,
      notes: sorted,
      actorIds: actorIdsOf(sorted),
      createdAt: newest.createdAt,
      postId: newest.postId,
      href: newest.href ?? null,
      preview: sorted.find((note) => note.preview?.trim())?.preview ?? null,
      read: sorted.every((note) => note.read),
    });
  }

  groups.sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.key.localeCompare(a.key),
  );
  return groups;
}

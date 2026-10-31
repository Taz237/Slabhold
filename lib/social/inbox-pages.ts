import type { SupabaseClient } from "@supabase/supabase-js";
import { loadMessageRows, mapDirectMessage } from "@/lib/offers/open-to-offers";
import { applyAuthorSafety } from "@/lib/safety/filters";
import type { DirectMessage, Notification } from "./types";

/**
 * Notifications and messages, a page at a time instead of every row the
 * viewer ever got. The bell and the message badge read every UNREAD row
 * besides, so they stay exact: the bell groups those rows the same way the
 * list does ("5 people liked your post" is one).
 */
export const NOTIFICATION_PAGE_SIZE = 50;
export const MESSAGE_PAGE_SIZE = 80;
/** Unread rows read for a badge. Far past anything the bell can show. */
const UNREAD_LIMIT = 500;

export type InboxCursor = { createdAt: string; id: string };
export type InboxPage<T> = { rows: T[]; next: InboxCursor | null };

const NOTIFICATION_COLUMNS = "id, recipient_id, actor_id, kind, post_id, preview, href, metadata, read, created_at";

type Row = Record<string, unknown>;
type Query = PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;

function missingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "PGRST205" || error.code === "42P01" || /schema cache/i.test(error.message ?? "");
}

function rowsOf(result: { data: unknown; error: { code?: string; message?: string } | null }): Row[] {
  if (result.error) {
    if (missingTable(result.error)) return [];
    throw new Error(result.error.message);
  }
  return Array.isArray(result.data) ? (result.data as Row[]) : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function mapNotificationRow(row: Row): Notification {
  const metadata =
    row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : null;
  return {
    id: String(row.id),
    recipientId: String(row.recipient_id),
    actorId: text(row.actor_id),
    kind: row.kind as Notification["kind"],
    postId: text(row.post_id),
    preview: text(row.preview),
    href: text(row.href),
    metadata,
    createdAt: String(row.created_at),
    read: row.read === true,
  };
}

export function mapMessageRow(row: Row): DirectMessage {
  return mapDirectMessage({
    id: String(row.id),
    sender_id: String(row.sender_id),
    receiver_id: String(row.receiver_id),
    content: typeof row.content === "string" ? row.content : "",
    created_at: String(row.created_at),
    read: row.read === true,
    kind: typeof row.kind === "string" ? row.kind : null,
    card_preview: row.card_preview,
  });
}

function quoted(value: string) {
  return `"${value}"`;
}

/** Rows strictly after the cursor, newest first: older, or same time with a lower id. */
export function inboxCursorFilter(cursor: InboxCursor): string {
  const ts = quoted(cursor.createdAt);
  return `created_at.lt.${ts},and(created_at.eq.${ts},id.lt.${quoted(cursor.id)})`;
}

function pageOf<T extends { id: string; createdAt: string }>(rows: T[], size: number): InboxPage<T> {
  const shown = rows.slice(0, size);
  const last = shown[shown.length - 1];
  return { rows: shown, next: rows.length > size && last ? { createdAt: last.createdAt, id: last.id } : null };
}

/** The viewer's notifications, newest first. Muted actors stay out. */
export async function loadNotificationPage(
  supabase: SupabaseClient,
  viewerId: string,
  input: { cursor: InboxCursor | null; mutedHidden: readonly string[] },
): Promise<InboxPage<Notification>> {
  let query = supabase
    .from("notifications")
    .select(NOTIFICATION_COLUMNS)
    .eq("recipient_id", viewerId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(NOTIFICATION_PAGE_SIZE + 1);
  if (input.cursor) query = query.or(inboxCursorFilter(input.cursor));
  const guarded = applyAuthorSafety(query, viewerId, input.mutedHidden, {
    authorColumn: "actor_id",
    mute: true,
    keepNullAuthor: true,
  });
  return pageOf(rowsOf(await (guarded as Query)).map(mapNotificationRow), NOTIFICATION_PAGE_SIZE);
}

/** Every unread notification, for the bell. */
export async function loadUnreadNotifications(
  supabase: SupabaseClient,
  viewerId: string,
  mutedHidden: readonly string[],
): Promise<Notification[]> {
  const query = supabase
    .from("notifications")
    .select(NOTIFICATION_COLUMNS)
    .eq("recipient_id", viewerId)
    .eq("read", false)
    .order("created_at", { ascending: false })
    .limit(UNREAD_LIMIT);
  const guarded = applyAuthorSafety(query, viewerId, mutedHidden, {
    authorColumn: "actor_id",
    mute: true,
    keepNullAuthor: true,
  });
  return rowsOf(await (guarded as Query)).map(mapNotificationRow);
}

function guardMessages<Q>(query: Q, viewerId: string, blockedHidden: readonly string[]): Q {
  const sent = applyAuthorSafety(query as never, viewerId, blockedHidden, { authorColumn: "sender_id" });
  return applyAuthorSafety(sent as never, viewerId, blockedHidden, { authorColumn: "receiver_id" }) as Q;
}

/**
 * The newest messages the viewer sent or got, or one thread with `partnerId`.
 * The page is read newest first and listed oldest first, like a thread.
 */
export async function loadMessagePage(
  supabase: SupabaseClient,
  viewerId: string,
  input: { cursor: InboxCursor | null; blockedHidden: readonly string[]; partnerId?: string | null },
): Promise<InboxPage<DirectMessage>> {
  const partner = input.partnerId ?? null;
  const result = await loadMessageRows((columns) => {
    let query = supabase
      .from("messages")
      .select(columns)
      .or(
        partner
          ? `and(sender_id.eq.${viewerId},receiver_id.eq.${partner}),and(sender_id.eq.${partner},receiver_id.eq.${viewerId})`
          : `sender_id.eq.${viewerId},receiver_id.eq.${viewerId}`,
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE + 1);
    if (input.cursor) query = query.or(inboxCursorFilter(input.cursor));
    return guardMessages(query, viewerId, input.blockedHidden);
  });
  const page = pageOf(rowsOf(result).map(mapMessageRow), MESSAGE_PAGE_SIZE);
  return { rows: [...page.rows].reverse(), next: page.next };
}

/** Every unread message the viewer got, for the message badge. Oldest first. */
export async function loadUnreadMessages(
  supabase: SupabaseClient,
  viewerId: string,
  blockedHidden: readonly string[],
): Promise<DirectMessage[]> {
  const result = await loadMessageRows((columns) =>
    guardMessages(
      supabase
        .from("messages")
        .select(columns)
        .eq("receiver_id", viewerId)
        .eq("read", false)
        .order("created_at", { ascending: true })
        .limit(UNREAD_LIMIT),
      viewerId,
      blockedHidden,
    ),
  );
  return rowsOf(result).map(mapMessageRow);
}

type Dated = { id: string; createdAt: string };

function sortRows<T extends Dated>(rows: T[], order: "newest" | "oldest"): T[] {
  const sign = order === "newest" ? -1 : 1;
  return rows.sort((a, b) => sign * (a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)));
}

/** Adds or replaces rows by id. */
export function mergeById<T extends Dated>(existing: readonly T[], incoming: readonly T[], order: "newest" | "oldest"): T[] {
  const byId = new Map(existing.map((row) => [row.id, row]));
  for (const row of incoming) byId.set(row.id, row);
  return sortRows([...byId.values()], order);
}

/**
 * Lays a fresh newest page over what is loaded. Rows the page's time window
 * covers but the page no longer has were deleted, so they go; older pages
 * stay. A `complete` page is everything there is (within `within`).
 */
export function mergeNewestPage<T extends Dated>(
  existing: readonly T[],
  page: readonly T[],
  options: { complete: boolean; order: "newest" | "oldest"; within?: (row: T) => boolean },
): T[] {
  const within = options.within ?? (() => true);
  const fresh = new Set(page.map((row) => row.id));
  const oldest = page.reduce<string | null>(
    (min, row) => (min === null || row.createdAt < min ? row.createdAt : min),
    null,
  );
  const kept = existing.filter((row) => {
    if (fresh.has(row.id) || !within(row)) return true;
    if (options.complete) return false;
    return oldest !== null && row.createdAt < oldest;
  });
  return mergeById(kept, page, options.order);
}

/**
 * `unread` is every unread row the viewer has. Any of the viewer's rows not
 * in it has been read (here or on another device), and any in it is shown.
 */
export function settleUnread<T extends Dated & { read: boolean }>(
  rows: readonly T[],
  unread: readonly T[],
  mine: (row: T) => boolean,
): T[] {
  const ids = new Set(unread.map((row) => row.id));
  return rows.map((row) => (mine(row) && !row.read && !ids.has(row.id) ? { ...row, read: true } : row));
}

export type InboxRefresh = {
  notifications?: { rows: Notification[]; complete: boolean; unread: Notification[] };
  messages?: { rows: DirectMessage[]; complete: boolean; unread: DirectMessage[] };
};

/**
 * A fresh newest page and unread set (from realtime or a refresh) laid over
 * what is loaded: older pages stay, deleted rows in the page's window go,
 * unread rows anywhere come in, and anything no longer unread reads as read.
 */
export function applyInboxRefresh<
  S extends { user: { id: string } | null; notifications: Notification[]; messages: DirectMessage[] },
>(existing: S, refresh: InboxRefresh): S {
  const viewerId = existing.user?.id ?? null;
  let next = existing;
  if (refresh.notifications) {
    const { rows, complete, unread } = refresh.notifications;
    const paged = mergeNewestPage(existing.notifications, rows, { complete, order: "newest" });
    next = {
      ...next,
      notifications: settleUnread(
        mergeById(paged, unread, "newest"),
        unread,
        (note) => note.recipientId === viewerId,
      ),
    };
  }
  if (refresh.messages) {
    const { rows, complete, unread } = refresh.messages;
    const paged = mergeNewestPage(existing.messages, rows, { complete, order: "oldest" });
    next = {
      ...next,
      messages: settleUnread(
        mergeById(paged, unread, "oldest"),
        unread,
        (message) => message.receiverId === viewerId,
      ),
    };
  }
  return next;
}

/**
 * Where each list's Load more continues from. Null: nothing older. A thread
 * missing from `threads` hasn't been read on its own yet.
 */
export type InboxCursors = {
  viewerId: string | null;
  notifications: InboxCursor | null;
  messages: InboxCursor | null;
  /** Set once the viewer loaded an older page, so a refresh keeps their place. */
  advanced: { notifications: boolean; messages: boolean };
  threads: Record<string, InboxCursor | null>;
};

export function emptyInboxCursors(): InboxCursors {
  return {
    viewerId: null,
    notifications: null,
    messages: null,
    advanced: { notifications: false, messages: false },
    threads: {},
  };
}

/** Cursors after a snapshot read: its own, unless the viewer already paged further. */
export function cursorsAfterRefresh(
  current: InboxCursors,
  inbox: { notifications: { next: InboxCursor | null }; messages: { next: InboxCursor | null } } | undefined,
  viewerId: string | null,
): InboxCursors {
  if (!inbox || !viewerId) return emptyInboxCursors();
  const same = current.viewerId === viewerId;
  const base = same ? current : { ...emptyInboxCursors(), viewerId };
  return {
    ...base,
    viewerId,
    notifications: same && base.advanced.notifications ? base.notifications : inbox.notifications.next,
    messages: same && base.advanced.messages ? base.messages : inbox.messages.next,
  };
}

/**
 * A full snapshot read over the current one: its newest pages and unread rows
 * win, older pages the same viewer already loaded stay. Another viewer, or a
 * snapshot without inbox pages, replaces everything as before.
 */
export function keepLoadedInbox<
  S extends {
    user: { id: string } | null;
    notifications: Notification[];
    messages: DirectMessage[];
    inbox?: {
      notifications: { rows: Notification[]; next: InboxCursor | null };
      unreadNotifications: Notification[];
      messages: { rows: DirectMessage[]; next: InboxCursor | null };
      unreadMessages: DirectMessage[];
    };
  },
>(existing: Pick<S, "user" | "notifications" | "messages">, next: S): S {
  const inbox = next.inbox;
  if (!inbox || !next.user || existing.user?.id !== next.user.id) return next;
  const merged = applyInboxRefresh(
    { user: next.user, notifications: existing.notifications, messages: existing.messages },
    {
      notifications: { rows: inbox.notifications.rows, complete: !inbox.notifications.next, unread: inbox.unreadNotifications },
      messages: { rows: inbox.messages.rows, complete: !inbox.messages.next, unread: inbox.unreadMessages },
    },
  );
  return { ...next, notifications: merged.notifications, messages: merged.messages };
}

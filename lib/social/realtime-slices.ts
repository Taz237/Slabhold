import type { SupabaseClient } from "@supabase/supabase-js";
import { loadMessageRows, mapDirectMessage } from "@/lib/offers/open-to-offers";
import { applyAuthorSafety, loadHiddenAuthorIds } from "@/lib/safety/filters";
import { isUuid } from "@/lib/value/card-value-access";
import { MESSAGE_PAGE_SIZE } from "./remote";
import type { RealtimePatch, RealtimeSlice } from "./realtime-sync";
import { NOTIFICATION_PAGE_SIZE } from "./scoped-reads";
import type { DirectMessage, Notification, PostComment, PostRepost } from "./types";

type Row = Record<string, unknown>;

function missingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "PGRST205" || error.code === "42P01" || /schema cache/i.test(error.message ?? "");
}

async function rowsOf(
  query: PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>,
): Promise<Row[]> {
  const { data, error } = await query;
  if (error) {
    if (missingTable(error)) return [];
    throw new Error(error.message);
  }
  return Array.isArray(data) ? (data as Row[]) : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function mapNotification(row: Row): Notification {
  const metadata =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : null;
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

function mapMessage(row: Row): DirectMessage {
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

function mapComment(row: Row): PostComment {
  return {
    id: String(row.id),
    postId: String(row.post_id),
    authorId: String(row.user_id),
    body: String(row.body ?? ""),
    createdAt: String(row.created_at),
  };
}

function mapRepost(row: Row): PostRepost {
  return {
    postId: String(row.post_id),
    userId: String(row.user_id),
    createdAt: String(row.created_at),
  };
}

/**
 * Refetch only the tables a realtime event named.
 * Never selects public_cards, posts, profiles, or follows.
 */
export async function loadRealtimePatch(
  supabase: SupabaseClient,
  slices: ReadonlySet<RealtimeSlice>,
  input: { viewerId: string | null; postId: string | null },
): Promise<RealtimePatch> {
  const viewerId = input.viewerId && isUuid(input.viewerId) ? input.viewerId : null;
  const postId = input.postId && isUuid(input.postId) ? input.postId : null;
  const notes = slices.has("notifications") && Boolean(viewerId);
  const messages = slices.has("messages") && Boolean(viewerId);
  const comments = slices.has("comments") && Boolean(postId);
  const reposts = slices.has("reposts") && Boolean(postId);
  if (!notes && !messages && !comments && !reposts) return {};

  const [mutedHidden, blockedHidden] = await Promise.all([
    (notes || comments) && viewerId
      ? loadHiddenAuthorIds(supabase, true)
      : Promise.resolve([] as string[]),
    (messages || reposts) && viewerId
      ? loadHiddenAuthorIds(supabase, false)
      : Promise.resolve([] as string[]),
  ]);

  const patch: RealtimePatch = {};
  if (postId && (comments || reposts)) patch.postId = postId;

  const tasks: Promise<void>[] = [];
  if (notes && viewerId) {
    tasks.push(
      rowsOf(
        applyAuthorSafety(
          supabase
            .from("notifications")
            .select(
              "id, recipient_id, actor_id, kind, post_id, preview, href, metadata, read, created_at",
            )
            .eq("recipient_id", viewerId)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(NOTIFICATION_PAGE_SIZE),
          viewerId,
          mutedHidden,
          { authorColumn: "actor_id", mute: true, keepNullAuthor: true },
        ),
      ).then((rows) => {
        patch.notifications = rows.map(mapNotification);
      }),
    );
  }
  if (messages && viewerId) {
    tasks.push(
      (async () => {
        const run = (columns: string) =>
          applyAuthorSafety(
            applyAuthorSafety(
              supabase
                .from("messages")
                .select(columns)
                .or(`sender_id.eq.${viewerId},receiver_id.eq.${viewerId}`)
                .order("created_at", { ascending: false })
                .order("id", { ascending: false })
                .limit(MESSAGE_PAGE_SIZE),
              viewerId,
              blockedHidden,
              { authorColumn: "sender_id" },
            ),
            viewerId,
            blockedHidden,
            { authorColumn: "receiver_id" },
          );
        const result = await loadMessageRows(run);
        if (result.error) {
          if (missingTable(result.error)) {
            patch.messages = [];
            return;
          }
          throw new Error(result.error.message);
        }
        const rows = Array.isArray(result.data) ? (result.data as unknown as Row[]) : [];
        patch.messages = rows.map(mapMessage);
      })(),
    );
  }
  if (comments && postId) {
    tasks.push(
      rowsOf(
        applyAuthorSafety(
          supabase
            .from("comments")
            .select("id, post_id, user_id, body, created_at")
            .eq("post_id", postId)
            .order("created_at", { ascending: true }),
          viewerId,
          mutedHidden,
          { mute: true },
        ),
      ).then((rows) => {
        patch.comments = rows.map(mapComment);
      }),
    );
  }
  if (reposts && postId) {
    tasks.push(
      rowsOf(
        applyAuthorSafety(
          supabase.from("reposts").select("user_id, post_id, created_at").eq("post_id", postId),
          viewerId,
          blockedHidden,
        ),
      ).then((rows) => {
        patch.reposts = rows.map(mapRepost);
      }),
    );
  }

  await Promise.all(tasks);
  return patch;
}

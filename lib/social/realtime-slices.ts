import type { SupabaseClient } from "@supabase/supabase-js";
import { applyAuthorSafety, loadHiddenAuthorIds } from "@/lib/safety/filters";
import { isUuid } from "@/lib/value/card-value-access";
import type { RealtimePatch, RealtimeSlice } from "./realtime-sync";
import {
  COMMENT_COLUMNS_WITH_IMAGES,
  noteReplyImagesMissing,
  replyImageColumnMissing,
  replyImagesFromValue,
} from "./reply-images";
import {
  loadMessagePage,
  loadNotificationPage,
  loadUnreadMessages,
  loadUnreadNotifications,
} from "./inbox-pages";
import type { PostComment, PostRepost } from "./types";

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

function mapComment(row: Row): PostComment {
  const images = replyImagesFromValue(row.image_urls);
  return {
    id: String(row.id),
    postId: String(row.post_id),
    authorId: String(row.user_id),
    body: String(row.body ?? ""),
    ...(images.length ? { images } : {}),
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
 * Refetch only the tables a realtime event named. Notifications and messages
 * read their newest page and unread rows only; older pages stay as loaded.
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
      Promise.all([
        loadNotificationPage(supabase, viewerId, { cursor: null, mutedHidden }),
        loadUnreadNotifications(supabase, viewerId, mutedHidden),
      ]).then(([page, unread]) => {
        patch.inbox = { ...patch.inbox, notifications: { rows: page.rows, complete: !page.next, unread } };
      }),
    );
  }
  if (messages && viewerId) {
    tasks.push(
      Promise.all([
        loadMessagePage(supabase, viewerId, { cursor: null, blockedHidden }),
        loadUnreadMessages(supabase, viewerId, blockedHidden),
      ]).then(([page, unread]) => {
        patch.inbox = { ...patch.inbox, messages: { rows: page.rows, complete: !page.next, unread } };
      }),
    );
  }
  if (comments && postId) {
    tasks.push(
      (async () => {
        const load = (columns: string) =>
          applyAuthorSafety(
            supabase
              .from("comments")
              .select(columns)
              .eq("post_id", postId)
              .order("created_at", { ascending: true }),
            viewerId,
            mutedHidden,
            { mute: true },
          );
        try {
          patch.comments = (await rowsOf(load(COMMENT_COLUMNS_WITH_IMAGES))).map(mapComment);
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (!replyImageColumnMissing({ message })) throw error;
          noteReplyImagesMissing();
          patch.comments = (await rowsOf(load("id, post_id, user_id, body, created_at"))).map(mapComment);
        }
      })(),
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

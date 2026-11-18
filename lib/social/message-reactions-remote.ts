import type { SupabaseClient } from "@supabase/supabase-js";
import { mapReactionRow, type MessageReaction, type ReactionEmoji } from "./message-reactions";

const TABLE = "message_reactions";
/** Ids per read, so the URL stays short. A thread page is 80. */
const CHUNK = 100;

const SAVE_FAILED = "Couldn't react to that message.";

type Failure = { code?: string; message?: string } | null | undefined;

/** The table isn't there yet (the migration hasn't run). */
export function reactionsMissing(error: Failure): boolean {
  if (!error) return false;
  return error.code === "PGRST205" || error.code === "42P01" || /schema cache|could not find the table/i.test(error.message ?? "");
}

/** Reactions on these messages. RLS returns only the viewer's own conversations. */
export async function loadReactions(
  client: SupabaseClient,
  messageIds: readonly string[],
): Promise<{ rows: MessageReaction[]; missing: boolean }> {
  const chunks: string[][] = [];
  for (let start = 0; start < messageIds.length; start += CHUNK) chunks.push(messageIds.slice(start, start + CHUNK));
  const results = await Promise.all(
    chunks.map((ids) => client.from(TABLE).select("message_id, user_id, emoji, created_at").in("message_id", ids)),
  );
  const rows: MessageReaction[] = [];
  for (const result of results) {
    if (result.error) {
      if (reactionsMissing(result.error)) return { rows: [], missing: true };
      throw new Error(result.error.message);
    }
    for (const raw of (result.data ?? []) as Record<string, unknown>[]) {
      const reaction = mapReactionRow(raw);
      if (reaction) rows.push(reaction);
    }
  }
  return { rows, missing: false };
}

/** Set the viewer's reaction, or clear it with null. */
export async function saveReaction(
  client: SupabaseClient,
  change: { messageId: string; userId: string; emoji: ReactionEmoji | null },
): Promise<{ error?: string; missing?: boolean }> {
  const result = change.emoji
    ? await client
        .from(TABLE)
        .upsert({ message_id: change.messageId, user_id: change.userId, emoji: change.emoji }, { onConflict: "message_id,user_id" })
    : await client.from(TABLE).delete().eq("message_id", change.messageId).eq("user_id", change.userId);
  if (!result.error) return {};
  if (reactionsMissing(result.error)) return { error: SAVE_FAILED, missing: true };
  return { error: SAVE_FAILED };
}

/**
 * The message a live event is about. Inserts and updates carry the row; a
 * delete carries the key columns (message_id, user_id), so it names it too.
 */
export function reactionEventMessageId(payload: { new?: Record<string, unknown> | null; old?: Record<string, unknown> | null }): string | null {
  const id = payload.new?.message_id ?? payload.old?.message_id;
  return typeof id === "string" ? id : null;
}

/**
 * A fresh read replaces the reactions on the messages it read. Messages the
 * viewer is saving keep their optimistic state until the save lands.
 */
export function mergeLoaded(
  prev: readonly MessageReaction[],
  rows: readonly MessageReaction[],
  scope: { read: ReadonlySet<string>; saving: ReadonlySet<string> },
): MessageReaction[] {
  const replace = (id: string) => scope.read.has(id) && !scope.saving.has(id);
  return [
    ...prev.filter((item) => !replace(item.messageId)),
    ...rows.filter((item) => replace(item.messageId)),
  ];
}

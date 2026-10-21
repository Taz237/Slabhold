import type { SupabaseClient } from "@supabase/supabase-js";
import { canNotify, supabaseSafety } from "@/lib/safety/can-notify";
import { mentionUsernames } from "./mentions";

/** First unique @handles that create a mention notification. */
export const MENTION_NOTIFY_LIMIT = 10;

/** Stored on notifications.metadata. The column already exists. */
export const REPLY_MENTION_METADATA = { source: "reply" } as const;

export function isReplyMentionMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  return (metadata as { source?: unknown }).source === REPLY_MENTION_METADATA.source;
}

export function mentionsToNotify(body: string): string[] {
  return mentionUsernames(body).slice(0, MENTION_NOTIFY_LIMIT);
}

export type ReplyMentionProfile = {
  id: string;
  username: string;
};

/**
 * Existing users @mentioned in a reply.
 * The same handle twice counts once. The author is omitted.
 * `skipRecipientId` is the post author when they already get the reply
 * notification for this comment, so they are not notified twice.
 * Unknown handles never appear here.
 */
export function replyMentionCandidates(input: {
  actorId: string;
  body: string;
  profiles: ReplyMentionProfile[];
  skipRecipientId?: string | null;
}): string[] {
  const wanted = mentionsToNotify(input.body);
  if (wanted.length === 0) return [];
  const byName = new Map<string, string>();
  for (const profile of input.profiles) {
    const username = profile.username.trim().toLowerCase();
    if (!username || !profile.id || byName.has(username)) continue;
    byName.set(username, profile.id);
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const username of wanted) {
    const id = byName.get(username);
    if (!id || id === input.actorId) continue;
    if (input.skipRecipientId && id === input.skipRecipientId) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function missingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "PGRST205" || error.code === "42P01" || /schema cache/i.test(error.message ?? "");
}

function previewText(value: string) {
  const text = value.trim();
  if (!text) return null;
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

/**
 * Block and mute use canNotify. Self is skipped before can_interact:
 * that RPC is false for the same id, which is not a block.
 */
export async function allowReplyMention(
  supabase: SupabaseClient,
  actorId: string,
  recipientId: string,
): Promise<boolean> {
  if (!recipientId || actorId === recipientId) return false;
  const safety = supabaseSafety(supabase);
  return canNotify(
    {
      isBlocked: (actor, other) => safety.isBlocked(actor, other),
      async isMuted(actor, recipient) {
        if (!recipient || actor === recipient) return false;
        const { data, error } = await supabase
          .from("mutes")
          .select("muter_id")
          .eq("muter_id", recipient)
          .eq("muted_id", actor)
          .limit(1);
        // Authors only see mutes they created. When this row is hidden, the
        // notifications read policy still drops it for a recipient who muted them.
        if (error || !data) return false;
        return data.length > 0;
      },
    },
    actorId,
    recipientId,
  );
}

/**
 * Insert one `mention` row per recipient, same shape as a post mention.
 * Failures are swallowed. Callers must not roll back the reply.
 */
export async function notifyReplyMentions(
  supabase: SupabaseClient,
  input: {
    actorId: string;
    postId: string;
    body: string;
    skipRecipientId?: string | null;
  },
): Promise<void> {
  const handles = mentionsToNotify(input.body);
  if (handles.length === 0) return;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username")
      .in("username", handles);
    if (error || !data) return;
    const recipients = replyMentionCandidates({
      actorId: input.actorId,
      body: input.body,
      profiles: data as ReplyMentionProfile[],
      skipRecipientId: input.skipRecipientId,
    });
    const preview = previewText(input.body);
    for (const recipientId of recipients) {
      try {
        if (!(await allowReplyMention(supabase, input.actorId, recipientId))) continue;
        const { error: insertError } = await supabase.from("notifications").insert({
          recipient_id: recipientId,
          actor_id: input.actorId,
          kind: "mention",
          post_id: input.postId,
          preview,
          metadata: REPLY_MENTION_METADATA,
        });
        if (insertError && insertError.code !== "23505" && !missingTable(insertError)) {
          continue;
        }
      } catch {
        continue;
      }
    }
  } catch {
    return;
  }
}

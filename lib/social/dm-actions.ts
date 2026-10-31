import type { SupabaseClient } from "@supabase/supabase-js";
import { BLOCKED_INTERACTION } from "@/lib/safety/block";
import { supabaseSafety } from "@/lib/safety/can-notify";
import { offerSendError, offersColumnMissing, parseCardPreview } from "@/lib/offers/open-to-offers";
import type { LocalDb } from "./local-db";
import type { AuthResult, CardMessagePreview, DirectMessage } from "./types";
import { MESSAGE_LIMIT } from "./types";

/**
 * Sending and reading direct messages. The social provider loads this on
 * first use (or the first idle moment), so it stays out of every page's
 * first-load JS.
 */

export { offerSendError, parseCardPreview };

/** Same as remote.ts: shown when a social table or constraint is missing. */
const SETUP_FAILED = "Something went wrong on our side. Please try again.";

function missingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "PGRST205" || error.code === "42P01" || /schema cache/i.test(error.message ?? "");
}

function rlsBlocked(error: { message?: string } | null) {
  return /row-level security|violates row-level/i.test(error?.message ?? "");
}

export async function remoteSendMessage(
  supabase: SupabaseClient,
  senderId: string,
  receiverId: string,
  content: string,
  preview?: CardMessagePreview | null,
): Promise<AuthResult> {
  const text = content.trim().slice(0, MESSAGE_LIMIT);
  const cardPreview = preview ? parseCardPreview(preview) : null;
  if (!text && !cardPreview) return { error: "Write a message." };
  const muted = cardPreview ? await senderMuted(supabase, senderId, receiverId) : false;
  const blocked = await supabaseSafety(supabase).isBlocked(senderId, receiverId);
  const refused = offerSendError({
    senderId,
    receiverId,
    blocked,
    muted,
    preview: cardPreview,
  });
  if (refused) return { error: refused };
  const row: Record<string, unknown> = {
    sender_id: senderId,
    receiver_id: receiverId,
    content: text,
  };
  if (cardPreview) {
    row.kind = "card_preview";
    row.card_preview = { cardId: cardPreview.cardId };
  }
  const { error } = await supabase.from("messages").insert(row);
  if (error) {
    if (missingTable(error)) return { error: SETUP_FAILED };
    if (cardPreview && offersColumnMissing(error)) {
      return { error: "Card previews aren't available yet." };
    }
    return { error: rlsBlocked(error) ? BLOCKED_INTERACTION : error.message };
  }
  return {};
}

async function senderMuted(
  supabase: SupabaseClient,
  senderId: string,
  receiverId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("mutes")
    .select("muted_id")
    .eq("muter_id", senderId)
    .eq("muted_id", receiverId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

export async function remoteMarkThreadRead(
  supabase: SupabaseClient,
  userId: string,
  partnerId: string,
): Promise<AuthResult> {
  const { error } = await supabase
    .from("messages")
    .update({ read: true })
    .eq("receiver_id", userId)
    .eq("sender_id", partnerId)
    .eq("read", false);
  if (error && !missingTable(error)) return { error: error.message };
  return {};
}

export function localSendMessage(
  db: LocalDb,
  receiverId: string,
  content: string,
  preview?: CardMessagePreview | null,
): { db: LocalDb; error?: string } {
  if (!db.sessionUserId) return { db, error: "Log in to send a message." };
  const text = content.trim().slice(0, MESSAGE_LIMIT);
  const cardPreview = preview ? parseCardPreview(preview) : null;
  const refused = offerSendError({
    senderId: db.sessionUserId,
    receiverId,
    blocked: false,
    muted: false,
    preview: cardPreview,
  });
  if (refused) return { db, error: refused };
  if (!text && !cardPreview) return { db, error: "Write a message." };
  if (!db.users.some((user) => user.id === receiverId)) return { db, error: "That collector is gone." };
  const message: DirectMessage = {
    id: `msg-${Date.now().toString(36)}`,
    senderId: db.sessionUserId,
    receiverId,
    content: text,
    createdAt: new Date().toISOString(),
    read: false,
    kind: cardPreview ? "card_preview" : "text",
    cardPreview: cardPreview ? { cardId: cardPreview.cardId } : null,
  };
  return { db: { ...db, messages: [...(db.messages ?? []), message] } };
}

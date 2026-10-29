import type { SupabaseClient } from "@supabase/supabase-js";
import { rpcMissing } from "@/lib/social/collect-interests";

/**
 * - mutual: the link had the inviter's code, so you follow each other.
 * - following: you follow the inviter, with no follow-back (no code, a wrong
 *   code, or the inviter's daily cap).
 * - skipped: the RPC did nothing (an old account, a block, a repeat invite).
 * - missing: the RPC isn't installed yet. Offer a plain Follow instead.
 * - failed: anything else. Stay quiet; the invite is not retried.
 */
export type AcceptInviteResult = "mutual" | "following" | "skipped" | "missing" | "failed";

/** Follow the inviter, and they follow back when the code is theirs. Never throws. */
export async function acceptInvite(
  supabase: SupabaseClient | null,
  username: string,
  code: string | null,
): Promise<AcceptInviteResult> {
  if (!supabase) return "missing";
  try {
    const { data, error } = await supabase.rpc("accept_invite", { inviter_username: username, code });
    if (!error) return data === "mutual" || data === "following" ? data : "skipped";
    return rpcMissing(error) ? "missing" : "failed";
  } catch {
    return "failed";
  }
}

/**
 * What setup shows after the invite is handled:
 * - mutual: "You're following <name>, and they follow you back", with Undo.
 * - following: "You're following <name>", with Undo.
 * - prompt: the RPC isn't there (local dev, or not migrated). A plain "Follow <name>".
 * - none: it failed, or the RPC skipped (a block, an earlier invite). Say nothing.
 */
export type InviteOutcome = "mutual" | "following" | "prompt" | "none";

export function inviteOutcome(result: AcceptInviteResult, followsInviter: boolean): InviteOutcome {
  if (result === "missing") return followsInviter ? "none" : "prompt";
  if (result === "mutual" || result === "following") return followsInviter ? result : "none";
  return "none";
}

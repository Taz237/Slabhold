import type { SupabaseClient } from "@supabase/supabase-js";
import { rpcMissing } from "@/lib/social/collect-interests";

/**
 * - accepted: the RPC ran. It may still have skipped (a block, a repeat invite),
 *   so the caller checks the follow before saying anything.
 * - missing: the RPC isn't installed yet. Offer a plain Follow instead.
 * - failed: anything else. Stay quiet; the invite is not retried.
 */
export type AcceptInviteResult = "accepted" | "missing" | "failed";

/** Follow each other with the inviter. Never throws. */
export async function acceptInvite(supabase: SupabaseClient | null, username: string): Promise<AcceptInviteResult> {
  if (!supabase) return "missing";
  try {
    const { error } = await supabase.rpc("accept_invite", { inviter_username: username });
    if (!error) return "accepted";
    return rpcMissing(error) ? "missing" : "failed";
  } catch {
    return "failed";
  }
}

/**
 * What setup shows after the invite is handled:
 * - following: "You're following <name>, and they follow you back", with Undo.
 * - prompt: the RPC isn't there (local dev, or not migrated). A plain "Follow <name>".
 * - none: it failed, or the RPC skipped (a block, an earlier invite). Say nothing.
 */
export type InviteOutcome = "following" | "prompt" | "none";

export function inviteOutcome(result: AcceptInviteResult, followsInviter: boolean): InviteOutcome {
  if (result === "missing") return followsInviter ? "none" : "prompt";
  if (result === "accepted") return followsInviter ? "following" : "none";
  return "none";
}

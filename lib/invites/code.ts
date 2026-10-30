import type { SupabaseClient } from "@supabase/supabase-js";
import { rpcMissing } from "@/lib/social/collect-interests";

/** The query param on invite links: /i/<username>?c=<code>. */
export const INVITE_CODE_PARAM = "c";

const CODE = /^[0-9a-f]{32}$/;

/** A well-formed invite code, or null. The server still checks it belongs to the inviter. */
export function inviteCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase();
  return CODE.test(code) ? code : null;
}

/**
 * The signed-in user's own invite code (public.my_invite_code makes one on
 * first use). Null when signed out, in local mode, before the migration runs,
 * or on any error. Never throws.
 */
export async function fetchInviteCode(supabase: SupabaseClient | null): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("my_invite_code");
    return error ? null : inviteCode(data);
  } catch {
    return null;
  }
}

/** What a reset did. "limit": 3 resets in the last 24 hours already. */
export type ResetInviteResult =
  | { kind: "ok"; code: string }
  | { kind: "limit" }
  | { kind: "missing" }
  | { kind: "failed" };

/**
 * A new invite code for the signed-in user (public.reset_invite_code). The old
 * code stops working at once. Never throws.
 */
export async function resetInviteCode(supabase: SupabaseClient | null): Promise<ResetInviteResult> {
  if (!supabase) return { kind: "missing" };
  try {
    const { data, error } = await supabase.rpc("reset_invite_code");
    if (error) {
      if (/invite_reset_limit/.test(error.message ?? "")) return { kind: "limit" };
      return rpcMissing(error) ? { kind: "missing" } : { kind: "failed" };
    }
    const code = inviteCode(data);
    return code ? { kind: "ok", code } : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}

/** What Settings says after "Get a new link". */
export function resetNotice(result: ResetInviteResult): string {
  switch (result.kind) {
    case "ok":
      return "New link ready. Your old link no longer works.";
    case "limit":
      return "You can get a new link 3 times a day. Try again tomorrow.";
    case "missing":
      return "New links aren't available yet.";
    default:
      return "Couldn't get a new link. Try again.";
  }
}

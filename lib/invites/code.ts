import type { SupabaseClient } from "@supabase/supabase-js";

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

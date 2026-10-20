export const PASSWORD_RESET_SENT =
  "If that email has an account, we sent a reset link.";

/** Supabase redirectTo. The query is left unencoded so the allow list can match it. */
export function passwordResetRedirect(origin: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/auth/callback?next=/reset-password`;
}

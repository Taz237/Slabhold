import { safeNext } from "@/lib/auth/safe-next";

export const PASSWORD_RESET_SENT =
  "If that email has an account, we sent a reset link.";

export const PASSWORD_RESET_EXPIRED = "That link expired. Send a new one.";

export const PASSWORD_RESET_FAILED = "Couldn't send the reset link. Try again.";

/** Supabase redirectTo. The query is left unencoded so the allow list can match it. */
export function passwordResetRedirect(origin: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/auth/callback?next=/reset-password`;
}

/**
 * Where a failed confirm lands. Recovery links go back to the request form.
 * Signup confirms still return to log in.
 */
export function authConfirmFailurePath(input: {
  pathname: string;
  next: string | null;
  type: string | null;
}): string {
  const pathname =
    input.pathname.length > 1 && input.pathname.endsWith("/")
      ? input.pathname.slice(0, -1)
      : input.pathname;
  const nextPath = safeNext(input.next).split("?")[0] ?? "/";
  const recovery =
    pathname === "/auth/callback" || input.type === "recovery" || nextPath === "/reset-password";
  if (recovery) return "/forgot-password?expired=1";
  return `/login?next=${encodeURIComponent(safeNext(input.next))}`;
}

type PasswordResetError = {
  message?: string;
  status?: number;
  code?: string | null;
} | null;

function isRateLimited(error: { message?: string; status?: number; code?: string | null }): boolean {
  if (error.status === 429) return true;
  const code = error.code?.toLowerCase() ?? "";
  if (code.includes("rate_limit")) return true;
  const message = error.message?.toLowerCase() ?? "";
  return (
    message.includes("rate limit") ||
    message.includes("too many") ||
    message.includes("only request this after")
  );
}

/**
 * Null means the send can show the public success copy.
 * A rate limit uses that same copy so the response does not reveal whether
 * the email has an account. The provider message is never returned.
 */
export function passwordResetSendError(error: PasswordResetError): string | null {
  if (!error) return null;
  if (isRateLimited(error)) return null;
  return PASSWORD_RESET_FAILED;
}

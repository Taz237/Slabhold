import { captchaRetryMessage } from "@/lib/auth/captcha";
import { safeNext } from "@/lib/auth/safe-next";

export const PASSWORD_RESET_SENT =
  "If that email has an account, we sent a reset link.";

export const PASSWORD_RESET_EXPIRED = "That link expired. Send a new one.";

export const PASSWORD_RESET_FAILED = "Couldn't send the reset link. Try again.";

/** A real send failure. Does not say whether the address has an account. */
export const PASSWORD_RESET_UNAVAILABLE =
  "We couldn't send that right now. Please try again in a bit.";

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

/** An unknown address stays on the neutral sent sentence. */
function isUnknownAccount(error: { message?: string; code?: string | null }): boolean {
  const code = error.code?.toLowerCase() ?? "";
  if (code === "user_not_found" || code === "email_not_found") return true;
  const message = error.message?.toLowerCase() ?? "";
  return (
    message.includes("user not found") ||
    message.includes("no user found") ||
    message.includes("email not found")
  );
}

/** Rate limit, SMTP, or another failure while the message was going out. */
function isSendFailure(error: { message?: string; status?: number; code?: string | null }): boolean {
  if (isRateLimited(error)) return true;
  if ((error.status ?? 0) >= 500) return true;
  const code = error.code?.toLowerCase() ?? "";
  if (code === "unexpected_failure" || code.includes("smtp")) return true;
  const message = error.message?.toLowerCase() ?? "";
  return (
    message.includes("smtp") ||
    message.includes("error sending") ||
    message.includes("unable to send") ||
    message.includes("could not send") ||
    message.includes("failed to send")
  );
}

export function passwordResetEmailOptions(origin: string, captchaToken?: string | null) {
  return {
    redirectTo: passwordResetRedirect(origin),
    captchaToken: captchaToken || undefined,
  };
}

/**
 * Null means the send can show the public success copy.
 * An unknown address uses that same copy. A failed send (rate limit, SMTP)
 * says so, without the provider text or whether the account exists.
 */
export function passwordResetSendError(error: PasswordResetError): string | null {
  if (!error) return null;
  const captcha = captchaRetryMessage(error);
  if (captcha) return captcha;
  if (isSendFailure(error)) return PASSWORD_RESET_UNAVAILABLE;
  if (isUnknownAccount(error)) return null;
  return PASSWORD_RESET_FAILED;
}

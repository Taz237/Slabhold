import { captchaRetryMessage } from "@/lib/auth/captcha";
import { normalizeUsername, usernameError } from "@/lib/social/local-db";

/** Same characters and length as usernameError. */
export const USERNAME_HINT = "Letters, numbers, and underscores. 3–20 characters.";

/** Same minimum as the sign-up password check. */
export const PASSWORD_HINT = "At least 6 characters.";

export const TURNSTILE_CONTINUE = "Finish the check above to continue";

export const RESEND_COOLDOWN_SECONDS = 60;

export const RESEND_RATE_LIMIT = "Too many emails. Wait a minute and try again.";

export const RESEND_FAILED = "Couldn't resend that email. Try again.";

/** Same sentence for a real send and an unknown address. */
export const CONFIRM_RESEND_SENT =
  "If that email needs confirmation, we sent another link.";

export const CONFIRM_RESEND_LINK = "Didn't get your confirmation email? Resend it";

export const CONFIRM_RESEND_HINT =
  "Enter your email and we'll send another confirmation if one is waiting.";

export const EMAIL_NOT_CONFIRMED = "Confirm your email before logging in. You can resend it below.";

/**
 * Extra room under the auth form so a 390px phone can scroll the submit
 * button above the keyboard. Not a fixed height.
 */
export const AUTH_FORM_SCROLL = "pb-[45svh] min-[640px]:pb-0";

export function signupInboxCopy(email: string): string {
  return `Check your inbox at ${email} to confirm your account. It usually arrives within a minute. Check spam too.`;
}

/** Server rule: normalize, then usernameError. The pattern is unchanged. */
export function usernameFieldError(value: string): string | null {
  return usernameError(normalizeUsername(value));
}

/** Server rule: password length under 6. Whitespace counts, same as sign-up. */
export function passwordFieldError(value: string): string | null {
  if (value.length < 6) return "Use at least 6 characters.";
  return null;
}

/** Server rule from local sign-up: a trimmed address must contain @. */
export function emailFieldError(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (!email.includes("@")) return "Enter a valid email.";
  return null;
}

/** True while a configured Turnstile widget has not issued a token. */
export function showTurnstileContinue(siteKey: string, token: string | null): boolean {
  return siteKey.trim().length > 0 && !token;
}

/** Clock for the resend cooldown. Kept out of the form so render stays pure. */
export function signupNow(): number {
  return Date.now();
}

export function resendCooldownSeconds(sentAt: number, now: number): number {
  if (!Number.isFinite(sentAt) || sentAt <= 0 || !Number.isFinite(now)) return 0;
  const leftMs = sentAt + RESEND_COOLDOWN_SECONDS * 1000 - now;
  if (leftMs <= 0) return 0;
  return Math.ceil(leftMs / 1000);
}

type ResendError = {
  message?: string | null;
  status?: number | null;
  code?: string | null;
} | null;

export function isSignupResendRateLimited(error: ResendError): boolean {
  if (!error) return false;
  if (error.status === 429) return true;
  const code = (error.code ?? "").toLowerCase();
  if (code.includes("rate_limit")) return true;
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("rate limit") ||
    message.includes("too many") ||
    message.includes("only request this after")
  );
}

/** Supabase sign-in when the password is right and the inbox link is still open. */
export function isEmailNotConfirmed(error: ResendError): boolean {
  if (!error) return false;
  const code = (error.code ?? "").toLowerCase();
  if (code === "email_not_confirmed") return true;
  return (error.message ?? "").toLowerCase().includes("email not confirmed");
}

/**
 * Missing and already-confirmed addresses use the same outcome as a real send.
 * Saying which one happened would tell a stranger whether the account exists.
 */
function isHiddenConfirmationAccount(error: NonNullable<ResendError>): boolean {
  const code = (error.code ?? "").toLowerCase();
  if (
    code === "user_not_found" ||
    code === "email_not_found" ||
    code === "email_exists" ||
    code === "user_already_exists"
  ) {
    return true;
  }
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("user not found") ||
    message.includes("no user found") ||
    message.includes("email not found") ||
    message.includes("already registered") ||
    message.includes("already confirmed") ||
    message.includes("already been registered")
  );
}

/** Null means the resend succeeded. The provider message is never returned. */
export function signupResendFeedback(
  error: ResendError,
): { message: string; rateLimited: boolean } | null {
  if (!error) return null;
  const captcha = captchaRetryMessage(error);
  if (captcha) return { message: captcha, rateLimited: false };
  const rateLimited = isSignupResendRateLimited(error);
  return { message: rateLimited ? RESEND_RATE_LIMIT : RESEND_FAILED, rateLimited };
}

/**
 * Login resend. Null means show CONFIRM_RESEND_SENT.
 * Unknown and already-confirmed addresses stay on that same sentence.
 */
export function loginResendFeedback(
  error: ResendError,
): { message: string; rateLimited: boolean } | null {
  if (!error || isHiddenConfirmationAccount(error)) return null;
  return signupResendFeedback(error);
}

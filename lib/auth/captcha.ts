export const CAPTCHA_RETRY = "Please complete the check and try again.";

/** Public Turnstile site key. Empty when local dev has not set one. */
export function turnstileSiteKey(): string {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";
}

/**
 * Sign-in submit stays disabled until Turnstile issues a token.
 * With no site key the check is skipped and submit is left to `busy` alone.
 */
export function submitBlocked(busy: boolean, token: string | null, siteKey?: string): boolean {
  const key = (siteKey ?? turnstileSiteKey()).trim();
  return busy || (key.length > 0 && !token);
}

export function isCaptchaError(
  error: { message?: string | null; code?: string | null } | null | undefined,
): boolean {
  if (!error) return false;
  if ((error.code ?? "").toLowerCase().includes("captcha")) return true;
  return (error.message ?? "").toLowerCase().includes("captcha");
}

/** Friendly copy for a Supabase captcha failure, or null when it is some other error. */
export function captchaRetryMessage(
  error: { message?: string | null; code?: string | null } | null | undefined,
): string | null {
  return isCaptchaError(error) ? CAPTCHA_RETRY : null;
}

/** Turnstile tokens are single-use, so a failed submit drops the token and the widget. */
export function releaseCaptcha(widget: { reset: () => void } | null, clearToken: () => void) {
  clearToken();
  widget?.reset();
}

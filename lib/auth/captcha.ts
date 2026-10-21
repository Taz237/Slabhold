export const CAPTCHA_RETRY = "Please complete the check and try again.";

export const CAPTCHA_LOAD_FAILED =
  "We couldn't load the security check. Turn off ad blockers for this site or try another browser, then reload.";

export type CaptchaWatch = {
  failed: boolean;
  interactive: boolean;
  /** The 15s load-failure timer runs only while this is true. */
  armed: boolean;
};

export function captchaWatchIdle(): CaptchaWatch {
  return { failed: false, interactive: false, armed: true };
}

/** Widget rendered. Silence is no longer a load failure. */
export function captchaOnActivity(state: CaptchaWatch): CaptchaWatch {
  return { failed: false, interactive: state.interactive, armed: false };
}

/**
 * `waiting` is Turnstile's before-interactive callback: pause the timer and
 * ask for a tap. `false` is after-interactive: the check was solved, so wait
 * again for the token.
 */
export function captchaOnInteractive(state: CaptchaWatch, waiting: boolean): CaptchaWatch {
  if (waiting) {
    if (state.interactive && !state.failed && !state.armed) return state;
    return { failed: false, interactive: true, armed: false };
  }
  return { failed: false, interactive: false, armed: true };
}

export function captchaOnToken(): CaptchaWatch {
  return { failed: false, interactive: false, armed: false };
}

export function captchaOnFail(): CaptchaWatch {
  return { failed: true, interactive: false, armed: false };
}

/** 15s elapsed. A paused interactive check must not become a load failure. */
export function captchaOnSilence(state: CaptchaWatch): CaptchaWatch {
  if (!state.armed || state.interactive) return state;
  return { failed: true, interactive: false, armed: false };
}

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

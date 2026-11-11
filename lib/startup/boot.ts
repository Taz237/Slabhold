/**
 * Cold start: the app's data client and first snapshot. If either fails, or
 * takes longer than BOOT_TIMEOUT_MS, the app says so with a Try again
 * instead of sitting on a blank screen.
 */

export const BOOT_TIMEOUT_MS = 12_000;

export const STARTUP_TITLE = "Can't connect right now";
export const STARTUP_DETAIL = "Check your connection and try again. Your cards and posts are safe.";
export const STARTUP_NOTICE = STARTUP_TITLE;
export const STARTUP_RETRY = "Try again";
export const STARTUP_RETRYING = "Trying again…";

/**
 * What a page shows when start-up fails. "screen": the page would be blank
 * (or hidden by CSS until the snapshot), so the error takes its place.
 * "notice": the page already shows something, so it stays with a notice on top.
 */
export function startupFallback(input: {
  loading: "plain" | "shell" | "bare" | "blank" | "chromeless";
  /** The page draws a signed-in shell that CSS hides until the snapshot. */
  seeded: boolean;
  signedIn: boolean;
}): "screen" | "notice" {
  if (input.signedIn) return "notice";
  if (input.loading === "blank" || input.loading === "bare") return "screen";
  if (input.seeded) return "screen";
  return "notice";
}

/** One timer for one start-up. Fails once: on a load error, or when the timer runs out first. */
export function createStartupWatch({
  onFail,
  schedule,
  cancel,
  timeoutMs = BOOT_TIMEOUT_MS,
}: {
  onFail: () => void;
  schedule: (fn: () => void, ms: number) => number;
  cancel: (id: number) => void;
  timeoutMs?: number;
}) {
  let timer: number | null = null;
  let settled = false;
  const clear = () => {
    if (timer != null) cancel(timer);
    timer = null;
  };
  return {
    start() {
      if (settled || timer != null) return;
      timer = schedule(() => {
        timer = null;
        if (settled) return;
        settled = true;
        onFail();
      }, timeoutMs);
    },
    ready() {
      settled = true;
      clear();
    },
    fail() {
      clear();
      if (settled) return;
      settled = true;
      onFail();
    },
    stop() {
      settled = true;
      clear();
    },
  };
}

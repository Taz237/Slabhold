/** Longest wait for an idle moment before the work runs anyway. */
export const IDLE_TIMEOUT_MS = 2000;

/** setTimeout stand-in where requestIdleCallback is missing (Safari). */
export const IDLE_FALLBACK_MS = 1200;

type IdleHost = {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
  setTimeout: (callback: () => void, ms: number) => number;
  clearTimeout: (handle: number) => void;
};

/**
 * Runs `work` once the page has loaded and the main thread is first idle, so
 * it never competes with the first paint or hydration. Returns a cancel.
 */
export function afterFirstIdle(work: () => void, host: IdleHost = window as unknown as IdleHost): () => void {
  let cancelled = false;
  let idleHandle: number | null = null;
  let timerHandle: number | null = null;
  const run = () => {
    if (!cancelled) work();
  };
  if (typeof host.requestIdleCallback === "function") {
    idleHandle = host.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
  } else {
    timerHandle = host.setTimeout(run, IDLE_FALLBACK_MS);
  }
  return () => {
    cancelled = true;
    if (idleHandle !== null) host.cancelIdleCallback?.(idleHandle);
    if (timerHandle !== null) host.clearTimeout(timerHandle);
  };
}

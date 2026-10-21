export const SAVE_TIMEOUT_MS = 25_000;

export const SAVE_TIMEOUT_MESSAGE =
  "Saving took too long. Check your connection and try again.";

export class SaveTimeoutError extends Error {
  constructor(message = SAVE_TIMEOUT_MESSAGE) {
    super(message);
    this.name = "SaveTimeoutError";
  }
}

export function isSaveTimeout(error: unknown): boolean {
  return error instanceof SaveTimeoutError;
}

/** Take the in-flight submit, or return false when one is already running. */
export function claimSubmit(held: { current: boolean }): boolean {
  if (held.current) return false;
  held.current = true;
  return true;
}

/**
 * Run work until it finishes or `ms` elapses. On the deadline the signal
 * aborts so work can stop and clean up; this promise rejects either way.
 * Work may still settle after the rejection so a late response can be discarded.
 */
export async function withSaveTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  ms = SAVE_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      if (settled) return;
      controller.abort();
      reject(new SaveTimeoutError());
    }, ms);
  });
  void timeout.catch(() => undefined);
  try {
    return await Promise.race([
      work(controller.signal).then((value) => {
        settled = true;
        return value;
      }),
      timeout,
    ]);
  } finally {
    settled = true;
    if (timer) clearTimeout(timer);
  }
}

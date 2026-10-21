export const SAVE_TIMEOUT_MS = 25_000;

export const SAVE_TIMEOUT_MESSAGE = "We couldn't confirm the save. Retry is safe.";

export class SaveTimeoutError extends Error {
  /** Public photo URL already stored, when this attempt uploaded one. */
  readonly photoUrl: string | null;

  constructor(photoUrl: string | null = null, message = SAVE_TIMEOUT_MESSAGE) {
    super(message);
    this.name = "SaveTimeoutError";
    this.photoUrl = photoUrl;
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
 * Stop waiting after `ms`. The work keeps running so a late success can land.
 * A timeout is an unknown outcome: callers must not delete rows or photos.
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
  const task = work(controller.signal).then(
    (value) => {
      settled = true;
      return value;
    },
    (error) => {
      settled = true;
      throw error;
    },
  );
  void task.catch(() => undefined);
  try {
    return await Promise.race([task, timeout]);
  } finally {
    settled = true;
    if (timer) clearTimeout(timer);
  }
}

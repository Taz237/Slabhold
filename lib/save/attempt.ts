export const SAVE_TIMEOUT_MS = 25_000;

export const SAVE_TIMEOUT_MESSAGE = "We couldn't confirm the save. Retry is safe.";

export const OFFLINE_SAVE_MESSAGE =
  "Couldn't save. Check your connection and tap Retry.";

export const CARDS_LOADING_MESSAGE = "Still loading your cards. Tap Retry.";

const OFFLINE_SAVE_TEXT =
  /^(?:failed to fetch|load failed|networkerror when attempting to fetch resource\.?)$/i;

/** A dropped network call, not a message from the server. */
export function saveFailureText(
  error: unknown,
  fallback = "Could not save this card.",
): string {
  const message = error instanceof Error ? error.message : "";
  if (message === "Card not found.") return CARDS_LOADING_MESSAGE;
  const stripped = message.replace(/^typeerror:\s*/i, "");
  if (OFFLINE_SAVE_TEXT.test(stripped)) return OFFLINE_SAVE_MESSAGE;
  if (message) return message;
  return fallback;
}

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

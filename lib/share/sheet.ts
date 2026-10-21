export type SharePayload = {
  title: string;
  text: string;
  url: string;
};

export type ShareResult = "shared" | "cancelled" | "copied" | "failed";

export function isShareAbort(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

/**
 * Native share sheet when the browser has one. Cancel does nothing.
 * Any other failure, or no share API, copies the same URL.
 */
export async function shareOrCopy(
  payload: SharePayload,
  deps: {
    share?: (data: SharePayload) => Promise<void>;
    copy: (url: string) => Promise<boolean>;
  },
): Promise<ShareResult> {
  if (typeof deps.share === "function") {
    try {
      await deps.share(payload);
      return "shared";
    } catch (error) {
      if (isShareAbort(error)) return "cancelled";
    }
  }
  const copied = await deps.copy(payload.url);
  return copied ? "copied" : "failed";
}

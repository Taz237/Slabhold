export type SharePayload = {
  title: string;
  text: string;
  url: string;
};

export type ShareResult = "shared" | "cancelled" | "copied" | "failed";

/** Title is the card name. Text is the post. A blank post falls back to the title. */
export function postSharePayload(input: {
  title: string;
  text?: string | null;
  url: string;
}): SharePayload {
  const title = input.title.replace(/\s+/g, " ").trim() || "Slabhold";
  const text = input.text?.replace(/\s+/g, " ").trim() || title;
  return { title, text, url: input.url };
}

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

/** iPhone and other native sheets first. No share API, or a failed one, opens our own sheet. */
export async function nativeShareOrSheet(
  payload: SharePayload,
  share: ((data: SharePayload) => Promise<void>) | undefined,
): Promise<"shared" | "cancelled" | "sheet"> {
  if (typeof share !== "function") return "sheet";
  try {
    await share(payload);
    return "shared";
  } catch (error) {
    return isShareAbort(error) ? "cancelled" : "sheet";
  }
}

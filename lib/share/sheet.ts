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

export type NativeShareData = SharePayload & { files?: File[] };

export type NativeShareOptions = {
  /** Clock for minCancelMs, e.g. performance.now. */
  now?: () => number;
  /**
   * An AbortError sooner than this is a share that failed to show, not a
   * person tapping Cancel. iOS rejects with AbortError for both.
   */
  minCancelMs?: number;
  /** Shared with the link when canShare accepts them. */
  files?: File[];
  canShare?: (data: NativeShareData) => boolean;
};

function withFiles(payload: SharePayload, options: NativeShareOptions): NativeShareData {
  const { files, canShare } = options;
  if (!files?.length || typeof canShare !== "function") return payload;
  const data = { ...payload, files };
  try {
    return canShare(data) ? data : payload;
  } catch {
    return payload;
  }
}

/**
 * iPhone and other native sheets first. No share API, or a failed one, opens our own sheet.
 * With minCancelMs, an AbortError that comes back too fast opens our sheet too.
 */
export async function nativeShareOrSheet(
  payload: SharePayload,
  share: ((data: NativeShareData) => Promise<void>) | undefined,
  options?: NativeShareOptions,
): Promise<"shared" | "cancelled" | "sheet"> {
  if (typeof share !== "function") return "sheet";
  const data = options ? withFiles(payload, options) : payload;
  const now = options?.now ?? Date.now;
  const started = now();
  try {
    await share(data);
    return "shared";
  } catch (error) {
    if (options && process.env.NODE_ENV !== "production") {
      console.info("[share]", (error as { name?: unknown } | null)?.name);
    }
    if (!isShareAbort(error)) return "sheet";
    const minCancelMs = options?.minCancelMs;
    if (typeof minCancelMs === "number" && now() - started < minCancelMs) return "sheet";
    return "cancelled";
  }
}

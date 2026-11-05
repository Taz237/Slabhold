import { isNativeApp } from "@/lib/ios/platform";
import type { NativeShareData } from "@/lib/share/sheet";

/** The iOS plugin rejects Cancel with this message. */
const CANCELED = /cancel/i;

/** Cancel on the iOS sheet becomes the web's AbortError, so callers treat both alike. */
export function asShareAbort(error: unknown): unknown {
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message === "string" && CANCELED.test(message)) {
    const abort = new Error(message);
    abort.name = "AbortError";
    return abort;
  }
  return error;
}

/** The iOS share sheet. Links only: the plugin takes file paths, not Files. */
export async function nativeShare(data: NativeShareData): Promise<void> {
  const { Share } = await import("@capacitor/share");
  try {
    await Share.share({ title: data.title, text: data.text, url: data.url, dialogTitle: data.title });
  } catch (error) {
    throw asShareAbort(error);
  }
}

/** The share sheet to use: the app's native one, the browser's, or none. */
export function shareFunction(): ((data: NativeShareData) => Promise<void>) | undefined {
  if (isNativeApp()) return nativeShare;
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return undefined;
  return navigator.share.bind(navigator);
}
